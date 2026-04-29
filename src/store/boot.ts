import { create } from 'zustand';

export type BootStatus = 'loading' | 'ready' | 'error';

interface BootState {
  status: BootStatus;
  /** 各启动步骤的失败原因（key=步骤名） */
  errors: Record<string, string>;
  setStatus: (status: BootStatus) => void;
  setError: (step: string, message: string) => void;
}

export const useBootStore = create<BootState>((set) => ({
  status: 'loading',
  errors: {},
  setStatus: (status) => set({ status }),
  setError: (step, message) =>
    set((s) => ({ errors: { ...s.errors, [step]: message } })),
}));
