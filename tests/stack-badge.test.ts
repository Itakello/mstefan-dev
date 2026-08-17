import assert from "node:assert/strict";
import test from "node:test";
import { Children, type ReactElement } from "react";

import { StackBadge } from "../components/StackBadge";
import type { StackEntry } from "../lib/stack";

const iconifyEntry: StackEntry = {
  name: "Firebase",
  category: "Cloud",
  iconKey: "logos:firebase",
  websiteVisible: true,
};

const externalIconEntry: StackEntry = {
  ...iconifyEntry,
  iconKey: "https://s3-us-west-2.amazonaws.com/public.notion-static.com/firebase.svg",
};

function renderedGraphicClass(item: StackEntry, compact: boolean) {
  const badge = StackBadge({ item, label: false, compact }) as ReactElement<any>;
  const iconWrapper = Children.toArray(badge.props.children)[0] as ReactElement<any>;
  const graphic = Children.toArray(iconWrapper.props.children)[0] as ReactElement<any>;

  return graphic.props.className as string;
}

test("contains every Stack graphic inside the square icon area", () => {
  assert.equal(renderedGraphicClass(iconifyEntry, true), "size-4");
  assert.equal(renderedGraphicClass(iconifyEntry, false), "size-5");
  assert.equal(renderedGraphicClass(externalIconEntry, true), "size-4 object-contain");
  assert.equal(renderedGraphicClass(externalIconEntry, false), "size-5 object-contain");
});
