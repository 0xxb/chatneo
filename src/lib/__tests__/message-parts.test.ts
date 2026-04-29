import { describe, it, expect } from 'vitest';
import { parseMessageParts, getPartsMediaPaths } from '../message-parts';

describe('parseMessageParts', () => {
  it('parses valid text parts', () => {
    const json = JSON.stringify([{ type: 'text', content: 'hello' }]);
    expect(parseMessageParts(json)).toEqual([{ type: 'text', content: 'hello' }]);
  });

  it('parses mixed media parts', () => {
    const parts = [
      { type: 'text', content: 'description' },
      { type: 'image', path: '/img.png', mediaType: 'image/png' },
      { type: 'video', path: '/vid.mp4', mediaType: 'video/mp4' },
      { type: 'audio', path: '/aud.mp3', mediaType: 'audio/mpeg' },
    ];
    expect(parseMessageParts(JSON.stringify(parts))).toEqual(parts);
  });

  it('returns empty array for empty string', () => {
    expect(parseMessageParts('')).toEqual([]);
  });

  it('returns empty array for invalid JSON', () => {
    expect(parseMessageParts('not json')).toEqual([]);
  });

  it('returns empty array for non-media array', () => {
    expect(parseMessageParts(JSON.stringify([{ type: 'unknown', data: 'x' }]))).toEqual([]);
  });

  it('returns empty array for empty array', () => {
    expect(parseMessageParts('[]')).toEqual([]);
  });

  it('returns empty array for JSON object (not array)', () => {
    expect(parseMessageParts('{"type":"text"}')).toEqual([]);
  });
});

describe('getPartsMediaPaths', () => {
  it('extracts paths from media parts', () => {
    const parts = [
      { type: 'text', content: 'hi' },
      { type: 'image', path: '/a.png', mediaType: 'image/png' },
      { type: 'video', path: '/b.mp4', mediaType: 'video/mp4' },
    ];
    expect(getPartsMediaPaths(JSON.stringify(parts))).toEqual(['/a.png', '/b.mp4']);
  });

  it('returns empty array for null', () => {
    expect(getPartsMediaPaths(null)).toEqual([]);
  });

  it('returns empty array for undefined', () => {
    expect(getPartsMediaPaths(undefined)).toEqual([]);
  });

  it('returns empty array for text-only parts', () => {
    const parts = [{ type: 'text', content: 'hello' }];
    expect(getPartsMediaPaths(JSON.stringify(parts))).toEqual([]);
  });
});
