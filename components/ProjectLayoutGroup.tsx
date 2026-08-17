"use client";

import { LayoutGroup, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

export function ProjectLayoutGroup({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>{children}</LayoutGroup>
    </MotionConfig>
  );
}
