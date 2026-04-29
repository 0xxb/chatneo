# MCP 服务

ChatNeo 支持 [MCP (Model Context Protocol)](https://modelcontextprotocol.io/) 协议，连接外部工具服务扩展 AI 能力。

## 添加 MCP 服务

打开 **设置 > MCP 服务**，点击添加。

支持两种传输方式：

### stdio

通过本地进程通信，适用于本地工具。

| 字段 | 说明 |
|------|------|
| 名称 | 服务显示名称 |
| 命令 | 启动命令（如 `npx`、`node`） |
| 参数 | 命令参数列表 |
| 环境变量 | 传递给进程的环境变量 |

示例 - 文件系统工具：

```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-filesystem", "/path/to/dir"]
}
```

示例 - 数据库工具：

```json
{
  "command": "npx",
  "args": ["-y", "@modelcontextprotocol/server-sqlite", "path/to/db.sqlite"]
}
```

### SSE

通过 HTTP Server-Sent Events 通信，适用于远程服务。

| 字段 | 说明 |
|------|------|
| 名称 | 服务显示名称 |
| URL | SSE 端点地址 |
| Headers | 自定义请求头（如认证） |

示例：

```json
{
  "url": "http://localhost:3000/sse"
}
```

## 连接状态

每个 MCP 服务显示实时连接状态：

| 状态 | 说明 |
|------|------|
| 已断开 | 未连接 |
| 连接中 | 正在建立连接 |
| 已连接 | 连接正常，工具可用 |
| 错误 | 连接失败 |

## 工作原理

1. ChatNeo 作为 MCP 客户端连接到 MCP 服务
2. 通过 `tools/list` 发现服务提供的工具
3. 工具自动合并到对话的可用工具列表中
4. AI 根据需要调用 MCP 工具，通过 `tools/call` 执行
5. 工具结果返回给 AI 继续对话

MCP 工具与内置工具共享最大调用轮数限制。

<!-- TODO: 截图 - MCP 服务设置页面，展示已添加的服务和连接状态 -->
