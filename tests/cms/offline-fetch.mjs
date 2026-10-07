// Only loaded by the disposable CMS test server; never by the deployed application.
import { readFileSync, writeFileSync } from 'node:fs';

const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'api.github.com') return Response.json([]);
  if (url.hostname === 'api.iconify.design') {
    const statePath = process.env.VISUAL_ICON_FIXTURE_STATE;
    const state = JSON.parse(readFileSync(statePath, 'utf8'));
    state.requests++;
    writeFileSync(statePath, JSON.stringify(state), { mode: 0o600 });
    if (state.mode === 'error') {
      return new Response(null, { status: 503, headers: { 'retry-after': '0' } });
    }
    return new Response('<svg viewBox="0 0 24 24"><path fill="currentColor" d="M2 2h20v20H2z" /></svg>', {
      headers: { 'content-type': 'image/svg+xml' },
    });
  }
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error(`Unexpected external request in CMS test: ${url.hostname}`);
  return realFetch(input, { ...init, redirect: 'error' });
};
