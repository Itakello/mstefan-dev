# Presentation previews

Notion owns the original `Slides URL` and optional `Slides preview URL`. The preview URL points to an owned static export at `https://www.mstefan.dev/presentations/<deck>/index.html`; both languages render the same asset. Without an export, visitors can download the original PowerPoint. There is no external viewer fallback.

## Refresh PhysIQ

The current export comes from Academic-Repository commit `0f53a1cdf0355e334e63def6735c1c36246b79a8`, file `2025/04-Thesis_Master/presentation.pptx`.

1. Import that PowerPoint into Keynote, duplicate it, and set the duplicate's slide size to 1920 × 1080. Export HTML into a new local directory; preserve the original PowerPoint.
2. Replace `public/presentations/physiq/` with the export. Preserve the bundled player and its license notices. Set the HTML title to `PhysIQ — Presentation` and retain `initial-scale=1,width=device-width` without disabling pinch zoom.
3. In the generated player's `initVideo`, immediately after `const A=document.createElement("video");`, set `A.muted=!0,A.playsInline=!0;`. This supports inline muted playback on mobile browsers. In `handleSwipeEvent`, map the one-finger right swipe to `goBackToPreviousBuild` so backward swipe reverses one build, matching the site arrow. These are the only player adaptations.
4. Remove each exported MP4's audio track using `ffmpeg -i INPUT -map 0:v:0 -c:v copy -an -movflags +faststart OUTPUT`, then replace the exported file with that output. This retains the encoded video and guarantees silence even on devices that ignore volume settings.
5. Verify all 25 slides, click builds, PhyRE GIF motion, silent video loops, swipe, and responsive sizing in the integrated site before publishing. Keynote substitutes unavailable fonts; inspect layouts after each export. Original raster images and videos cannot gain detail from the higher slide resolution.

Publishing a new export still requires reviewing the site preview and updating the approved Notion references. A local fixture does not publish content.
