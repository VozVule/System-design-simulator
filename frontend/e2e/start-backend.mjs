import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser acceptance tests never write to the developer's architecture library.
const directory = mkdtempSync(join(tmpdir(), 'sysd-browser-'));
const root = fileURLToPath(new URL('../../', import.meta.url));
const backend = spawn(join(root, '.venv/bin/python'), ['-m', 'uvicorn', 'sysd_backend.main:app', '--host', '127.0.0.1', '--port', '18000'], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SYSD_DATABASE_PATH: join(directory, 'architectures.sqlite3'), SYSD_CORS_ORIGINS: 'http://127.0.0.1:5174' },
});
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => backend.kill(signal));
backend.on('error', (error) => { console.error(error); rmSync(directory, { recursive: true, force: true }); process.exit(1); });
backend.on('exit', (code) => { rmSync(directory, { recursive: true, force: true }); process.exit(code ?? 0); });
