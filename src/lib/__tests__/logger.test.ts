import { describe, it, expect, vi } from 'vitest';

const mockInvoke = vi.fn().mockResolvedValue(undefined);

vi.mock('@tauri-apps/api/core', () => ({
  invoke: (...args: unknown[]) => mockInvoke(...args),
}));

import { logger, logApiRequest } from '../logger';

describe('logger', () => {
  it('logger.info calls invoke with correct params', () => {
    logger.info('test', 'hello');
    expect(mockInvoke).toHaveBeenCalledWith('log_message', { level: 'info', target: 'test', message: 'hello' });
  });

  it('logger.warn calls invoke with warn level', () => {
    logger.warn('warn-target', 'warning msg');
    expect(mockInvoke).toHaveBeenCalledWith('log_message', { level: 'warn', target: 'warn-target', message: 'warning msg' });
  });

  it('logger.error calls invoke with error level', () => {
    logger.error('err-target', 'error msg');
    expect(mockInvoke).toHaveBeenCalledWith('log_message', { level: 'error', target: 'err-target', message: 'error msg' });
  });

  it('logger.debug calls invoke with debug level', () => {
    logger.debug('dbg', 'debug msg');
    expect(mockInvoke).toHaveBeenCalledWith('log_message', { level: 'debug', target: 'dbg', message: 'debug msg' });
  });

  it('does not throw when invoke rejects', () => {
    mockInvoke.mockRejectedValueOnce(new Error('ipc failed'));
    expect(() => logger.info('test', 'msg')).not.toThrow();
  });
});

describe('logApiRequest', () => {
  it('calls invoke with api request params', () => {
    logApiRequest('openai', 'gpt-4', 'success', 1500, 100);
    expect(mockInvoke).toHaveBeenCalledWith('log_api_request', {
      provider: 'openai',
      model: 'gpt-4',
      status: 'success',
      tokens: 100,
      durationMs: 1500,
    });
  });

  it('passes null for undefined tokens', () => {
    logApiRequest('anthropic', 'claude', 'error', 500);
    expect(mockInvoke).toHaveBeenCalledWith('log_api_request', expect.objectContaining({ tokens: null }));
  });

  it('does not throw when invoke rejects', () => {
    mockInvoke.mockRejectedValueOnce(new Error('ipc failed'));
    expect(() => logApiRequest('x', 'y', 'cancelled', 0)).not.toThrow();
  });
});
