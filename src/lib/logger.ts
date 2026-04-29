import { invoke } from '@tauri-apps/api/core';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function log(level: LogLevel, target: string, message: string) {
  invoke('log_message', { level, target, message }).catch(() => {});
}

export const logger = {
  info: (target: string, message: string) => log('info', target, message),
  warn: (target: string, message: string) => log('warn', target, message),
  error: (target: string, message: string) => log('error', target, message),
  debug: (target: string, message: string) => log('debug', target, message),
};

export function logApiRequest(provider: string, model: string, status: 'success' | 'cancelled' | 'error', durationMs: number, tokens?: number | null) {
  invoke('log_api_request', { provider, model, status, tokens: tokens ?? null, durationMs }).catch(() => {});
}
