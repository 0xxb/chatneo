import { describe, it, expect, vi } from 'vitest';

vi.mock('../db', () => ({ getDb: vi.fn() }));
vi.mock('../dao/message-dao', () => ({ getMessages: vi.fn() }));
vi.mock('../dao/attachment-dao', () => ({ getAttachmentsByConversation: vi.fn() }));
vi.mock('../dao/provider-dao', () => ({ getProviderById: vi.fn() }));
vi.mock('../attachments', () => ({
  readImageAsDataUrl: vi.fn(),
  readFileAsDataUrl: vi.fn(),
  getFileSize: vi.fn(),
}));
vi.mock('../logger', () => ({
  logger: { info: vi.fn(), error: vi.fn(), warn: vi.fn() },
}));
vi.mock('../apply-settings', () => ({
  getSettingValue: vi.fn(),
  PRESET_BACKGROUNDS: {},
}));
vi.mock('@tauri-apps/plugin-dialog', () => ({ save: vi.fn() }));
vi.mock('@tauri-apps/plugin-fs', () => ({ writeFile: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/path', () => ({ basename: vi.fn() }));

import { roleLabel, ROLE_LABELS, getImageParts, getVideoParts } from '../../utils/export-conversation';

describe('export-conversation', () => {
  describe('roleLabel', () => {
    it('returns 用户 for user', () => {
      expect(roleLabel('user')).toBe('用户');
    });

    it('returns 助手 for assistant', () => {
      expect(roleLabel('assistant')).toBe('助手');
    });

    it('returns 错误 for error', () => {
      expect(roleLabel('error')).toBe('错误');
    });

    it('returns raw role for unknown roles', () => {
      expect(roleLabel('system')).toBe('system');
    });
  });

  describe('ROLE_LABELS', () => {
    it('contains all expected roles', () => {
      expect(ROLE_LABELS).toEqual({ user: '用户', assistant: '助手', error: '错误' });
    });
  });

  describe('getImageParts', () => {
    it('returns image parts from message', () => {
      const msg = {
        id: 'm1', role: 'assistant', content: '',
        parts: JSON.stringify([
          { type: 'image', path: '/img.png', revisedPrompt: '猫' },
          { type: 'video', path: '/vid.mp4' },
          { type: 'image', path: '/img2.png' },
        ]),
      } as any;
      const result = getImageParts(msg);
      expect(result).toHaveLength(2);
      expect(result[0].path).toBe('/img.png');
      expect(result[1].path).toBe('/img2.png');
    });

    it('returns empty array when no parts', () => {
      const msg = { id: 'm1', role: 'assistant', content: '', parts: '' } as any;
      expect(getImageParts(msg)).toEqual([]);
    });

    it('returns empty array for null parts', () => {
      const msg = { id: 'm1', role: 'assistant', content: '', parts: null } as any;
      expect(getImageParts(msg)).toEqual([]);
    });
  });

  describe('getVideoParts', () => {
    it('returns video parts from message', () => {
      const msg = {
        id: 'm1', role: 'assistant', content: '',
        parts: JSON.stringify([
          { type: 'image', path: '/img.png' },
          { type: 'video', path: '/vid.mp4' },
        ]),
      } as any;
      const result = getVideoParts(msg);
      expect(result).toHaveLength(1);
      expect(result[0].path).toBe('/vid.mp4');
    });

    it('returns empty array when no video parts', () => {
      const msg = {
        id: 'm1', role: 'assistant', content: '',
        parts: JSON.stringify([{ type: 'image', path: '/img.png' }]),
      } as any;
      expect(getVideoParts(msg)).toEqual([]);
    });
  });
});
