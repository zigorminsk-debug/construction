#!/usr/bin/env node
/**
 * Собирает иконки приложения (PWA + Android) из выбранного варианта.
 *
 * Выбор иконки:  icons/app/app-icon.json  →  { "selected": 1..6 }
 * Варианты:      icons/app/icon-1.svg … icon-6.svg  (арт в <g id="art">, холст 512×512)
 *
 * Запуск:  node scripts/make-icons.js
 *
 * Что генерируется:
 *   public/icons/icon-192.png, icon-512.png, icon-maskable-512.png   (PWA)
 *   android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/            (ic_launcher + round)
 *   + переписывает icons в manifest.json и favicon в index.html
 *
 * ВАЖНО: сгенерированные PNG коммитить в репозиторий (CI пересобирает их перед build).
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BG = '#1e3a2f';

const cfg = JSON.parse(readFileSync(join(ROOT, 'icons/app/app-icon.json'), 'utf8'));
const n = Number(cfg.selected);
const artSrc = readFileSync(join(ROOT, `icons/app/icon-${n}.svg`), 'utf8');

// вытаскиваем содержимое <g id="art" ...> … </g> (последний закрывающий тег группы)
const m = artSrc.match(/<g id="art"([^>]*)>([\s\S]*)<\/g>\s*<\/svg>/);
if (!m) throw new Error(`icon-${n}.svg: не найден <g id="art">`);
const artAttrs = m[1];
const art = m[2];

const wrap = (inner) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${inner}</svg>`;

// «any» — скруглённый квадрат (стандарт PWA/launcher)
const svgAny = wrap(
  `<defs><clipPath id="clipR"><rect width="512" height="512" rx="112" ry="112"/></clipPath></defs>` +
  `<g clip-path="url(#clipR)"><rect width="512" height="512" fill="${BG}"/>` +
  `<g${artAttrs}>${art}</g></g>`
);
// «maskable» — полный фон, арт в безопасной зоне 80% (Android может вырезать в круг/каплю/скальный)
const svgMaskable = wrap(
  `<rect width="512" height="512" fill="${BG}"/>` +
  `<g transform="translate(51.2 51.2) scale(0.8)"><g${artAttrs}>${art}</g></g>`
);
// «round» — круг (Android roundIcon)
const svgRound = wrap(
  `<defs><clipPath id="clipC"><circle cx="256" cy="256" r="256"/></clipPath></defs>` +
  `<g clip-path="url(#clipC)"><rect width="512" height="512" fill="${BG}"/>` +
  `<g${artAttrs}>${art}</g></g>`
);

const render = async (svg, size, out) => {
  mkdirSync(dirname(out), { recursive: true });
  await sharp(Buffer.from(svg), { density: 192 })
    .resize(size, size, { fit: 'cover' })
    .png()
    .toFile(out);
  console.log(`  ${out.replace(ROOT + '/', '')}  ${size}×${size}`);
};

console.log(`Иконка ${n}: ${cfg.options[String(n)]}`);

// --- PWA (public/) ---
await render(svgAny, 192, join(ROOT, 'public/icons/icon-192.png'));
await render(svgAny, 512, join(ROOT, 'public/icons/icon-512.png'));
await render(svgMaskable, 512, join(ROOT, 'public/icons/icon-maskable-512.png'));

// --- Android mipmap ---
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [dpi, px] of Object.entries(densities)) {
  await render(svgAny, px, join(ROOT, `android/app/src/main/res/mipmap-${dpi}/ic_launcher.png`));
  await render(svgRound, px, join(ROOT, `android/app/src/main/res/mipmap-${dpi}/ic_launcher_round.png`));
}

// --- manifest.json ---
const manifestPath = join(ROOT, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
manifest.icons = [
  { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
  { src: 'icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
];
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n');
console.log('  manifest.json — обновлён');

// --- index.html: favicon + apple-touch-icon ---
const htmlPath = join(ROOT, 'index.html');
let html = readFileSync(htmlPath, 'utf8');
const faviconUri = 'data:image/svg+xml,' + encodeURIComponent(svgAny);
html = html.replace(
  /<link rel="icon"[^>]*>/,
  `<link rel="icon" href="${faviconUri}" />`
);
if (!/rel="apple-touch-icon"/.test(html)) {
  html = html.replace(
    /(<link rel="manifest"[^>]*\/>)/,
    `$1\n    <link rel="apple-touch-icon" href="icons/icon-192.png" />`
  );
} else {
  html = html.replace(/<link rel="apple-touch-icon"[^>]*>/, '<link rel="apple-touch-icon" href="icons/icon-192.png" />');
}
writeFileSync(htmlPath, html);
console.log('  index.html — favicon обновлён');

console.log('Готово.');
