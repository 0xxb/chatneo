import { describe, it, expect } from 'vitest';
import { stripTrailingSlashes, resolveBaseURL, type ProviderConfig } from '../providers/types';

describe('stripTrailingSlashes', () => {
  it('removes single trailing slash', () => {
    expect(stripTrailingSlashes('https://api.example.com/')).toBe('https://api.example.com');
  });

  it('removes multiple trailing slashes', () => {
    expect(stripTrailingSlashes('https://api.example.com///')).toBe('https://api.example.com');
  });

  it('does nothing when no trailing slash', () => {
    expect(stripTrailingSlashes('https://api.example.com')).toBe('https://api.example.com');
  });

  it('handles empty string', () => {
    expect(stripTrailingSlashes('')).toBe('');
  });

  it('preserves path slashes', () => {
    expect(stripTrailingSlashes('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
  });
});

describe('resolveBaseURL', () => {
  const baseConfig: ProviderConfig = { providerType: 'openai' };

  it('returns trimmed and stripped baseURL from config', () => {
    const config = { ...baseConfig, baseURL: '  https://api.openai.com/v1/  ' };
    expect(resolveBaseURL(config)).toBe('https://api.openai.com/v1');
  });

  it('uses fallback when baseURL is empty', () => {
    const config = { ...baseConfig, baseURL: '' };
    expect(resolveBaseURL(config, 'https://fallback.com/')).toBe('https://fallback.com');
  });

  it('uses fallback when baseURL is whitespace only', () => {
    const config = { ...baseConfig, baseURL: '   ' };
    expect(resolveBaseURL(config, 'https://fallback.com')).toBe('https://fallback.com');
  });

  it('returns undefined when no baseURL and no fallback', () => {
    expect(resolveBaseURL(baseConfig)).toBeUndefined();
  });

  it('returns undefined when baseURL is undefined and no fallback', () => {
    const config = { ...baseConfig, baseURL: undefined };
    expect(resolveBaseURL(config)).toBeUndefined();
  });

  it('prefers config baseURL over fallback', () => {
    const config = { ...baseConfig, baseURL: 'https://custom.com/' };
    expect(resolveBaseURL(config, 'https://fallback.com')).toBe('https://custom.com');
  });
});
