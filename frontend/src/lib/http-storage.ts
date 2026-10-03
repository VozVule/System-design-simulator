import { ArchitectureError, architectureListSchema, errorResponseSchema, validateArchitecture, validateWrite } from './domain';
import type { Architecture, ArchitectureSummary, ArchitectureWrite } from './domain';
import type { ArchitectureStore } from './storage';

/** The editor's persistence boundary; all reads and writes use the same backend library. */
export class HttpArchitectureStore implements ArchitectureStore {
  readonly storageKind = 'backend';
  constructor(
    private readonly baseUrl: string = import.meta.env.VITE_API_BASE_URL ?? 'http://127.0.0.1:8000',
    private readonly fetcher: typeof fetch = (input, init) => fetch(input, init),
    private readonly timeoutMs = 10_000,
  ) {}

  private async request(method: 'GET' | 'POST' | 'PUT' | 'DELETE', status: number, id?: string, write?: ArchitectureWrite): Promise<unknown> {
    const url = `${this.baseUrl.replace(/\/+$/, '')}/api/v1/architectures${id ? '/' + encodeURIComponent(id) : ''}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(url, {
        method, headers: write ? { Accept: 'application/json', 'Content-Type': 'application/json' } : { Accept: 'application/json' },
        ...(write ? { body: JSON.stringify(write) } : {}), signal: controller.signal,
      });
      if (response.status === 204 && status === 204) return undefined;
      let body: unknown;
      try { body = await response.json(); }
      catch {
        if (controller.signal.aborted) throw new DOMException('Request timed out', 'AbortError');
        throw new ArchitectureError('internal_error', 'The backend returned an unreadable response. Your working document has been kept.');
      }
      if (!response.ok) {
        const parsed = errorResponseSchema.safeParse(body);
        if (!parsed.success) throw new ArchitectureError('internal_error', 'The backend returned an unexpected error response. Your working document has been kept.');
        const error = parsed.data.error;
        throw new ArchitectureError(error.code, error.message, error.details);
      }
      if (response.status !== status) throw new ArchitectureError('internal_error', 'The backend returned an unexpected response status. Your working document has been kept.');
      return body;
    } catch (cause) {
      if (cause instanceof ArchitectureError) throw cause;
      throw new ArchitectureError('storage_unavailable', controller.signal.aborted
        ? 'The backend request timed out. Your edits are intact. Check the library before retrying a new Save.'
        : 'Could not reach the local backend. Your edits are intact. Start the backend and retry; check the library before retrying a new Save.');
    } finally { clearTimeout(timer); }
  }

  async create(write: ArchitectureWrite): Promise<Architecture> {
    return validateArchitecture(await this.request('POST', 201, undefined, validateWrite(write)));
  }
  async replace(id: string, write: ArchitectureWrite): Promise<Architecture> {
    const resource = validateArchitecture(await this.request('PUT', 200, id, validateWrite(write)));
    if (resource.id !== id) throw new ArchitectureError('internal_error', 'The backend returned a different architecture after Save. Your working document has been kept.');
    return resource;
  }
  async list(): Promise<ArchitectureSummary[]> {
    const parsed = architectureListSchema.safeParse(await this.request('GET', 200));
    if (!parsed.success) throw new ArchitectureError('internal_error', 'The backend returned an invalid architecture library.');
    return parsed.data.items;
  }
  async get(id: string): Promise<Architecture> {
    const resource = validateArchitecture(await this.request('GET', 200, id));
    if (resource.id !== id) throw new ArchitectureError('internal_error', 'The backend returned a different architecture. Your working document has been kept.');
    return resource;
  }
  async delete(id: string): Promise<void> { await this.request('DELETE', 204, id); }
}
