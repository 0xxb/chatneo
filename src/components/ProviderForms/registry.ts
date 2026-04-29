/**
 * Provider registry — 类型定义模块
 */
import type { ComponentType } from 'react';

// --- Form registry ---

export interface ProviderFormProps {
  config: Record<string, unknown>;
  onSave: (config: Record<string, unknown>) => void;
}

export type DefaultConfigFn = () => Record<string, unknown>;

// TODO: 重新实现 provider 表单注册机制
const formRegistry: Record<string, ComponentType<ProviderFormProps>> = {};
const defaultConfigRegistry: Record<string, DefaultConfigFn> = {};

export function registerProvider(
  type: string,
  component: ComponentType<ProviderFormProps>,
  defaultConfig?: DefaultConfigFn,
) {
  formRegistry[type] = component;
  if (defaultConfig) defaultConfigRegistry[type] = defaultConfig;
}

export function getProviderForm(type: string) {
  return formRegistry[type];
}

export function getDefaultConfig(type: string): Record<string, unknown> {
  return defaultConfigRegistry[type]?.() ?? {};
}

export function isImplemented(type: string) {
  return type in formRegistry;
}

// --- Model types (used by model management) ---

export interface ProviderModel {
  id: string;
  name: string;
}
