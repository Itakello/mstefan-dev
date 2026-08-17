import assert from "node:assert/strict";
import test from "node:test";
import type { ReactElement } from "react";

import { IconLink } from "../components/IconLink";

test("keeps a 40px contact-link target at every breakpoint", () => {
  const link = IconLink({ href: "mailto:test@example.com", label: "Email", icon: null }) as ReactElement<any>;
  const classes = new Set((link.props.className as string).split(" "));

  assert.equal(classes.has("size-10"), true);
  assert.equal(classes.has("sm:h-10"), true);
  assert.equal(classes.has("sm:w-auto"), true);
  assert.equal(classes.has("sm:px-2"), true);
});

test("shows the contact-link button boundary in light and dark modes", () => {
  const link = IconLink({ href: "mailto:test@example.com", label: "Email", icon: null }) as ReactElement<any>;
  const classes = new Set((link.props.className as string).split(" "));

  assert.equal(classes.has("rounded-md"), true);
  assert.equal(classes.has("border"), true);
  assert.equal(classes.has("border-black/10"), true);
  assert.equal(classes.has("bg-black/[0.025]"), true);
  assert.equal(classes.has("dark:border-white/10"), true);
  assert.equal(classes.has("dark:bg-white/[0.035]"), true);
});
