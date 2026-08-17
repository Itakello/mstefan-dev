# About portrait design QA

## Visual truth

- Source portrait: `public/profile-photo.jpg` (1530 x 2054, Display P3)
- Desktop render: `/tmp/mstefan-about-original-p3-desktop.png` (1280 x 720)
- Annotated responsive render: `/tmp/mstefan-about-original-p3-585.png` with the About page captured in a 585 x 900 viewport
- Natural-crop render: `/tmp/mstefan-about-original-p3-585-bottom.png` with the responsive viewport scrolled to the source image's lower edge
- State: dark theme, About route, production build served locally

## Checks

- Typography: existing About heading and body styles are unchanged and remain readable beside the portrait.
- Layout: two columns at desktop width; copy appears first and the portrait stacks below it at mobile width.
- Spacing: the portrait aligns with the top of the copy and preserves comfortable separation at both widths.
- Image quality: the exact 1530 x 2054 Display P3 source is served without image optimization, recompression, generated pixels, or upscaling.
- Color and framing: the source color profile and original natural crop are preserved; the restrained border and radius match the site's existing card language.
- Content: About copy and footer are unchanged.
- Accessibility: the image has descriptive alternative text.

## Findings and iteration history

- Desktop comparison: no actionable P0, P1, or P2 mismatch.
- Annotated viewport comparison: no actionable P0, P1, or P2 mismatch. The 585 x 900 render measures the portrait at 382 x 513 CSS pixels inside a 384 px figure, loads the exact 1530 x 2054 source, and has no horizontal overflow.
- Annotation iteration: disabled image recompression and capped the portrait width after the initial implementation appeared soft and oversized in a 585 x 900 browser viewport.
- Original-photo iteration: removed the generated lower extension and restored the exact higher-resolution Display P3 source, accepting its natural lower crop.

final result: passed
