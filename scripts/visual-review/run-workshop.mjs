import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const options = process.argv.slice(2);
if (options.some(arg => !['--reuse-build', '--update-snapshots'].includes(arg))) {
  throw new Error('Usage: run-workshop.mjs [--reuse-build] [--update-snapshots]');
}
async function run(args, env = process.env) {
  const child = spawn(process.execPath, args, { env, stdio: 'inherit', timeout: 300_000 });
  const [code, signal] = await once(child, 'exit');
  if (code !== 0) throw new Error(`Workshop command failed (${signal ?? code}).`);
}
if (!options.includes('--reuse-build')) {
  await run(['node_modules/storybook/dist/bin/dispatcher.js', 'build', '--output-dir', '.artifacts/workshop', '--disable-telemetry']);
}
const root = path.resolve('.artifacts/workshop');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.woff2': 'font/woff2' };
const server = createServer(async (request, response) => {
  try {
    const pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    const file = path.resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
    if (!file.startsWith(`${root}${path.sep}`)) { response.writeHead(403).end(); return; }
    const body = await readFile(file);
    response.writeHead(200, { 'content-type': types[path.extname(file)] ?? 'application/octet-stream' }).end(body);
  } catch { response.writeHead(404).end(); }
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
const base = `http://127.0.0.1:${server.address().port}`;
try {
  await run(['node_modules/@playwright/test/cli.js', 'test', '--project=workshop', '--reporter=line', '--output=.artifacts/playwright/workshop', ...(options.includes('--update-snapshots') ? ['--update-snapshots'] : [])], { ...process.env, PLAYWRIGHT_BASE_URL: base });
} finally {
  server.closeAllConnections();
  await new Promise(resolve => server.close(resolve));
}
