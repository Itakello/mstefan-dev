import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { createServer } from "node:net";
import test from "node:test";
import { chromium } from "@playwright/test";
import { configurePreviewNetwork, configurePreviewPageNetwork } from "../../scripts/website-preview-network";

test("the capture browser blocks private HTTP, WebSocket, popup, and redirect connections", async () => {
  let connections = 0;
  const server = createServer(socket => { connections++; socket.destroy(); });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await configurePreviewNetwork(context);
    const page = await context.newPage();
    await configurePreviewPageNetwork(page);
    await page.setContent("<h1>Capture fixture</h1>");
    await page.evaluate(async port => {
      await fetch(`http://127.0.0.1:${port}`).catch(() => {});
      await new Promise<void>(resolve => {
        const socket = new WebSocket(`wss://127.0.0.1:${port}`);
        socket.addEventListener("close", () => resolve());
        setTimeout(resolve, 1_000);
      });
    }, port);
    const popupUrl = `http://127.0.0.1:${port}/popup`;
    const popupFailure = context.waitForEvent("requestfailed", { predicate: request => request.url() === popupUrl });
    await page.evaluate(url => { window.open(url); }, popupUrl);
    const popupRequest = await popupFailure;
    assert.equal(popupRequest.failure()?.errorText, "net::ERR_BLOCKED_BY_CLIENT");
    await page.route("https://example.com/private-redirect", route => route.fulfill({
      status: 302, headers: { location: `http://127.0.0.1:${port}/` },
    }));
    await assert.rejects(page.goto("https://example.com/private-redirect"), /ERR_BLOCKED_BY_CLIENT/);
    assert.equal(connections, 0);
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});

test("the capture browser preserves public redirects and the rendered destination", async () => {
  const server = createHttpServer((request, response) => {
    if (request.url === "/public-redirect") {
      response.writeHead(302, { location: "/destination" });
      response.end();
    } else {
      response.writeHead(200, { "content-type": "text/html" });
      response.end("<h1>Public destination</h1>");
    }
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ args: ["--host-resolver-rules=MAP example.com 127.0.0.1", "--no-proxy-server"] });
  try {
    const context = await browser.newContext({ serviceWorkers: "block" });
    await configurePreviewNetwork(context);
    const page = await context.newPage();
    await configurePreviewPageNetwork(page);
    const response = await page.goto(`http://example.com:${port}/public-redirect`);
    assert.equal(response?.status(), 200);
    assert.equal(page.url(), `http://example.com:${port}/destination`);
    assert.equal(await page.locator("h1").textContent(), "Public destination");
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
