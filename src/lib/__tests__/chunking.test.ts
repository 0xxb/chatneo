import { describe, it, expect } from 'vitest';
import { clampChunkParams, detectContentType, splitText, MIN_CHUNK_SIZE } from '../chunking';

describe('clampChunkParams', () => {
  it('returns default values for normal input', () => {
    expect(clampChunkParams(1000, 200)).toEqual({ chunkSize: 1000, chunkOverlap: 200 });
  });

  it('clamps chunk size to minimum', () => {
    expect(clampChunkParams(10, 5)).toEqual({ chunkSize: MIN_CHUNK_SIZE, chunkOverlap: 5 });
  });

  it('clamps overlap to be less than chunk size', () => {
    const result = clampChunkParams(500, 500);
    expect(result.chunkOverlap).toBe(499);
  });

  it('handles overlap greater than chunk size', () => {
    const result = clampChunkParams(500, 1000);
    expect(result.chunkOverlap).toBe(499);
  });

  it('handles zero values', () => {
    const result = clampChunkParams(0, 0);
    expect(result.chunkSize).toBe(1000); // fallback to 1000
    expect(result.chunkOverlap).toBe(0);
  });

  it('handles negative overlap', () => {
    const result = clampChunkParams(500, -10);
    expect(result.chunkOverlap).toBe(0);
  });

  it('floors floating point values', () => {
    const result = clampChunkParams(500.9, 200.7);
    expect(result.chunkSize).toBe(500);
    expect(result.chunkOverlap).toBe(200);
  });
});

describe('splitText', () => {
  it('splits long text into chunks', async () => {
    const text = 'Hello world. '.repeat(200);
    const chunks = await splitText(text, { chunkSize: 200, chunkOverlap: 50 });
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0].position).toBe(0);
    expect(chunks[1].position).toBe(1);
  });

  it('returns single chunk for short text', async () => {
    const chunks = await splitText('Short text', { chunkSize: 1000 });
    expect(chunks).toHaveLength(1);
    expect(chunks[0].content).toBe('Short text');
    expect(chunks[0].position).toBe(0);
  });

  it('uses default params when none provided', async () => {
    const text = 'A'.repeat(50);
    const chunks = await splitText(text);
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('supports markdown type', async () => {
    const md = '# Title\n\nParagraph 1\n\n## Section\n\nParagraph 2';
    const chunks = await splitText(md, { chunkSize: 200, type: 'markdown' });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });

  it('clamps invalid params instead of throwing', async () => {
    // chunkOverlap >= chunkSize would cause LangChain to throw without clamping
    const text = 'Test '.repeat(100);
    const chunks = await splitText(text, { chunkSize: 100, chunkOverlap: 200 });
    expect(chunks.length).toBeGreaterThanOrEqual(1);
  });
});

describe('detectContentType', () => {
  it('detects markdown files', () => {
    expect(detectContentType('readme.md')).toBe('markdown');
    expect(detectContentType('doc.markdown')).toBe('markdown');
  });

  it('returns plain for non-markdown files', () => {
    expect(detectContentType('file.txt')).toBe('plain');
    expect(detectContentType('code.ts')).toBe('plain');
    expect(detectContentType('data.json')).toBe('plain');
  });

  it('handles uppercase extensions', () => {
    expect(detectContentType('README.MD')).toBe('markdown');
  });

  it('handles files without extension', () => {
    expect(detectContentType('Makefile')).toBe('plain');
  });
});
