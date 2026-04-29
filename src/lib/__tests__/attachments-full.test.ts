import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockAppDataDir = vi.fn().mockResolvedValue('/app/data');
const mockJoin = vi.fn((...parts: string[]) => parts.join('/'));
const mockMkdir = vi.fn().mockResolvedValue(undefined);
const mockWriteFile = vi.fn().mockResolvedValue(undefined);
const mockReadFile = vi.fn().mockResolvedValue(new Uint8Array([72, 101, 108, 108, 111])); // "Hello"
const mockExists = vi.fn().mockResolvedValue(true);
const mockRemove = vi.fn().mockResolvedValue(undefined);
const mockStatSize = vi.fn().mockResolvedValue(1024);
const mockConvertFileSrc = vi.fn((path: string) => `asset://localhost/${path}`);

vi.mock('@tauri-apps/api/path', () => ({
  appDataDir: () => mockAppDataDir(),
  join: (...args: string[]) => mockJoin(...args),
}));
vi.mock('@tauri-apps/plugin-fs', () => ({
  mkdir: (...args: unknown[]) => mockMkdir(...args),
  writeFile: (...args: unknown[]) => mockWriteFile(...args),
  readFile: (...args: unknown[]) => mockReadFile(...args),
  exists: (...args: unknown[]) => mockExists(...args),
  remove: (...args: unknown[]) => mockRemove(...args),
  size: (...args: unknown[]) => mockStatSize(...args),
}));
vi.mock('@tauri-apps/api/core', () => ({
  convertFileSrc: (path: string) => mockConvertFileSrc(path),
}));

import {
  ensureAttachmentsDir,
  saveImageFile,
  saveMediaFromBytes,
  getAttachmentUrl,
  copyFileToAttachments,
  deleteAttachmentFile,
  cacheImageDataUrl,
  readImageAsDataUrl,
  resolveImageDataUrl,
  readFileAsDataUrl,
  getFileSize,
} from '../attachments';

describe('attachments (full)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('ensureAttachmentsDir', () => {
    it('creates directory and returns path', async () => {
      const dir = await ensureAttachmentsDir();
      expect(dir).toBe('/app/data/attachments');
      expect(mockMkdir).toHaveBeenCalledWith('/app/data/attachments', { recursive: true });
    });
  });

  describe('saveImageFile', () => {
    it('saves base64 data URL as file', async () => {
      // Use valid base64 (Buffer.from('test').toString('base64') = 'dGVzdA==')
      const dataUrl = 'data:image/png;base64,dGVzdA==';
      const path = await saveImageFile(dataUrl);
      expect(path).toContain('.png');
      expect(mockWriteFile).toHaveBeenCalled();
    });

    it('detects jpeg extension', async () => {
      const dataUrl = 'data:image/jpeg;base64,dGVzdA==';
      const path = await saveImageFile(dataUrl);
      expect(path).toContain('.jpg');
    });
  });

  describe('saveMediaFromBytes', () => {
    it('saves bytes with correct extension', async () => {
      const bytes = new Uint8Array([1, 2, 3]);
      const path = await saveMediaFromBytes(bytes, 'image/png');
      expect(path).toContain('.png');
      expect(mockWriteFile).toHaveBeenCalledWith(path, bytes);
    });

    it('falls back to png for unknown mime', async () => {
      const bytes = new Uint8Array([1]);
      const path = await saveMediaFromBytes(bytes, 'application/unknown');
      expect(path).toContain('.png');
    });

    it('uses correct extension for video', async () => {
      const bytes = new Uint8Array([0]);
      const path = await saveMediaFromBytes(bytes, 'video/mp4');
      expect(path).toContain('.mp4');
    });
  });

  describe('getAttachmentUrl', () => {
    it('converts file path to asset URL', () => {
      const url = getAttachmentUrl('/path/to/file.png');
      expect(url).toBe('asset://localhost//path/to/file.png');
    });
  });

  describe('copyFileToAttachments', () => {
    it('reads source and saves to attachments dir', async () => {
      const path = await copyFileToAttachments('/external/doc.pdf');
      expect(mockReadFile).toHaveBeenCalledWith('/external/doc.pdf');
      expect(path).toContain('.pdf');
    });
  });

  describe('deleteAttachmentFile', () => {
    it('removes file when it exists', async () => {
      mockExists.mockResolvedValueOnce(true);
      await deleteAttachmentFile('/path/to/file.png');
      expect(mockRemove).toHaveBeenCalledWith('/path/to/file.png');
    });

    it('does nothing when file does not exist', async () => {
      mockExists.mockResolvedValueOnce(false);
      await deleteAttachmentFile('/path/nonexistent.png');
      expect(mockRemove).not.toHaveBeenCalled();
    });

    it('does not throw on error', async () => {
      mockExists.mockRejectedValueOnce(new Error('permission denied'));
      await expect(deleteAttachmentFile('/path/locked.png')).resolves.toBeUndefined();
    });
  });

  describe('cacheImageDataUrl + readImageAsDataUrl', () => {
    it('returns cached value', async () => {
      cacheImageDataUrl('/cached/img.png', 'data:image/png;base64,cached');
      const result = await readImageAsDataUrl('/cached/img.png');
      expect(result).toBe('data:image/png;base64,cached');
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('reads from disk when not cached', async () => {
      mockReadFile.mockResolvedValueOnce(new Uint8Array([65, 66])); // "AB"
      const result = await readImageAsDataUrl('/new/img.png');
      expect(result).toContain('data:image/png;base64,');
      expect(mockReadFile).toHaveBeenCalledWith('/new/img.png');
    });
  });

  describe('resolveImageDataUrl', () => {
    it('returns preview when it starts with data:', async () => {
      const result = await resolveImageDataUrl({ preview: 'data:image/png;base64,abc', path: '/path' });
      expect(result).toBe('data:image/png;base64,abc');
    });

    it('reads from path when no data URL preview', async () => {
      cacheImageDataUrl('/path/img.jpg', 'data:image/jpeg;base64,cached');
      const result = await resolveImageDataUrl({ preview: 'asset://something', path: '/path/img.jpg' });
      expect(result).toBe('data:image/jpeg;base64,cached');
    });
  });

  describe('readFileAsDataUrl', () => {
    it('reads file and returns data URL', async () => {
      mockReadFile.mockResolvedValueOnce(new Uint8Array([80, 68, 70]));
      const result = await readFileAsDataUrl('/path/doc.pdf');
      expect(result).toContain('data:application/pdf;base64,');
    });
  });

  describe('getFileSize', () => {
    it('returns file size', async () => {
      mockStatSize.mockResolvedValueOnce(2048);
      const size = await getFileSize('/path/file.txt');
      expect(size).toBe(2048);
    });

    it('returns null on error', async () => {
      mockStatSize.mockRejectedValueOnce(new Error('not found'));
      const size = await getFileSize('/nonexistent');
      expect(size).toBeNull();
    });
  });
});
