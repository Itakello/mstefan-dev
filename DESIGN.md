# mstefan.dev design contract

## Intent

A quiet portfolio with a shared visual language across Home, Work, and About. Read this contract before changing public UI and compare the result with related existing screens, not only the edited component.

## Foundations

`app/globals.css` owns page, surface, text, selection, accent, and scrollbar tokens for both themes. `tailwind.config.ts` owns the font stacks and layout utilities. Reuse those values rather than introducing local white/black surfaces or copies of token values here.

Use the existing system sans font for content and monospace for Career's branch metadata. Preserve the page heading hierarchy, container widths, and responsive spacing. Purple is the interface accent; Career branch colors identify tracks and are not replacements for interface status colors.

## Icons and brands

- Interface controls use the existing Lucide outline family. Career's branch glyph belongs to its graph representation.
- Brand marks retain their actual silhouettes; do not substitute a generic control icon or redraw a logo.
- `components/BrandIcon.tsx` owns repeated GitHub, LinkedIn, and X marks. Use it for those brand links everywhere. Their monochrome SVGs inherit text color so the same mark stays legible in both themes.
- Technology artwork comes from the canonical Notion Stack `Icon key`, rendered by `StackBadge`. Notion remains the publication source; do not add a production fallback catalog.
- Artwork and its layout wrapper are transparent: no decorative background tile, border, or clipping mask around a logo. Preserve intrinsic brand geometry such as TypeScript's square.
- Comparable marks render at 16px through `BRAND_ICON_CLASS`. Layout and interaction targets may be larger; a small glyph must not shrink the clickable target.
- Contact and repository buttons may retain their shared interactive surface and hover feedback. Those are button boundaries, not baked-in logo backgrounds.

## Surfaces and scrolling

Use semantic page/surface tokens for component surfaces. Stack category headings and logo wrappers remain transparent. Keep visible focus indicators, readable labels, and theme-aware hover/selection states.

Native scrollbars use the global track, thumb, width, and accent-hover rules. Do not override their appearance per component. Work and Career scroll panes contain overscroll. Heights and axes may differ because a project list, technology grid, and timeline hold different content. Preserve keyboard access and selection visibility rather than forcing them into one layout.

## Verification and AI review

The isolated production fixture must render pinned real icon artwork and fail on missing fixtures. Check Home, Work, About, and contact links at desktop/mobile sizes in light/dark themes. Compare approved screenshot baselines and assert actual glyphs, transparent wrappers, consistent GitHub paths, and shared scrollbar styling. Keep named current screenshots in the CI evidence for independent review. Exercise selection, keyboard focus, scrolling, and existing bilingual navigation as well as appearance.

An independent AI reviewer must inspect the complete current diff and its rendered evidence against this contract. Compare the changed pattern with its callers and related pages. Report a concrete rule, affected locations, and visible evidence for each inconsistency; separate proven violations from subjective suggestions. A passing functional journey or recording alone is not design approval.

Fix proven violations before completion. Review intentional visual changes and their baseline diffs before updating references; never auto-accept a snapshot because a check failed. Keep baseline capture and comparison in the same browser/runtime environment. Preserve accessibility and forced-colors behavior.
