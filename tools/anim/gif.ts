import { chromium, type Page } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GifOptions {
  /** 目标输出 .gif 路径 */
  out: string;
  /** 预览页 HTML；与 url 二选一 */
  html?: string;
  /** 预览页 URL；与 html 二选一 */
  url?: string;
  width: number;
  height: number;
  frames: number;
  fps?: number;
  /** 只截某个元素（CSS selector） */
  selector?: string;
  /** 每帧设置接口；默认调用 window.__previewSetFrame({ frame, t, fps }) */
  setFrameExpression?: (frame: number, t: number, fps: number) => string;
  /** 截图前等待的额外条件 */
  waitForFunction?: string;
  /** 背景色 */
  background?: string;
  /** ffmpeg 路径 */
  ffmpeg?: string;
  /** 是否保留帧序列（默认 false） */
  keepFrames?: boolean;
}

function browserExecutable(): string | undefined {
  if (process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE) return process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE;
  const candidates = [
    '/Users/haokee/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
  return candidates.find((p) => fs.existsSync(p));
}

function ffmpegBin(): string {
  const candidates = ['/opt/homebrew/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/usr/bin/ffmpeg'];
  return candidates.find((p) => fs.existsSync(p)) ?? 'ffmpeg';
}

async function renderFrames(page: Page, dir: string, opts: GifOptions, fps: number): Promise<void> {
  const setExpr =
    opts.setFrameExpression ??
    ((frame, t, f) => `window.__previewSetFrame && window.__previewSetFrame(${JSON.stringify({ frame, t, fps: f })})`);

  for (let i = 0; i < opts.frames; i++) {
    const t = i / fps;
    await page.evaluate(setExpr(i, t, fps));
    // Let the renderer/RAF apply the frame. No fixed sleep; a microtask + frame is enough.
    await page.evaluate(
      () =>
        new Promise<void>((resolve) => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        }),
    );
    const file = path.join(dir, `frame-${String(i).padStart(4, '0')}.png`);
    if (opts.selector) {
      const el = page.locator(opts.selector).first();
      await el.screenshot({ path: file });
    } else {
      await page.screenshot({ path: file, clip: { x: 0, y: 0, width: opts.width, height: opts.height } });
    }
  }
}

export async function captureGif(opts: GifOptions): Promise<{ gif: string; meta: string; frames: number; fps: number }> {
  const fps = opts.fps ?? 30;
  const out = path.resolve(opts.out);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  const tmp = fs.mkdtempSync(path.join(path.dirname(out), '.frames-'));
  const exe = browserExecutable();
  const browser = await chromium.launch({ headless: true, executablePath: exe });
  const page = await browser.newPage({
    viewport: { width: opts.width, height: opts.height },
    deviceScaleFactor: 1,
  });
  try {
    if (opts.html) {
      await page.setContent(opts.html, { waitUntil: 'load' });
    } else if (opts.url) {
      await page.goto(opts.url, { waitUntil: 'load' });
    } else {
      throw new Error('captureGif: html or url is required');
    }
    if (opts.background) {
      await page.addStyleTag({ content: `html,body{background:${opts.background};}` });
    }
    await page.evaluate(async () => {
      await (document as Document & { fonts?: FontFaceSet }).fonts?.ready;
    });
    if (opts.waitForFunction) {
      await page.waitForFunction(opts.waitForFunction, null, { timeout: 15000 });
    }
    await renderFrames(page, tmp, opts, fps);
  } finally {
    await browser.close();
  }

  const palette = path.join(tmp, 'palette.png');
  const framesGlob = path.join(tmp, 'frame-%04d.png');
  const ff = opts.ffmpeg ?? ffmpegBin();
  await execFileAsync(ff, ['-y', '-framerate', String(fps), '-i', framesGlob, '-vf', 'palettegen=stats_mode=diff', palette], {
    maxBuffer: 1024 * 1024 * 8,
  });
  await execFileAsync(
    ff,
    [
      '-y',
      '-framerate', String(fps),
      '-i', framesGlob,
      '-i', palette,
      '-lavfi', 'paletteuse=dither=bayer:bayer_scale=5',
      '-loop', '0',
      out,
    ],
    { maxBuffer: 1024 * 1024 * 8 },
  );

  const metaPath = out.replace(/\.gif$/i, '.json');
  const meta = {
    gif: path.relative(process.cwd(), out),
    frames: opts.frames,
    fps,
    width: opts.width,
    height: opts.height,
    loop: true,
    generatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2) + '\n');

  if (!opts.keepFrames) {
    fs.rmSync(tmp, { recursive: true, force: true });
  } else {
    console.log(`[gif] frames kept: ${tmp}`);
  }
  return { gif: out, meta: metaPath, frames: opts.frames, fps };
}
