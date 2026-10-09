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
  ['The Karakal Times', 'https://www.thekarakaltimes.com', 'Client website fixture.', 'Sito cliente di prova.'],
  ['Automation tools', null, 'Repository-only fixture.', 'Progetto di prova senza sito web.'],
].map(([name, website, en, it], index) => ({ id: `visual-project-${index}`, properties: {
  Type: { type: "select", select: { name: index === 2 ? "Tool" : "Website" } },
  Year: { number: 2026 }, Tags: { multi_select: (index === 2 ? ["Python"] : ["TypeScript", "Next.js", "React"]).map(name => ({ name })) },
  Name: { title: [{ plain_text: name }] }, Status: { status: { name: 'Added' } },
  Summary: { rich_text: [{ plain_text: en }] }, 'Summary IT': { rich_text: [{ plain_text: it }] },
  URL: { url: index === 1 ? null : `https://github.com/fixture/project-${index}` }, 'Website URL': { type: 'url', url: website },
} }));
fixtureRows[2].properties['Paper URL'] = { type: 'url', url: 'https://example.com/research-paper.pdf' };
fixtureRows[2].properties['Slides URL'] = { type: 'url', url: 'https://example.com/research-slides.pdf' };
fixtureRows[2].properties.Publication = { rich_text: [{ plain_text: 'Coauthor · Published in Example Journal' }] };
const stackRows = [['TypeScript', 'Language', 'logos:typescript-icon'], ['Python', 'Language', 'logos:python'], ['Next.js', 'Framework', 'logos:nextjs-icon'], ['React', 'Library', 'logos:react'], ['React · DOM', 'Library', 'logos:react'], ['Node.js', 'Runtime', 'logos:nodejs-icon'], ['GitHub Actions', 'Infrastructure', 'logos:github-actions'], ['Notion', 'Integration', 'logos:notion-icon'], ['pnpm', 'CLI', 'logos:pnpm'], ['Tailwind CSS', 'Framework', 'logos:tailwindcss-icon'], ['MongoDB', 'Database', 'logos:mongodb-icon'], ['AWS', 'Cloud', 'logos:aws'], ['Docker', 'Infrastructure', 'logos:docker-icon']].map(([name, category, iconKey], index) => ({ id: `visual-stack-${index}`, properties: {
  Name: { title: [{ plain_text: name }] }, Category: { select: { name: category } }, 'Icon key': { rich_text: [{ plain_text: iconKey }] },
} }));
function fixturePayload() {
  const mode = readFileSync(process.env.VISUAL_NOTION_FIXTURE_STATE, 'utf8').trim();
  if (mode === 'error') return { status: 503, body: { object: 'error', code: 'service_unavailable', message: 'Synthetic publication outage' } };
  if (!['multiple', 'one', 'empty', 'dense', 'publication', 'changedsummary', 'recovered'].includes(mode)) throw new Error('Unexpected publication fixture state');
  const denseRow = { ...fixtureRows[0], properties: { ...fixtureRows[0].properties, Tags: { multi_select: stackRows.map(row => ({ name: row.properties.Name.title[0].plain_text })) } } };
  const publicationRows = fixtureRows.map((row, index) => index === 0 ? { ...row, properties: { ...row.properties,
    Name: { title: [{ plain_text: 'mstefan-dev' }] },
    ...(mode === 'changedsummary' || mode === 'recovered' ? {
      Summary: { rich_text: [{ plain_text: mode === 'changedsummary' ? 'Changed publication fixture.' : 'Recovered publication fixture.' }] },
      'Summary IT': { rich_text: [{ plain_text: mode === 'changedsummary' ? 'Pubblicazione di prova aggiornata.' : 'Pubblicazione di prova ripristinata.' }] },
    } : {}),
  } } : row);
  const rows = mode === 'dense' ? [denseRow] : mode === 'empty' ? [] : mode === 'one' ? fixtureRows.slice(0, 1)
    : ['publication', 'changedsummary', 'recovered'].includes(mode) ? publicationRows : fixtureRows;
  return { status: 200, body: { object: 'list', results: rows, has_more: false, next_cursor: null } };
}
const provider = http.createServer((request, response) => {
  if (request.headers.authorization !== 'Bearer visual-review-fixture'
      || request.method !== 'POST' || !['/v1/databases/visual-review-fixture/query', '/v1/databases/visual-stack-fixture/query'].includes(request.url)) {
    response.writeHead(400).end('Unexpected fixture request');
    return;
  }
  let query = '';
  request.on('data', chunk => { query += chunk; });
  request.on('end', () => {
    const parsed = JSON.parse(query);
    if (request.url === '/v1/databases/visual-stack-fixture/query') {
      if (parsed.filter || parsed.start_cursor) { response.writeHead(400).end('Unexpected Stack query'); return; }
      response.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ object: 'list', results: stackRows, has_more: false, next_cursor: null }));
      return;
    }
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
