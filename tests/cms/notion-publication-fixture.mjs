// Test preload only: no production fallback or provider access.
import './offline-fetch.mjs';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import https from 'node:https';
import { syncBuiltinESMExports } from 'node:module';
import { once } from 'node:events';
import { urlToHttpOptions } from 'node:url';

const fixtureRows = [
  ['mstefan.dev', 'https://www.mstefan.dev', 'Personal website fixture.', 'Sito personale di prova.'],
  ['The Karakal Times', 'https://www.thekarakaltimes.com', 'Link-only client fixture.', 'Sito cliente di prova, solo link.'],
  ['Automation tools', null, 'Repository-only fixture.', 'Progetto di prova senza sito web.'],
].map(([name, website, en, it], index) => ({ id: `visual-project-${index}`, properties: {
  Year: { number: 2026 }, Tags: { multi_select: [{ name: index === 2 ? "Tools" : "Web" }] },
  Name: { title: [{ plain_text: name }] }, Status: { status: { name: 'Added' } },
  Summary: { rich_text: [{ plain_text: en }] }, 'Summary IT': { rich_text: [{ plain_text: it }] },
  URL: { url: index === 1 ? null : `https://github.com/fixture/project-${index}` }, 'Website URL': { type: 'url', url: website },
} }));
function fixturePayload() {
  const mode = readFileSync(process.env.VISUAL_NOTION_FIXTURE_STATE, 'utf8').trim();
  if (mode === 'error') return { status: 503, body: { object: 'error', code: 'service_unavailable', message: 'Synthetic publication outage' } };
  if (!['multiple', 'one', 'empty'].includes(mode)) throw new Error('Unexpected publication fixture state');
  const rows = mode === 'empty' ? [] : mode === 'one' ? fixtureRows.slice(0, 1) : fixtureRows;
  return { status: 200, body: { object: 'list', results: rows, has_more: false, next_cursor: null } };
}
const provider = http.createServer((request, response) => {
  if (request.headers.authorization !== 'Bearer visual-review-fixture'
      || request.method !== 'POST' || request.url !== '/v1/databases/visual-review-fixture/query') {
    response.writeHead(400).end('Unexpected fixture request');
    return;
  }
  let query = '';
  request.on('data', chunk => { query += chunk; });
  request.on('end', () => {
    const parsed = JSON.parse(query);
    if (parsed.filter?.property !== 'Status' || parsed.filter?.status?.equals !== 'Added' || parsed.start_cursor) {
      response.writeHead(400).end('Unexpected publication query');
      return;
    }
    const { status, body } = fixturePayload();
    response.writeHead(status, { 'content-type': 'application/json' }).end(JSON.stringify(body));
  });
});
provider.listen(0, '127.0.0.1');
await once(provider, 'listening');
provider.unref();
// Intercept the native boundary as Next bundles the SDK's node-fetch implementation.
const localRequest = http.request;
function normalizeRequest(input, args) {
  if (typeof input === 'string' || input instanceof URL) {
    const overrides = args[0] && typeof args[0] === 'object' ? args.shift() : {};
    return { options: { ...urlToHttpOptions(new URL(input)), ...overrides }, args };
  }
  return { options: input, args };
}
https.request = function fixtureRequest(input, ...args) {
  const request = normalizeRequest(input, args);
  const options = request.options;
  if (options.hostname !== 'api.notion.com' || options.socketPath) throw new Error(`Unexpected HTTPS request in visual fixture: ${options.hostname}`);
  return localRequest({ ...options, protocol: 'http:', hostname: '127.0.0.1', host: '127.0.0.1', port: provider.address().port }, ...request.args);
};
http.request = function offlineRequest(input, ...args) {
  const request = normalizeRequest(input, args);
  const hostname = request.options.hostname || request.options.host;
  if (!['127.0.0.1', 'localhost'].includes(hostname) || request.options.socketPath) throw new Error(`Unexpected HTTP request in visual fixture: ${hostname}`);
  return localRequest(request.options, ...request.args);
};
for (const transport of [http, https]) {
  transport.get = (...args) => { const request = transport.request(...args); request.end(); return request; };
}
syncBuiltinESMExports();
