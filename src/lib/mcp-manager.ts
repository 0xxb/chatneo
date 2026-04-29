/**
 * MCP Client Manager — 管理所有 MCP Server 连接，发现并暴露工具。
 *
 * 跨窗口策略：
 *   - 真正的 stdio/SSE 连接只在主窗口（带 data-chat-window 属性）里建立，因为聊天 tools
 *     也只在主窗口被组装。设置窗口调用 connect/disconnect 时会转成 Tauri 事件发给主窗口执行。
 *   - 主窗口在每次状态变化后广播 `mcp:snapshot` 事件，其他窗口据此镜像 status/tools，
 *     用于 UI 渲染。
 */
import { tool, zodSchema } from 'ai';
import { z } from 'zod/v4';
import { emit, listen } from '@tauri-apps/api/event';
import { TauriStdioTransport, type JSONRPCMessage } from './mcp-stdio-transport';
import type { McpServerConfig } from './mcp-db';
import { getAllMcpServers } from './mcp-db';
import { logger } from './logger';
import { isChatWindow } from './utils';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTool = ReturnType<typeof tool<any, any>>;

export type McpConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

interface McpToolInfo {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
}

interface McpClientInstance {
  config: McpServerConfig;
  transport: TauriStdioTransport | null;
  status: McpConnectionStatus;
  tools: McpToolInfo[];
  pendingRequests: Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>;
  nextId: number;
}

/** 跨窗口事件定义 */
const EVT_REQ_CONNECT = 'mcp:request-connect';
const EVT_REQ_DISCONNECT = 'mcp:request-disconnect';
const EVT_REQ_RECONNECT_ALL = 'mcp:request-reconnect-all';
const EVT_REQ_SNAPSHOT = 'mcp:request-snapshot';
const EVT_SNAPSHOT = 'mcp:snapshot';

