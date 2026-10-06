import { ComponentType } from '../src/lib/domain/component-types';
import { describe, expect, it, vi } from 'vitest';
import { HttpArchitectureStore } from '../src/lib/http-storage';
import { newComponent, type Architecture, type ArchitectureWrite } from '../src/lib/domain';

const write: ArchitectureWrite = { name: '  Application  ', document: { format_version: 1, nodes: [newComponent(ComponentType.SERVER, { x: -12.5, y: 40 }, 'server')], edges: [] } };
const resource: Architecture = { ...write, name: 'Application', id: 'df0748cc-6f1e-48dd-bc32-1a85848a2f32', created_at: '2026-10-03T10:00:00.123456Z', updated_at: '2026-10-03T10:01:00.123456Z' };
const json = (body: unknown, status = 200): Response => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('HTTP architecture persistence', () => {
  it('creates with POST and completely replaces with PUT, retaining server metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(resource, 201)).mockResolvedValueOnce(json(resource));
    const store = new HttpArchitectureStore('http://backend:8000/', fetcher);
    expect(await store.create(write)).toEqual(resource);
    expect(await store.replace(resource.id, write)).toEqual(resource);
    expect(fetcher.mock.calls.map(([url, init]) => [url, init?.method])).toEqual([
      ['http://backend:8000/api/v1/architectures', 'POST'],
      [`http://backend:8000/api/v1/architectures/${resource.id}`, 'PUT'],
    ]);
    for (const [, init] of fetcher.mock.calls) {
      expect(init?.headers).toEqual({ Accept: 'application/json', 'Content-Type': 'application/json' });
      expect(JSON.parse(String(init?.body))).toEqual({ name: 'Application', document: write.document });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
    }
    expect(write.name).toBe('  Application  ');
  });
  it('reopens, lists metadata, and handles bodyless deletion from the same backend', async () => {
    const { document: _document, ...metadata } = resource;
    const summary = { ...metadata, format_version: 1 };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json({ items: [summary] })).mockResolvedValueOnce(json(resource)).mockResolvedValueOnce(new Response(null, { status: 204 }));
    const store = new HttpArchitectureStore('http://backend', fetcher);
    expect(await store.list()).toEqual([summary]); expect(await store.get(resource.id)).toEqual(resource); await store.delete(resource.id);
    expect(fetcher.mock.calls.map(([, init]) => init?.method)).toEqual(['GET', 'GET', 'DELETE']);
    expect(fetcher.mock.calls.every(([, init]) => init?.body === undefined)).toBe(true);
  });
  it('preserves structured validation pointers and missing-resource errors without retrying', async () => {
    const validation = { error: { code: 'validation_error', message: 'Invalid architecture.', details: [{ location: 'body', path: '/document/nodes/0/capacity_rps', code: 'invalid_value', message: 'Must be positive.' }] } };
    const missing = { error: { code: 'architecture_not_found', message: 'Architecture no longer exists.', details: [] } };
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(json(validation, 422)).mockResolvedValueOnce(json(missing, 404));
    const store = new HttpArchitectureStore('http://backend', fetcher);
    await expect(store.create(write)).rejects.toMatchObject({ response: validation });
    await expect(store.replace(resource.id, write)).rejects.toMatchObject({ response: missing });
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
  it('does not send invalid drafts or accept a resource with a different identity', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json(resource)); const store = new HttpArchitectureStore('http://backend', fetcher);
    await expect(store.create({ ...write, name: '' })).rejects.toMatchObject({ response: { error: { code: 'validation_error' } } }); expect(fetcher).not.toHaveBeenCalled();
    await expect(store.replace('100748cc-6f1e-48dd-bc32-1a85848a2f32', write)).rejects.toThrow('different architecture');
  });
  it.each([
    () => new Response('not JSON', { status: 500 }),
    () => json({ detail: 'Unexpected error' }, 500),
    () => json(resource, 202),
    () => json({ ...resource, document: { ...resource.document, format_version: 0 } }, 201),
  ])('rejects unexpected responses instead of treating a Save as successful', async (response) => {
    const store = new HttpArchitectureStore('http://backend', vi.fn<typeof fetch>().mockResolvedValue(response()));
    await expect(store.create(write)).rejects.toBeInstanceOf(Error);
  });
  it('reports a disconnected backend without retrying an ambiguous POST', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(new HttpArchitectureStore('http://backend', fetcher).create(write)).rejects.toThrow('Your edits are intact');
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('aborts a stalled request and leaves retrying to the user', async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn<typeof fetch>().mockImplementation((_url, init) => new Promise((_resolve, reject) => { init?.signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))); }));
      const save = new HttpArchitectureStore('http://backend', fetcher, 100).create(write);
      const failed = expect(save).rejects.toThrow('timed out'); await vi.advanceTimersByTimeAsync(100); await failed;
      expect(fetcher).toHaveBeenCalledTimes(1); expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });
});
