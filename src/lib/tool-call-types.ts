export interface ToolCallData {
  id: string;
  toolName: string;
  args: Record<string, unknown>;
  state: 'calling' | 'result' | 'error';
  result?: unknown;
  error?: string;
}