type MirroredEntry = { status: McpConnectionStatus; tools: McpToolInfo[] };
type SnapshotPayload = Array<[string, MirroredEntry]>;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertSingleType(p: Record<string, unknown>): z.ZodType<any> {
  let field: z.ZodType;

  // Handle enum constraint on string type
  if (p.enum && Array.isArray(p.enum)) {
    const values = p.enum as [string, ...string[]];
    if (values.length > 0) {
      field = z.enum(values);
    } else {
      field = z.string();
    }
  } else {
    switch (p.type) {
      case 'string':
        field = z.string();
        break;
      case 'number':
      case 'integer':
        field = z.number();
        break;
      case 'boolean':
        field = z.boolean();
        break;
      case 'array': {
        const items = p.items as Record<string, unknown> | undefined;
        field = items ? z.array(convertSingleType(items)) : z.array(z.unknown());
        break;
      }
      case 'object': {
        if (p.properties) {
          field = convertSchema(p as Record<string, unknown>);
        } else {
          field = z.record(z.string(), z.unknown());
        }
        break;
      }
      default:
        field = z.unknown();
    }
  }

  if (p.description) {
    field = field.describe(p.description as string);
  }

  return field;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function convertSchema(schema: Record<string, unknown>): z.ZodType<any> {
  if (schema.properties) {
    const properties = schema.properties as Record<string, unknown>;
    const required = new Set((schema.required as string[]) ?? []);
    const shape: Record<string, z.ZodType> = {};
    for (const [key, prop] of Object.entries(properties)) {
      let field = convertSingleType(prop as Record<string, unknown>);
      if (!required.has(key)) {
        field = z.optional(field);
      }
      shape[key] = field;
    }
    return z.object(shape);
  }
  return convertSingleType(schema);
}

class McpClientManager {
  private clients = new Map<string, McpClientInstance>();
  private listeners = new Set<() => void>();
  private connectingLocks = new Set<string>();
  private toolCache: Record<string, AnyTool> | null = null;
  /** 非主窗口从主窗口同步得到的快照（包含 tools 供 settings 页渲染） */
  private mirrored = new Map<string, MirroredEntry>();

  constructor() {
    if (isChatWindow()) {
      // 主窗口：监听其他窗口发来的命令，在本地 mcpManager 上执行
      listen<{ config: McpServerConfig }>(EVT_REQ_CONNECT, ({ payload }) => {
        this.connectLocal(payload.config).catch((e) =>
          logger.warn('mcp', `跨窗口连接失败: ${e instanceof Error ? e.message : String(e)}`),
        );
      });
      listen<{ id: string }>(EVT_REQ_DISCONNECT, ({ payload }) => {
        this.disconnectLocal(payload.id).catch((e) =>
          logger.warn('mcp', `跨窗口断开失败: ${e instanceof Error ? e.message : String(e)}`),
        );
      });
      listen(EVT_REQ_RECONNECT_ALL, () => {
        (async () => {
          await this.disconnectAllLocal();
          await this.connectAllLocal();
        })().catch((e) =>
          logger.warn('mcp', `跨窗口重连失败: ${e instanceof Error ? e.message : String(e)}`),
        );
      });
      // 其它窗口启动时会发这个请求，主窗口回以当前快照
      listen(EVT_REQ_SNAPSHOT, () => this.broadcastSnapshot());
    } else {
      // 非主窗口：订阅主窗口广播的快照，并主动拉一次
      listen<SnapshotPayload>(EVT_SNAPSHOT, ({ payload }) => {
        this.mirrored = new Map(payload);
        this.toolCache = null;
        this.listeners.forEach((fn) => fn());
      }).then(() => {
        emit(EVT_REQ_SNAPSHOT).catch(() => {});
      });
    }
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private broadcastPending = false;

  private notify() {
    this.toolCache = null;
    this.listeners.forEach((fn) => fn());
    if (isChatWindow()) this.scheduleBroadcast();
  }

  /** 合并连接过程中的多次状态跳变（connecting → connected），单次 microtask 只发一次。 */
  private scheduleBroadcast() {
    if (this.broadcastPending) return;
    this.broadcastPending = true;
    queueMicrotask(() => {
      this.broadcastPending = false;
      this.broadcastSnapshot();
    });
  }

  private broadcastSnapshot() {
    const payload: SnapshotPayload = Array.from(this.clients.entries()).map(
      ([id, inst]) => [id, { status: inst.status, tools: inst.tools }],
    );
    emit(EVT_SNAPSHOT, payload).catch(() => {});
  }

  async connect(config: McpServerConfig): Promise<void> {
    if (!isChatWindow()) {
      await emit(EVT_REQ_CONNECT, { config });
      return;
    }
    return this.connectLocal(config);
  }

  private async connectLocal(config: McpServerConfig): Promise<void> {
    if (this.connectingLocks.has(config.id)) return;
    this.connectingLocks.add(config.id);

    try {
      await this.disconnectLocal(config.id);

      const instance: McpClientInstance = {
        config,
        transport: null,
        status: 'connecting',
        tools: [],
        pendingRequests: new Map(),
        nextId: 1,
      };
      this.clients.set(config.id, instance);
      this.notify();

      try {
        if (config.transport === 'stdio') {
          await this.connectStdio(instance);
        } else {
          await this.connectSse(instance);
        }

        // Initialize MCP protocol
        await this.initialize(instance);

        // Discover tools
        const toolsResult = await this.sendRequest(instance, 'tools/list', {}) as {
          tools?: unknown;
        };
        const rawTools = toolsResult?.tools;
        instance.tools = Array.isArray(rawTools) ? rawTools.filter(
          (t): t is McpToolInfo => t != null && typeof t === 'object' && typeof (t as McpToolInfo).name === 'string',
        ) : [];
        instance.status = 'connected';
        logger.info('mcp', `已连接: ${config.name}, 工具数=${instance.tools.length}, 工具=[${instance.tools.map(t => t.name).join(', ')}]`);
        this.notify();
      } catch (e) {
        logger.error('mcp', `连接失败: ${config.name}, error=${e instanceof Error ? e.message : String(e)}`);
        instance.status = 'error';
        this.notify();
        throw e;
      }
    } finally {
      this.connectingLocks.delete(config.id);
    }
  }

  private async connectStdio(instance: McpClientInstance): Promise<void> {
    const config = instance.config;
    const transport = new TauriStdioTransport({
      command: config.command!,
      args: config.args,
      env: config.env,
    });

    transport.setMessageHandler((msg) => this.handleMessage(instance, msg));
    transport.setCloseHandler(() => {
      instance.status = 'disconnected';
      instance.transport = null;
      this.notify();
    });

    await transport.start();
    instance.transport = transport;
  }

  private async connectSse(_instance: McpClientInstance): Promise<void> {
    // SSE transport — 第二期实现
    throw new Error('SSE transport not yet implemented');
  }

  private async initialize(instance: McpClientInstance): Promise<void> {
    await this.sendRequest(instance, 'initialize', {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: { name: 'ChatNeo', version: '0.1.0' },
    });

    // Send initialized notification
    if (instance.transport) {
      await instance.transport.send({
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      });
    }
  }

  private sendRequest(instance: McpClientInstance, method: string, params: unknown): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = instance.nextId++;

      const timer = setTimeout(() => {
        if (instance.pendingRequests.has(id)) {
          instance.pendingRequests.delete(id);
          reject(new Error(`Request ${method} timed out`));
        }
      }, 30000);

      instance.pendingRequests.set(id, {
        resolve: (v: unknown) => { clearTimeout(timer); resolve(v); },
        reject: (e: Error) => { clearTimeout(timer); reject(e); },
      });

      const message: JSONRPCMessage = {
        jsonrpc: '2.0',
        id,
        method,
        params,
      };

      if (instance.transport) {
        instance.transport.send(message).catch((e) => {
          if (instance.pendingRequests.has(id)) {
            instance.pendingRequests.delete(id);
            clearTimeout(timer);
            reject(e);
          }
        });
      } else {
        instance.pendingRequests.delete(id);
        clearTimeout(timer);
        reject(new Error('Transport not available'));
      }
    });
  }

  private handleMessage(instance: McpClientInstance, msg: JSONRPCMessage) {
    // Response to a request
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = instance.pendingRequests.get(msg.id as number);
      if (pending) {
        instance.pendingRequests.delete(msg.id as number);
        if (msg.error) {
          pending.reject(new Error(msg.error.message));
        } else {
          pending.resolve(msg.result);
        }
      }
    }
    if (msg.method && msg.id === undefined) {
      console.debug('[MCP notification]', msg.method, msg.params);
    }
  }

  async disconnect(serverId: string): Promise<void> {
    if (!isChatWindow()) {
      await emit(EVT_REQ_DISCONNECT, { id: serverId });
      return;
    }
    return this.disconnectLocal(serverId);
  }

  private async disconnectLocal(serverId: string): Promise<void> {
    const instance = this.clients.get(serverId);
    if (!instance) return;
    logger.info('mcp', `断开连接: ${instance.config.name}`);

    for (const [, pending] of instance.pendingRequests) {
      pending.reject(new Error('Disconnected'));
    }
    instance.pendingRequests.clear();

    if (instance.transport) {
      await instance.transport.close();
      instance.transport = null;
    }
    instance.status = 'disconnected';
    instance.tools = [];
    this.clients.delete(serverId);
    this.notify();
  }

  getStatus(serverId: string): McpConnectionStatus {
    if (!isChatWindow()) return this.mirrored.get(serverId)?.status ?? 'disconnected';
    return this.clients.get(serverId)?.status ?? 'disconnected';
  }

  getServerTools(serverId: string): McpToolInfo[] {
    if (!isChatWindow()) return this.mirrored.get(serverId)?.tools ?? [];
    return this.clients.get(serverId)?.tools ?? [];
  }

  /** Get all connected servers' tools merged as AI SDK tools. 仅主窗口有执行权。 */
  getTools(): Record<string, AnyTool> {
    if (this.toolCache) return this.toolCache;
    if (!isChatWindow()) {
      // 非主窗口没有真实连接，聊天调用也不会发生在这里
      return (this.toolCache = {});
    }

    const result: Record<string, AnyTool> = {};
    for (const [serverId, instance] of this.clients) {
      if (instance.status !== 'connected') continue;
      for (const mcpTool of instance.tools) {
        const toolId = `mcp_${serverId}_${mcpTool.name}`;
        result[toolId] = this.wrapMcpTool(instance, mcpTool);
      }
    }

    this.toolCache = result;
    return result;
  }

  private wrapMcpTool(instance: McpClientInstance, mcpTool: McpToolInfo): AnyTool {
    // Build zod schema from JSON Schema input
    const inputSchema = mcpTool.inputSchema
      ? zodSchema(convertSchema(mcpTool.inputSchema))
      : zodSchema(z.object({}));

    return tool({
      description: mcpTool.description ?? mcpTool.name,
      inputSchema,
      execute: async (args) => {
        const start = Date.now();
        try {
          const result = await this.sendRequest(instance, 'tools/call', {
            name: mcpTool.name,
            arguments: args,
          });
          logger.info('mcp', `工具调用成功: server=${instance.config.name}, tool=${mcpTool.name}, 耗时=${Date.now() - start}ms`);
          return result;
        } catch (e) {
          logger.error('mcp', `工具调用失败: server=${instance.config.name}, tool=${mcpTool.name}, error=${e instanceof Error ? e.message : String(e)}, 耗时=${Date.now() - start}ms`);
          return { error: e instanceof Error ? e.message : String(e) };
        }
      },
    });
  }

  /** Get a snapshot of all client statuses for UI. */
  getSnapshot(): Map<string, { status: McpConnectionStatus; toolCount: number }> {
    const snap = new Map<string, { status: McpConnectionStatus; toolCount: number }>();
    if (!isChatWindow()) {
      for (const [id, entry] of this.mirrored) {
        snap.set(id, { status: entry.status, toolCount: entry.tools.length });
      }
      return snap;
    }
    for (const [id, instance] of this.clients) {
      snap.set(id, { status: instance.status, toolCount: instance.tools.length });
    }
    return snap;
  }

  async connectAll(): Promise<void> {
    if (!isChatWindow()) {
      await emit(EVT_REQ_RECONNECT_ALL);
      return;
    }
    return this.connectAllLocal();
  }

  private async connectAllLocal(): Promise<void> {
    const servers = await getAllMcpServers();
    const enabled = servers.filter((s) => s.enabled);
    logger.info('mcp', `连接所有 MCP 服务器: 总数=${servers.length}, 启用=${enabled.length}`);
    await Promise.allSettled(enabled.map((s) => this.connectLocal(s)));
  }

  async disconnectAll(): Promise<void> {
    if (!isChatWindow()) {
      // 非主窗口没有实际连接；需要完整重置时请调用 connectAll()（它会先清理再重连）
      return;
    }
    return this.disconnectAllLocal();
  }

  private async disconnectAllLocal(): Promise<void> {
    logger.info('mcp', `断开所有 MCP 服务器: 数量=${this.clients.size}`);
    await Promise.allSettled(
      Array.from(this.clients.keys()).map((id) => this.disconnectLocal(id)),
    );
  }
}

export const mcpManager = new McpClientManager();
