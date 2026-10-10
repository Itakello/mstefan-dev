import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer as createHttpServer } from "node:http";
import { createServer as createHttpsServer } from "node:https";
import { createServer } from "node:net";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
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

test("Karakal credentials stay on approved HTTPS origins across redirects and assets", async () => {
  const directory = await mkdtemp(path.join(tmpdir(), "preview-tls-test-"));
  const key = path.join(directory, "key.pem");
  const cert = path.join(directory, "cert.pem");
  execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", key, "-out", cert, "-subj", "/CN=preview-test", "-days", "1"], { stdio: "ignore" });
  const requests: { host?: string; url?: string; secret?: string | string[]; accept?: string }[] = [];
  const server = createHttpsServer({ key: await readFile(key), cert: await readFile(cert) }, (request, response) => {
    requests.push({ host: request.headers.host, url: request.url, secret: request.headers["x-vercel-protection-bypass"], accept: request.headers.accept });
    if (request.url === "/first") response.writeHead(302, { location: "https://thekarakaltimes.com/second" });
    else if (request.url === "/second") response.writeHead(302, { location: "https://example.com/final" });
    else response.writeHead(200, { "content-type": "text/html", "access-control-allow-origin": "*" });
    response.end("<h1>Capture destination</h1>");
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const port = (server.address() as { port: number }).port;
  const browser = await chromium.launch({ args: [
    `--host-resolver-rules=MAP www.thekarakaltimes.com 127.0.0.1:${port},MAP thekarakaltimes.com 127.0.0.1:${port},MAP example.com 127.0.0.1:${port}`,
    "--no-proxy-server",
  ] });
  try {
    const context = await browser.newContext({ serviceWorkers: "block", ignoreHTTPSErrors: true });
    await configurePreviewNetwork(context);
    const page = await context.newPage();
    await configurePreviewPageNetwork(page, "synthetic-test-secret");
    assert.equal((await page.goto("https://www.thekarakaltimes.com/first"))?.status(), 200);
    assert.equal(page.url(), "https://example.com/final");
    assert.equal(await page.locator("h1").textContent(), "Capture destination");
    await page.evaluate(async () => {
      await Promise.all([
        fetch("https://www.thekarakaltimes.com/asset").then(response => response.text()),
        fetch("https://example.com/asset").then(response => response.text()),
      ]);
    });
    for (const host of ["www.thekarakaltimes.com", "thekarakaltimes.com", "example.com"]) assert.ok(requests.some(request => request.host === host));
    for (const request of requests) {
      assert.equal(request.secret, request.host === "example.com" ? undefined : "synthetic-test-secret", `${request.host}${request.url}`);
      assert.ok(request.accept);
    }
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
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
