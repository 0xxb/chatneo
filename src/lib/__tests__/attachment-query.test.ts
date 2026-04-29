import { describe, it, expect } from 'vitest';
import { filterAttachments, type AttachmentRecord } from '../attachment-query';

const sampleAttachments: AttachmentRecord[] = [
  { id: '1', type: 'image', name: 'Photo.png', path: '/path/photo.png', created_at: 1000 },
  { id: '2', type: 'file', name: 'document.pdf', path: '/path/doc.pdf', created_at: 2000 },
  { id: '3', type: 'image', name: 'Screenshot_2024.jpg', path: '/path/ss.jpg', created_at: 3000 },
  { id: '4', type: 'file', name: 'README.md', path: '/path/readme.md', created_at: 4000 },
];

describe('filterAttachments', () => {
  it('returns all attachments when keyword is empty', () => {
    expect(filterAttachments(sampleAttachments, '')).toEqual(sampleAttachments);
  });

  it('filters by keyword case-insensitively', () => {
    const result = filterAttachments(sampleAttachments, 'photo');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('matches partial file names', () => {
    const result = filterAttachments(sampleAttachments, 'doc');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('document.pdf');
  });

  it('matches uppercase keyword against lowercase name', () => {
    const result = filterAttachments(sampleAttachments, 'README');
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('4');
  });

  it('returns empty array when no match', () => {
    const result = filterAttachments(sampleAttachments, 'nonexistent');
    expect(result).toHaveLength(0);
  });

  it('handles empty attachments array', () => {
    expect(filterAttachments([], 'test')).toEqual([]);
  });

  it('matches multiple attachments', () => {
    const result = filterAttachments(sampleAttachments, '.'); // all have dots
    expect(result).toHaveLength(4);
  });
});
