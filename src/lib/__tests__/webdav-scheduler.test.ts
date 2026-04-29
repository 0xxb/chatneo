import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const { mockGetSettings, mockUploadBackup, mockEmit } = vi.hoisted(() => ({
  mockGetSettings: vi.fn(),
  mockUploadBackup: vi.fn(),
  mockEmit: vi.fn(),
}));

vi.mock('../dao/settings-dao', () => ({ getSettings: mockGetSettings }));
vi.mock('../webdav', () => ({ uploadBackup: mockUploadBackup }));
vi.mock('../logger', () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() } }));
vi.mock('../utils', () => ({ isChatWindow: () => true }));
vi.mock('@tauri-apps/api/event', () => ({
  emit: mockEmit,
  listen: vi.fn().mockResolvedValue(vi.fn()),
}));

import { initScheduler, stopScheduler, restartScheduler } from '../webdav-scheduler';

describe('webdav-scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    stopScheduler();
  });

  afterEach(() => {
    stopScheduler();
    vi.useRealTimers();
  });

  function setupSettings(overrides: Partial<Record<string, string>> = {}) {
    const defaults: Record<string, string> = {
      webdav_enabled: '1',
      webdav_backup_interval: '3600000', // 1 hour
      webdav_last_backup_time: '0',
      ...overrides,
    };
    mockGetSettings.mockResolvedValue(defaults);
  }

  it('schedules backup on init when enabled', async () => {
    setupSettings({ webdav_last_backup_time: String(Date.now()) });
    mockUploadBackup.mockResolvedValue(undefined);

    await initScheduler();

    // Timer should be set; advance past the interval to trigger backup
    await vi.advanceTimersByTimeAsync(3600001);
    expect(mockUploadBackup).toHaveBeenCalled();
  });

  it('does not schedule when disabled', async () => {
    setupSettings({ webdav_enabled: '0' });

    await initScheduler();

    vi.advanceTimersByTime(999999999);
    expect(mockUploadBackup).not.toHaveBeenCalled();
  });

  it('stopScheduler clears pending timer', async () => {
    setupSettings({ webdav_last_backup_time: String(Date.now()) });
    mockUploadBackup.mockResolvedValue(undefined);

    await initScheduler();
    stopScheduler();

    vi.advanceTimersByTime(999999999);
    expect(mockUploadBackup).not.toHaveBeenCalled();
  });

  it('restartScheduler re-initializes', async () => {
    setupSettings({ webdav_last_backup_time: String(Date.now()) });
    mockUploadBackup.mockResolvedValue(undefined);

    await restartScheduler();

    expect(mockGetSettings).toHaveBeenCalled();
  });

  it('runs backup immediately when elapsed exceeds interval', async () => {
    // Last backup was 2 hours ago, interval is 1 hour
    setupSettings({
      webdav_last_backup_time: String(Date.now() - 7200000),
      webdav_backup_interval: '3600000',
    });
    mockUploadBackup.mockResolvedValue(undefined);

    await initScheduler();

    // remaining = max(0, 3600000 - 7200000) = 0, so fires immediately
    await vi.advanceTimersByTimeAsync(0);
    expect(mockUploadBackup).toHaveBeenCalled();
  });

  it('handles backup failure gracefully', async () => {
    setupSettings({ webdav_last_backup_time: String(Date.now() - 7200000) });
    mockUploadBackup.mockRejectedValue(new Error('network error'));

    await initScheduler();

    // Should not throw; error is logged
    await vi.advanceTimersByTimeAsync(0);
    expect(mockUploadBackup).toHaveBeenCalled();
  });
});
