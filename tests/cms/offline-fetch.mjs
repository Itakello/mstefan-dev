// Only loaded by the disposable CMS test server; never by the deployed application.
const realFetch = globalThis.fetch;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
  if (url.hostname === 'api.github.com') return Response.json([]);
  if (!['127.0.0.1', 'localhost'].includes(url.hostname)) throw new Error(`Unexpected external request in CMS test: ${url.hostname}`);
  return realFetch(input, { ...init, redirect: 'error' });
};
