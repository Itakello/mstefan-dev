"use client";

import { LayoutGroup, motion, MotionConfig } from "motion/react";
import type { ReactNode } from "react";

const projectLayoutTransition = {
  type: "spring",
  stiffness: 360,
  damping: 38,
  mass: 0.8,
} as const;

export function ProjectLayoutGroup({ children }: { children: ReactNode }) {
  return (
    <MotionConfig reducedMotion="user">
      <LayoutGroup>{children}</LayoutGroup>
    </MotionConfig>
  );
}

export function ProjectLayoutItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <motion.div
      layout="position"
      transition={{ layout: projectLayoutTransition }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
