const previewHost = /^pr-([1-9]\d*)\.preview\.mstefan\.dev$/i;
const timeoutMs = 5_000;

function response(body, status) {
  return new Response(body, {
    status,
    headers: { "Cache-Control": "no-store", "X-Robots-Tag": "noindex" },
  });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname.toLowerCase();
    const match = hostname.match(previewHost);
    const active = new Set((env.ACTIVE_PRS ?? "").split(",").map((pr) => pr.trim()));
    if (!match || !active.has(match[1])) return response("Not found", 404);
    if (request.method !== "GET" && request.method !== "HEAD") return response("Method not allowed", 405);
    if (!/^[a-f0-9]{64}$/.test(env.ORIGIN_AUTH_KEY ?? "")) return response("Preview unavailable", 502);

    const origin = `https://preview-origin-pr-${match[1]}.mstefan.dev`;
    const headers = new Headers(request.headers);
    headers.set("Cache-Control", "no-store");
    for (const name of [...headers.keys()]) {
      if (/^(host|authorization|cookie|proxy-authorization|forwarded|x-forwarded-.*|x-real-ip|x-original-(host|url)|cf-.*)$/i.test(name)) headers.delete(name);
    }

    try {
      const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(env.ORIGIN_AUTH_KEY), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
      const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`pr-${match[1]}`));
      const token = [...new Uint8Array(signature)].map(byte => byte.toString(16).padStart(2, "0")).join("");
      headers.set("X-Preview-Origin-Token", token);
      const upstream = await fetch(`${origin}${url.pathname}${url.search}`, {
        method: request.method,
        headers,
        redirect: "manual",
        signal: AbortSignal.timeout(timeoutMs),
        cf: { cacheTtl: 0, cacheEverything: false },
      });
      const resultHeaders = new Headers(upstream.headers);
      resultHeaders.delete("Set-Cookie");
      resultHeaders.set("Cache-Control", "no-store");
      resultHeaders.set("X-Robots-Tag", "noindex");
      const location = resultHeaders.get("Location");
      if (location) {
        try {
          const target = new URL(location);
          if (target.origin === origin) {
            target.host = hostname;
            resultHeaders.set("Location", target.href);
          }
        } catch {
          // Keep malformed or relative locations unchanged.
        }
      }
      return new Response(request.method === "HEAD" ? null : upstream.body, {
        status: upstream.status,
        statusText: upstream.statusText,
        headers: resultHeaders,
      });
    } catch {
      return response("Preview unavailable", 502);
    }
  },
};
