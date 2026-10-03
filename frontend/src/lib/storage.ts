import { z } from 'zod';
import { ArchitectureError, clone, equal, validateArchitecture, validateWrite } from './domain';
import type { Architecture, ArchitectureSummary, ArchitectureWrite } from './domain';

export interface ArchitectureStore {
  readonly storageKind: 'backend' | 'browser';
  create(write: ArchitectureWrite): Promise<Architecture>;
  list(): Promise<ArchitectureSummary[]>;
  get(id: string): Promise<Architecture>;
  replace(id: string, write: ArchitectureWrite): Promise<Architecture>;
  delete(id: string): Promise<void>;
}
export const storageKey = 'sysd.architecture-library.v1';
const envelopeSchema = z.strictObject({ store_version: z.literal(1), items: z.array(z.unknown()) });
type StoragePort = Pick<Storage, 'getItem' | 'setItem'>;

export class BrowserArchitectureStore implements ArchitectureStore {
  readonly storageKind = 'browser';
  constructor(private readonly storage: () => StoragePort = () => window.localStorage, private readonly now: () => number = Date.now) {}
  private read(): Architecture[] {
    let text: string | null;
    try { text = this.storage().getItem(storageKey); }
    catch { throw new ArchitectureError('storage_unavailable', 'Browser storage is unavailable. Your edits have not been saved.'); }
    if (text === null) return [];
    let value: unknown;
    try { value = JSON.parse(text); }
    catch { throw new ArchitectureError('internal_error', 'The local library is corrupt. It has not been reset or overwritten.'); }
    const parsed = envelopeSchema.safeParse(value);
    if (!parsed.success) throw new ArchitectureError('internal_error', 'The local library has a corrupt or unsupported storage format. It has not been changed.');
    const items = parsed.data.items.map(validateArchitecture);
    if (new Set(items.map((item) => item.id)).size !== items.length) throw new ArchitectureError('internal_error', 'The local library contains duplicate architecture IDs. It has not been changed.');
    return items;
  }
  private commit(items: Architecture[]): void {
    try { this.storage().setItem(storageKey, JSON.stringify({ store_version: 1, items })); }
    catch { throw new ArchitectureError('storage_unavailable', 'Browser storage could not save this change. Check available storage and retry. Your previous saved library is intact.'); }
  }
  private find(items: Architecture[], id: string): Architecture {
    const item = items.find((a) => a.id === id);
    if (!item) throw new ArchitectureError('architecture_not_found', 'This saved architecture no longer exists. Refresh the library. Your current work is intact.');
    return item;
  }
  async create(input: ArchitectureWrite): Promise<Architecture> {
    const write = validateWrite(input), items = this.read(), stamp = new Date(this.now()).toISOString();
    const resource: Architecture = { ...clone(write), id: crypto.randomUUID(), created_at: stamp, updated_at: stamp };
    this.commit([...items, resource]); return clone(resource);
  }
  async list(): Promise<ArchitectureSummary[]> {
    return this.read().sort((a, b) => b.updated_at.localeCompare(a.updated_at) || a.id.localeCompare(b.id)).map(({ document, ...metadata }) => ({ ...metadata, format_version: document.format_version }));
  }
  async get(id: string): Promise<Architecture> { return clone(this.find(this.read(), id)); }
  async replace(id: string, input: ArchitectureWrite): Promise<Architecture> {
    const write = validateWrite(input), items = this.read(), old = this.find(items, id);
    if (equal(write, { name: old.name, document: old.document })) return clone(old);
    const resource: Architecture = { ...clone(write), id, created_at: old.created_at, updated_at: new Date(Math.max(this.now(), Date.parse(old.updated_at) + 1)).toISOString() };
    this.commit(items.map((a) => a.id === id ? resource : a)); return clone(resource);
  }
  async delete(id: string): Promise<void> { const items = this.read(); this.find(items, id); this.commit(items.filter((a) => a.id !== id)); }
}
