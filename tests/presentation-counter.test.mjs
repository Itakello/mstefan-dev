import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";

test("native slide events drive the presentation counter across animation steps", () => {
  const html = readFileSync(new URL("../public/presentations/physiq/index.html", import.meta.url), "utf8");
  const script = html.match(/<script>([\s\S]*?)<\/script>/i)[1];
  const listeners = {}, messages = [];
  const parent = { postMessage: (value, origin) => messages.push({ ...value, origin }) };
  runInNewContext(script, { parent, location: { origin: "https://mstefan.dev" }, document: { addEventListener: (name, handler) => { listeners[name] = handler; } }, window: { addEventListener: (name, handler) => { listeners[name] = handler; } } });
  listeners["ScriptManager:ScriptDidDownloadEvent"]({ detail: { script: { slideList: Array(25) } } });
  assert.equal(messages.at(-1).current, 1);
  assert.equal(messages.at(-1).total, 25);
  listeners["ShowController:SlideIndexDidChangeEvent"]({ detail: { slideIndex: 4 } });
  assert.equal(messages.at(-1).current, 5);
  const request = { source: parent, origin: "https://mstefan.dev", data: { type: "mstefan:presentation-progress-request" } };
  listeners.message(request);
  assert.equal(messages.at(-1).current, 5);
  const count = messages.length;
  listeners.message({ ...request, source: {} });
  listeners.message({ ...request, origin: "https://other.example" });
  assert.equal(messages.length, count);
});
