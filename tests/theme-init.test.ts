import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";

import { INITIAL_THEME_SCRIPT } from "../lib/theme";

test("runs the theme initializer synchronously in the document head", () => {
  const layout = readFileSync(new URL("../app/[locale]/layout.tsx", import.meta.url), "utf8");

  assert.equal(layout.includes('from "next/script"'), false);
  const headIndex = layout.indexOf("<head>");
  const scriptIndex = layout.indexOf("<script dangerouslySetInnerHTML={{ __html: INITIAL_THEME_SCRIPT }} />");
  const bodyIndex = layout.indexOf("<body>");

  assert.notEqual(headIndex, -1);
  assert.notEqual(scriptIndex, -1);
  assert.notEqual(bodyIndex, -1);
  assert.equal(headIndex < scriptIndex && scriptIndex < bodyIndex, true);
});

for (const { storedTheme, systemDark, storageThrows, expectedDark } of [
  { storedTheme: "dark", systemDark: false, storageThrows: false, expectedDark: true },
  { storedTheme: "light", systemDark: true, storageThrows: false, expectedDark: false },
  { storedTheme: null, systemDark: true, storageThrows: false, expectedDark: true },
  { storedTheme: null, systemDark: false, storageThrows: false, expectedDark: false },
  { storedTheme: null, systemDark: true, storageThrows: true, expectedDark: true },
] as const) {
  test(`initializes ${expectedDark ? "dark" : "light"} mode for stored=${storedTheme} systemDark=${systemDark} storageThrows=${storageThrows}`, () => {
    let isDark = false;

    runInNewContext(INITIAL_THEME_SCRIPT, {
      document: {
        documentElement: {
          classList: {
            toggle(className: string, force: boolean) {
              assert.equal(className, "dark");
              isDark = force;
            },
          },
        },
      },
      localStorage: {
        getItem(key: string) {
          assert.equal(key, "theme");
          if (storageThrows) throw new Error("Storage unavailable");
          return storedTheme;
        },
      },
      window: {
        matchMedia(query: string) {
          assert.equal(query, "(prefers-color-scheme: dark)");
          return { matches: systemDark };
        },
      },
    });

    assert.equal(isDark, expectedDark);
  });
}
