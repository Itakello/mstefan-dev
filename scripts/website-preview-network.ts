import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";
import type { BrowserContext, Page } from "@playwright/test";

const privateNetworks = new BlockList();
for (const [address, prefix] of [["0.0.0.0", 8], ["10.0.0.0", 8], ["100.64.0.0", 10], ["127.0.0.0", 8], ["169.254.0.0", 16], ["172.16.0.0", 12], ["192.168.0.0", 16], ["198.18.0.0", 15], ["224.0.0.0", 4], ["240.0.0.0", 4]] as const) privateNetworks.addSubnet(address, prefix, "ipv4");
for (const [address, prefix] of [["::", 128], ["::1", 128], ["fc00::", 7], ["fe80::", 10], ["ff00::", 8]] as const) privateNetworks.addSubnet(address, prefix, "ipv6");

export function isPublicPreviewAddress(address: string) {
  const version = isIP(address);
  return Boolean(version) && !privateNetworks.check(address, version === 6 ? "ipv6" : "ipv4");
}

export async function isPublicPreviewRequest(value: string) {
  const url = new URL(value);
  if (url.protocol === "data:" || url.protocol === "blob:") return true;
  if (!["https:", "http:"].includes(url.protocol) || url.username || url.password) return false;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  if (isIP(hostname)) return isPublicPreviewAddress(hostname);
  const addresses = await lookup(hostname, { all: true });
  return addresses.length > 0 && addresses.every(({ address }) => isPublicPreviewAddress(address));
}

export async function configurePreviewNetwork(context: BrowserContext) {
  await context.routeWebSocket("**/*", socket => socket.close());
  await context.route("**/*", async route => {
    const allowed = await isPublicPreviewRequest(route.request().url()).catch(() => false);
    await (allowed ? route.continue() : route.abort("blockedbyclient"));
  });
}

export function previewRequestHeaders(url: string, headers: Record<string, string>, bypassSecret?: string) {
  const target = new URL(url);
  const safeHeaders = Object.fromEntries(Object.entries(headers).filter(([name]) => name.toLowerCase() !== "x-vercel-protection-bypass"));
  if (bypassSecret && !target.username && !target.password
    && ["https://www.thekarakaltimes.com", "https://thekarakaltimes.com"].includes(target.origin)) {
    safeHeaders["x-vercel-protection-bypass"] = bypassSecret;
  }
  return Object.entries(safeHeaders).map(([name, value]) => ({ name, value }));
}

export async function configurePreviewPageNetwork(page: Page, bypassSecret?: string) {
  const session = await page.context().newCDPSession(page);
  // Chromium pauses every redirect hop; Playwright routes only the initial request.
  session.on("Fetch.requestPaused", async ({ requestId, request }) => {
    const allowed = await isPublicPreviewRequest(request.url).catch(() => false);
    await session.send(allowed ? "Fetch.continueRequest" : "Fetch.failRequest", allowed
      ? { requestId, headers: previewRequestHeaders(request.url, request.headers, bypassSecret) }
      : { requestId, errorReason: "BlockedByClient" })
      .catch(() => page.close().catch(() => {}));
  });
  await session.send("Fetch.enable", { patterns: [{ urlPattern: "*", requestStage: "Request" }] });
}
