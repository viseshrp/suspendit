import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');
const iconDir = resolve(rootDir, 'public/icon');
const svgPath = resolve(iconDir, 'icon.svg');
const sizes = [16, 19, 32, 38, 48, 96, 128];

function buildSvg(size = 128) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 128 128" fill="none">
  <defs>
    <linearGradient id="night" x1="12" y1="8" x2="112" y2="124" gradientUnits="userSpaceOnUse">
      <stop stop-color="#233F48"/><stop offset="1" stop-color="#10262F"/>
    </linearGradient>
    <linearGradient id="moon" x1="46" y1="43" x2="84" y2="96" gradientUnits="userSpaceOnUse">
      <stop stop-color="#D7FFE8"/><stop offset="1" stop-color="#77DAB0"/>
    </linearGradient>
  </defs>
  <rect x="4" y="4" width="120" height="120" rx="30" fill="url(#night)"/>
  <path d="M29 39V32C29 27.6 32.6 24 37 24H53C57 24 59 27 62 31H91C95.4 31 99 34.6 99 39" stroke="#91BAAE" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>
  <path d="M76 47C72 59 76 73 88 79C82 90 68 97 55 91C42 86 36 71 42 58C48 45 63 40 76 47Z" fill="url(#moon)"/>
  </svg>`;
}

mkdirSync(iconDir, { recursive: true });
writeFileSync(svgPath, `${buildSvg()}\n`);

const browser = await chromium.launch();

try {
  for (const size of sizes) {
    const page = await browser.newPage({
      deviceScaleFactor: 1,
      viewport: { width: size, height: size }
    });

    await page.setContent(
      `<!doctype html><html><body style="margin:0;background:transparent;overflow:hidden;">${buildSvg(size)}</body></html>`
    );

    await page.screenshot({
      omitBackground: true,
      path: resolve(iconDir, `${size}.png`)
    });

    await page.close();
  }
} finally {
  await browser.close();
}
