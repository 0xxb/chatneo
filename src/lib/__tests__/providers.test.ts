import { describe, it, expect } from 'vitest';
import { stripTrailingSlashes, resolveBaseURL, type ProviderConfig } from '../providers/types';
import { DEFAULT_BASE_URLS } from '../providers/defaults';

describe('stripTrailingSlashes', () => {
  it('removes single trailing slash', () => {
    expect(stripTrailingSlashes('https://api.example.com/')).toBe('https://api.example.com');
  });

  it('removes multiple trailing slashes', () => {
    expect(stripTrailingSlashes('https://api.example.com///')).toBe('https://api.example.com');
  });

  it('returns unchanged URL without trailing slash', () => {
    expect(stripTrailingSlashes('https://api.example.com')).toBe('https://api.example.com');
  });

  it('handles path with trailing slash', () => {
    expect(stripTrailingSlashes('https://api.example.com/v1/')).toBe('https://api.example.com/v1');
  });

  it('handles empty string', () => {
    expect(stripTrailingSlashes('')).toBe('');
  });
});

describe('resolveBaseURL', () => {
  it('uses config baseURL when provided', () => {
    const config: ProviderConfig = { providerType: 'openai', baseURL: 'https://custom.api.com/v1/' };
    expect(resolveBaseURL(config)).toBe('https://custom.api.com/v1');
  });

  it('uses fallback when config baseURL is empty', () => {
    const config: ProviderConfig = { providerType: 'openai', baseURL: '' };
    expect(resolveBaseURL(config, 'https://fallback.com/v1')).toBe('https://fallback.com/v1');
  });

  it('uses fallback when config baseURL is whitespace', () => {
    const config: ProviderConfig = { providerType: 'openai', baseURL: '  ' };
    expect(resolveBaseURL(config, 'https://fallback.com')).toBe('https://fallback.com');
  });

  it('returns undefined when no URL and no fallback', () => {
    const config: ProviderConfig = { providerType: 'openai' };
    expect(resolveBaseURL(config)).toBeUndefined();
  });

  it('trims whitespace from config baseURL', () => {
    const config: ProviderConfig = { providerType: 'openai', baseURL: '  https://api.com/v1  ' };
    expect(resolveBaseURL(config)).toBe('https://api.com/v1');
  });
});

describe('DEFAULT_BASE_URLS', () => {
  it('contains all major providers', () => {
    const expectedProviders = ['openai', 'anthropic', 'google', 'deepseek', 'groq', 'perplexity', 'openrouter'];
    for (const provider of expectedProviders) {
      expect(DEFAULT_BASE_URLS[provider]).toBeDefined();
    }
  });

  it('all URLs start with https://', () => {
    for (const [, url] of Object.entries(DEFAULT_BASE_URLS)) {
      expect(url).toMatch(/^https:\/\//);
    }
  });

  it('no URLs end with trailing slash', () => {
    for (const [, url] of Object.entries(DEFAULT_BASE_URLS)) {
      expect(url).not.toMatch(/\/$/);
    }
  });
});
