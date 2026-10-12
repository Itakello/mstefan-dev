import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { chromium, expect } from '@playwright/test';
import { installOfflineReview } from '../../e2e/offline-review.ts';

assert.equal(process.platform, 'linux', 'Native evidence requires the isolated Linux display');
assert.match(process.env.DISPLAY ?? '', /^:\d+(?:\.\d+)?$/, 'Missing isolated Xvfb display');
const devices = execFileSync('ffmpeg', ['-hide_banner', '-devices'], { encoding: 'utf8', timeout: 10_000, stdio: ['ignore', 'pipe', 'pipe'] });
assert.match(devices, /^\s*D\s+x11grab\s/m, 'FFmpeg X11 capture is unavailable');
const base = new URL(process.env.PLAYWRIGHT_BASE_URL);
assert.equal(base.hostname, '127.0.0.1', 'Only the isolated fixture may be captured');
const headSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
assert.equal(headSha, process.env.VISUAL_REVIEW_HEAD_SHA, 'Review source changed');
const build = JSON.parse(await readFile('.next/visual-review-build.json', 'utf8'));
assert.equal(build.headSha, headSha, 'Build source differs from the review head');
assert.equal(build.buildId, (await readFile('.next/BUILD_ID', 'utf8')).trim(), 'Build identity changed');
const directory = '.artifacts/playwright/test-results/native-favicon';
await mkdir(directory, { recursive: true });
const proof = { headSha, buildId: build.buildId, captures: [] };

for (const theme of ['light', 'dark']) {
  const browser = await chromium.launch({ headless: false, args: ['--window-size=1280,900', '--window-position=0,0', ...(theme === 'dark' ? ['--force-dark-mode'] : [])] });
  try {
    const context = await browser.newContext({ viewport: null, colorScheme: theme, reducedMotion: 'reduce', locale: 'en-US' });
    await installOfflineReview(context);
    await context.addInitScript(value => localStorage.setItem('theme', value), theme);
    const asset = theme === 'dark' ? '/icon.png' : '/icon-light.png';
    const assetBytes = await readFile(`public${asset}`);
    const tabs = [];
    for (const pathname of ['/en', '/en/about', '/fr/old-page']) {
      const page = await context.newPage();
      const response = await page.goto(new URL(pathname, base).href);
      assert.equal(response.status(), pathname.startsWith('/fr/') ? 404 : 200);
      assert.ok((await response.text()).includes(build.buildId), 'Rendered route uses another build');
      await expect(page.locator('html')).toHaveClass(theme === 'dark' ? /\bdark\b/ : /^(?!.*\bdark\b)/);
      await expect(page.locator('link[rel="icon"]')).toHaveCount(1);
      await expect(page.locator('link[rel="icon"]')).toHaveAttribute('href', asset);
      const fetched = await context.request.get(new URL(asset, base).href);
      assert.equal(fetched.status(), 200);
      assert.deepEqual(await fetched.body(), assetBytes, 'Active favicon differs from its source asset');
      await page.waitForLoadState('networkidle');
      const session = await context.newCDPSession(page);
      const { windowId } = await session.send('Browser.getWindowForTarget');
      tabs.push({ pathname, windowId, asset, assetSha256: createHash('sha256').update(assetBytes).digest('hex') });
    }
    assert.equal(context.pages().length, 3);
    assert.equal(new Set(tabs.map(tab => tab.windowId)).size, 1, 'Native proof requires three tabs in one task-only window');
    const active = context.pages().at(-1);
    await active.bringToFront();
    const session = await context.newCDPSession(active);
    await session.send('Browser.setWindowBounds', { windowId: tabs[0].windowId, bounds: { left: 0, top: 0, width: 1280, height: 900, windowState: 'normal' } });
    const { bounds } = await session.send('Browser.getWindowBounds', { windowId: tabs[0].windowId });
    assert.deepEqual({ left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height }, { left: 0, top: 0, width: 1280, height: 900 });
    await active.evaluate(async () => {
      await document.fonts.ready;
      await Promise.all([...document.images].map(image => image.decode()));
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    });
    const file = `favicon-browser-${theme}.png`;
    execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-f', 'x11grab', '-video_size', '1280x900', '-i', `${process.env.DISPLAY}+0,0`, '-frames:v', '1', '-threads', '1', '-y', `${directory}/${file}`], { timeout: 30_000, stdio: 'inherit' });
    const png = await readFile(`${directory}/${file}`);
    assert.equal(png.subarray(0, 8).toString('hex'), '89504e470d0a1a0a');
    assert.equal(png.readUInt32BE(16), 1280);
    assert.equal(png.readUInt32BE(20), 900);
    proof.captures.push({ file, theme, tabs, sha256: createHash('sha256').update(png).digest('hex') });
  } finally {
    await browser.close();
  }
}
await writeFile(`${directory}/proof.json`, JSON.stringify(proof, null, 2));
