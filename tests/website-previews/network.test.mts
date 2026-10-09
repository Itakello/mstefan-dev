import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:net";
import test from "node:test";
import { chromium } from "@playwright/test";
import { configurePreviewNetwork } from "../../scripts/website-preview-network";

test("the capture browser blocks private HTTP and WebSocket connections", async () => {
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
    await page.setContent("<h1>Capture fixture</h1>");
    await page.evaluate(async port => {
      await fetch(`http://127.0.0.1:${port}`).catch(() => {});
      await new Promise<void>(resolve => {
        const socket = new WebSocket(`wss://127.0.0.1:${port}`);
        socket.addEventListener("close", () => resolve());
        setTimeout(resolve, 1_000);
      });
    }, port);
    assert.equal(connections, 0);
  } finally {
    await browser.close();
    await new Promise<void>(resolve => server.close(() => resolve()));
  }
});
