import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

// Browser acceptance tests never write to the developer's architecture library.
const directory = mkdtempSync(join(tmpdir(), 'sysd-browser-'));
const root = fileURLToPath(new URL('../../', import.meta.url));
const app = spawn('/bin/bash', [join(root, 'scripts/start.sh')], {
  cwd: root, stdio: 'inherit', env: { ...process.env, SYSD_DATABASE_PATH: join(directory, 'architectures.sqlite3') },
});
// Let the launcher's cleanup trap stop both services before this wrapper exits.
let stopping = false;
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => { stopping = true; app.kill('SIGTERM'); });
app.on('error', (error) => { console.error(error); rmSync(directory, { recursive: true, force: true }); process.exit(1); });
app.on('exit', (code) => { rmSync(directory, { recursive: true, force: true }); process.exit(stopping ? 0 : code ?? 1); });
