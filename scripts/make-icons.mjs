// Renders the anchor mark to the PNG icons the web app manifest needs. Run once: `node scripts/make-icons.mjs`.
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const { chromium } = createRequire(import.meta.url)('playwright');
const PETROL = '#13505e';
const SUN = '#f3b324';

/** `padding` keeps the mark inside the maskable safe zone (inner 80 %). */
const svg = (size, padding) => `
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="${padding ? 0 : 22}" fill="${PETROL}"/>
  <g transform="translate(${padding} ${padding}) scale(${(100 - 2 * padding) / 24})" fill="none" stroke="${SUN}" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round">
    <circle cx="12" cy="5" r="2.5"/><path d="M12 7.5V21M5 13a7 7 0 0 0 14 0M8 11h8"/>
  </g>
</svg>`;

const icons = [
  { file: 'icon-192.png', size: 192, padding: 14 },
  { file: 'icon-512.png', size: 512, padding: 14 },
  { file: 'icon-maskable-512.png', size: 512, padding: 24 },
  { file: 'apple-touch-icon.png', size: 180, padding: 16 },
];

const browser = await chromium.launch();
for (const { file, size, padding } of icons) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:transparent">${svg(size, padding)}</body>`);
  writeFileSync(`public/icons/${file}`, await page.screenshot({ omitBackground: true }));
  await page.close();
}
writeFileSync('public/icons/icon.svg', svg(512, 14).trim() + '\n');
await browser.close();
console.log('icons written to public/icons/');
