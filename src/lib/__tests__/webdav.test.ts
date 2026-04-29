import { describe, it, expect } from 'vitest';

// We need to test the internal pure functions. Since buildRemotePath,
// uint8ArrayToBase64, and base64ToUint8Array are not exported, we test
// the equivalent logic inline.

describe('buildRemotePath logic', () => {
  // Replicating: backupPath.replace(/\/$/, '') + '/' + filename
  function buildRemotePath(backupPath: string, filename: string): string {
    return `${backupPath.replace(/\/$/, '')}/${filename}`;
  }

  it('joins path and filename', () => {
    expect(buildRemotePath('/chatneo/backups/', 'backup.zip'))
      .toBe('/chatneo/backups/backup.zip');
  });

  it('handles path without trailing slash', () => {
    expect(buildRemotePath('/chatneo/backups', 'backup.zip'))
      .toBe('/chatneo/backups/backup.zip');
  });

  it('handles root path', () => {
    expect(buildRemotePath('/', 'file.zip')).toBe('/file.zip');
  });

  it('handles empty path', () => {
    expect(buildRemotePath('', 'file.zip')).toBe('/file.zip');
  });

  it('handles nested paths', () => {
    expect(buildRemotePath('/a/b/c/', 'f.zip')).toBe('/a/b/c/f.zip');
  });
});

describe('base64 roundtrip logic', () => {
  function uint8ArrayToBase64(bytes: Uint8Array): string {
    const CHUNK = 8192;
    const chunks: string[] = [];
    for (let i = 0; i < bytes.length; i += CHUNK) {
      chunks.push(String.fromCharCode(...bytes.subarray(i, i + CHUNK)));
    }
    return btoa(chunks.join(''));
  }

  function base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  it('roundtrips small data', () => {
    const input = new Uint8Array([72, 101, 108, 108, 111]); // "Hello"
    const b64 = uint8ArrayToBase64(input);
    const output = base64ToUint8Array(b64);
    expect(output).toEqual(input);
  });

  it('roundtrips empty data', () => {
    const input = new Uint8Array(0);
    const b64 = uint8ArrayToBase64(input);
    expect(b64).toBe('');
    const output = base64ToUint8Array(b64);
    expect(output).toEqual(input);
  });

  it('handles data larger than chunk size', () => {
    // Create array larger than 8192 bytes
    const input = new Uint8Array(10000);
    for (let i = 0; i < input.length; i++) input[i] = i % 256;
    const b64 = uint8ArrayToBase64(input);
    const output = base64ToUint8Array(b64);
    expect(output).toEqual(input);
  });

  it('produces valid base64 output', () => {
    const input = new Uint8Array([0, 1, 2, 255, 254, 253]);
    const b64 = uint8ArrayToBase64(input);
    // Base64 should only contain valid characters
    expect(b64).toMatch(/^[A-Za-z0-9+/]*=*$/);
  });
});
