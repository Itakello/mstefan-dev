import type { CSSProperties, ReactNode } from "react";

export function BranchIcon() {
  return <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.4"><path d="M4 5v6m0-3c0-3 8-1 8-5M4 2a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm0 9a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Zm8-11a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3Z" /></svg>;
}

/** A branch name in its branch color, as tags show it across Home, Work and Experience. */
export function BranchTag({ name, color, as: Tag = "span", className = "" }: { name: ReactNode; color?: string | null; as?: "span" | "p" | "h2"; className?: string }) {
  return <Tag className={`career-tag ${className}`} style={{ "--branch-color": color ?? undefined } as CSSProperties}><BranchIcon /><span>{name}</span></Tag>;
}

/** The `mstefan / <path>` bar that heads the Work and Experience panels. */
export function RepoToolbar({ path, reference }: { path: string; reference: ReactNode }) {
  return <div className="repo-toolbar"><BranchIcon /><span>mstefan <span className="repo-toolbar-muted">/</span> {path}</span><span className="repo-toolbar-ref">{reference}</span></div>;
}
