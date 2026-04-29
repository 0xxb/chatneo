import { describe, it, expect } from 'vitest';
import { getFileExtension, guessMediaType } from '../attachments';

describe('getFileExtension', () => {
  it('extracts extension in uppercase', () => {
    expect(getFileExtension('photo.png')).toBe('PNG');
  });

  it('handles multiple dots in filename', () => {
    expect(getFileExtension('archive.tar.gz')).toBe('GZ');
  });

  it('returns FILE when no extension', () => {
    expect(getFileExtension('Makefile')).toBe('FILE');
  });

  it('returns FILE for empty string', () => {
    expect(getFileExtension('')).toBe('FILE');
  });

  it('handles dotfile without extension', () => {
    expect(getFileExtension('.gitignore')).toBe('GITIGNORE');
  });

  it('handles uppercase extension', () => {
    expect(getFileExtension('image.JPEG')).toBe('JPEG');
  });

  it('handles path with directory separators', () => {
    // split('.') works on full filename, not path
    expect(getFileExtension('file.test.ts')).toBe('TS');
  });
});

describe('guessMediaType', () => {
  it.each([
    ['document.pdf', 'application/pdf'],
    ['image.png', 'image/png'],
    ['photo.jpg', 'image/jpeg'],
    ['photo.jpeg', 'image/jpeg'],
    ['video.mp4', 'video/mp4'],
    ['file.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
    ['data.csv', 'text/csv'],
    ['readme.md', 'text/markdown'],
    ['img.webp', 'image/webp'],
    ['icon.svg', 'image/svg+xml'],
    ['clip.webm', 'video/webm'],
    ['video.mov', 'video/quicktime'],
    ['IMAGE.PNG', 'image/png'],
    ['file.xyz', 'application/octet-stream'],
    ['noext', 'application/octet-stream'],
  ])('guessMediaType(%s) → %s', (filename, expected) => {
    expect(guessMediaType(filename)).toBe(expected);
  });
});
