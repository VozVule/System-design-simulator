// Explicit development-only injection for acceptance tests. This module is excluded from production.
import { BrowserArchitectureStore } from './lib/storage';
import type { ArchitectureStore } from './lib/storage';
export interface StudioTestControl { holdNextSave: () => void; releaseSave: () => void }
declare global { interface Window { __studioTest?: StudioTestControl } }
export function controlledStore(): ArchitectureStore {
  const store = new BrowserArchitectureStore();
  let gate: Promise<void> | null = null, release: (() => void) | undefined;
  window.__studioTest = { holdNextSave: () => { gate = new Promise<void>((resolve) => release = resolve); }, releaseSave: () => { release?.(); gate = null; } };
  return {
    create: async (write) => { if (gate) await gate; return store.create(write); },
    replace: async (id, write) => { if (gate) await gate; return store.replace(id, write); },
    list: () => store.list(), get: (id) => store.get(id), delete: (id) => store.delete(id),
  };
}
