import { ComponentType } from '../src/lib/domain/component-types';
import { describe, expect, it } from 'vitest';
import { BrowserArchitectureStore, storageKey } from '../src/lib/storage';
import { newEditor } from '../src/lib/editor';
import { newComponent } from '../src/lib/domain';
function memory(): { getItem: (key: string) => string | null; setItem: (key: string, value: string) => void } {
  const values = new Map<string, string>(); return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => { values.set(key, value); } };
}
describe('placeholder library contract', () => {
  it('retains only successful saved snapshots and survives a new adapter instance', async () => {
    const port = memory(), store = new BrowserArchitectureStore(() => port, () => 1000);
    const write = newEditor().write; const created = await store.create(write); write.name = 'Unsaved';
    expect((await new BrowserArchitectureStore(() => port).get(created.id)).name).toBe('Untitled architecture');
    const replaced = await store.replace(created.id, write); expect(replaced.created_at).toBe(created.created_at); expect(replaced.updated_at > created.updated_at).toBe(true);
    expect((await store.list())).toHaveLength(1); expect((await store.replace(created.id, write)).updated_at).toBe(replaced.updated_at);
  });
  it('replaces complete documents and allows identical names', async () => {
    const port = memory(), store = new BrowserArchitectureStore(() => port); const write = newEditor().write;
    write.document.nodes.push(newComponent(ComponentType.SERVER, { x: -20.5, y: 3 }, 'node'));
    const first = await store.create(write), second = await store.create(write);
    expect(first.id).not.toBe(second.id); expect(await store.list()).toHaveLength(2);
    const replaced = await store.replace(first.id, newEditor().write); expect(replaced.document.nodes).toEqual([]);
    await store.delete(first.id); await expect(store.get(first.id)).rejects.toThrow('no longer exists'); await expect(store.replace(first.id, write)).rejects.toThrow('no longer exists'); await expect(store.delete(first.id)).rejects.toThrow('no longer exists');
  });
  it('does not overwrite stored content or timestamps when a write fails', async () => {
    const port = memory(); let fail = false;
    const store = new BrowserArchitectureStore(() => ({ ...port, setItem: (key, value) => { if (fail) throw new Error('Quota'); port.setItem(key, value); } }));
    const created = await store.create(newEditor().write), before = port.getItem(storageKey); fail = true;
    await expect(store.replace(created.id, { ...newEditor().write, name: 'Changed' })).rejects.toThrow('could not save');
    await expect(store.delete(created.id)).rejects.toThrow('could not save'); expect(port.getItem(storageKey)).toBe(before); expect(await store.get(created.id)).toEqual(created);
  });
  it.each(['broken json', '{"store_version":2,"items":[]}', '{"store_version":1,"items":[{}]}'])('does not clear corrupt or unsupported storage', async (value) => {
    const port = memory(); port.setItem(storageKey, value); const store = new BrowserArchitectureStore(() => port);
    await expect(store.list()).rejects.toThrow(); await expect(store.create(newEditor().write)).rejects.toThrow(); expect(port.getItem(storageKey)).toBe(value);
  });
});
