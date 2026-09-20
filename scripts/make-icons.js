#!/usr/bin/env node
/**
 * Собирает иконки приложения (PWA + Android) из выбранного варианта.
 *
 * Выбор иконки:  icons/app/app-icon.json  →  { "selected": ... }
 *   - число 1..6  → векторный вариант icons/app/icon-N.svg (арт в <g id="art">)
 *   - буква A..Z  → AI-растр icons/app/raster/icon-X.png (1024×1024, полный фон)
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
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const BG = '#1e3a2f';

const cfg = JSON.parse(readFileSync(join(ROOT, 'icons/app/app-icon.json'), 'utf8'));
const sel = String(cfg.selected).trim();

const svgOf = (inner) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${inner}</svg>`;
const maskSvg = (shape) => svgOf(shape);

let variant; // { any: Buffer(svg|png), maskable, round } + isRaster

if (/^\d+$/.test(sel)) {
  // ===== ВЕКТОРНЫЙ вариант (icon-N.svg, арт в <g id="art">) =====
  const n = Number(sel);
  const artSrc = readFileSync(join(ROOT, `icons/app/icon-${n}.svg`), 'utf8');
  const m = artSrc.match(/<g id="art"([^>]*)>([\s\S]*)<\/g>\s*<\/svg>/);
  if (!m) throw new Error(`icon-${n}.svg: не найден <g id="art">`);
  const art = m[2];
  const artAttrs = m[1];

  variant = {
    isRaster: false,
    name: cfg.options[String(n)] || ('SVG ' + n),
    any: svgOf(
      `<defs><clipPath id="clipR"><rect width="512" height="512" rx="112" ry="112"/></clipPath></defs>` +
      `<g clip-path="url(#clipR)"><rect width="512" height="512" fill="${BG}"/>` +
      `<g${artAttrs}>${art}</g></g>`
    ),
    maskable: svgOf(
      `<rect width="512" height="512" fill="${BG}"/>` +
      `<g transform="translate(51.2 51.2) scale(0.8)"><g${artAttrs}>${art}</g></g>`
    ),
    round: svgOf(
      `<defs><clipPath id="clipC"><circle cx="256" cy="256" r="256"/></clipPath></defs>` +
      `<g clip-path="url(#clipC)"><rect width="512" height="512" fill="${BG}"/>` +
      `<g${artAttrs}>${art}</g></g>`
    ),
  };
} else if (/^[A-Za-z]$/.test(sel)) {
  // ===== РАСТР (AI-иконка icon-X.png) =====
  const id = sel.toUpperCase();
  const file = join(ROOT, `icons/app/raster/icon-${id}.png`);
  if (!exists(file)) throw new Error(`Не найдена AI-иконка icons/app/raster/icon-${id}.png`);

  // AI-картинки приходят «скруглённый квадрат на белом холсте» —
  // автоматически: 1) вырезаем bbox непустого, 2) срезаем белые углы, 3) докрашиваем фон.
  const { data, info } = await sharp(file).raw().toBuffer({ resolveWithObject: true });
  const W = info.width, H = info.height, ch = info.channels;
  const isWhite = (x, y) => { const i = (y * W + x) * ch; return data[i] > 240 && data[i + 1] > 240 && data[i + 2] > 240; };

  // 1) bbox непустого (шаг 2px — быстро)
  let minx = W, maxx = -1, miny = H, maxy = -1;
  for (let y = 0; y < H; y += 2)
    for (let x = 0; x < W; x += 2)
      if (!isWhite(x, y)) {
        if (x < minx) minx = x; if (x > maxx) maxx = x;
        if (y < miny) miny = y; if (y > maxy) maxy = y;
      }
  if (maxx < 0) throw new Error(`icon-${id}.png: картинка вся белая`);
  const bw = maxx - minx + 1, bh = maxy - miny + 1;
  const s = Math.min(bw, bh);
  const crop = { left: minx + Math.floor((bw - s) / 2), top: miny + Math.floor((bh - s) / 2), width: s, height: s };

  // 2) длина белого по диагонали из угла → радиус скругления контента
  let dWhite = 0;
  for (let t = 0; t < s / 2; t++) {
    if (isWhite(crop.left + t, crop.top + t)) dWhite = t + 1; else break;
  }
  const cornerR = dWhite / 1.707;

  // 3) базовое 512×512: вырез → срез белых углов (если есть)
  let base = await sharp(file).extract(crop).resize(512, 512, { fit: 'cover' }).png().toBuffer();
  if (cornerR > 2) {
    const r512 = Math.round((cornerR * 1.12 / s) * 512);
    base = await sharp(base).composite([{
      input: Buffer.from(svgOf(`<rect width="512" height="512" rx="${r512}" ry="${r512}" fill="#fff"/>`)),
      blend: 'dest-in',
    }]).png().toBuffer();
  }

  // цвет фона — средний по левому краю по центру (там точно фон, а не арт)
  const { data: d4, info: i4 } = await sharp(file)
    .extract({ left: crop.left + 2, top: crop.top + Math.floor(s / 2) - 4, width: 8, height: 8 })
    .raw().toBuffer({ resolveWithObject: true });
  let cr = 0, cg = 0, cb = 0, cn = 0;
  for (let i = 0; i < d4.length; i += i4.channels) { cr += d4[i]; cg += d4[i + 1]; cb += d4[i + 2]; cn++; }
  const bgR = Math.round(cr / cn), bgG = Math.round(cg / cn), bgB = Math.round(cb / cn);
  const bgHex = '#' + [bgR, bgG, bgB].map(v => v.toString(16).padStart(2, '0')).join('');

  // докрашиваем углы (прозрачные после среза) цветом фона — база непрозрачная
  const bgFill = await sharp({ create: { width: 512, height: 512, channels: 4, background: { r: bgR, g: bgG, b: bgB, alpha: 1 } } })
    .png().toBuffer();
  base = await sharp(bgFill).composite([{ input: base }]).png().toBuffer();

  const clip = async (shape) =>
    sharp(base).composite([{ input: Buffer.from(maskSvg(shape)), blend: 'dest-in' }]).png().toBuffer();

  // maskable: арт в безопасной зоне 80% (410px) по центру, подложка — цвет фона
  const art80 = await sharp(base).resize(410, 410, { fit: 'cover' }).png().toBuffer();
  const bgCanvas = { r: bgR, g: bgG, b: bgB, alpha: 1 };

  variant = {
    isRaster: true,
    name: cfg.options[id] || ('растр ' + id),
    any: await clip(`<rect width="512" height="512" rx="112" ry="112" fill="#fff"/>`),
    round: await clip(`<circle cx="256" cy="256" r="256" fill="#fff"/>`),
    maskable: await sharp({ create: { width: 512, height: 512, channels: 4, background: bgCanvas } })
      .composite([{ input: art80, top: 51, left: 51 }]).png().toBuffer(),
    faviconPng: base,
    bgHex,
  };
  console.log(`  (автообрезка: bbox ${s}×${s}, скругление ~${Math.round(cornerR)}px, фон ${bgHex})`);
} else {
  throw new Error(`Непонятный selected: "${sel}" (ожидается число 1..6 или буква A..Z)`);
}

const render = async (img, size, out) => {
  mkdirSync(dirname(out), { recursive: true });
  const isSvg = typeof img === 'string';
  const pipe = sharp(isSvg ? Buffer.from(img) : img, isSvg ? { density: 192 } : {})
    .resize(size, size, { fit: 'cover' }).png();
  await pipe.toFile(out);
  console.log(`  ${out.replace(ROOT + '/', '')}  ${size}×${size}`);
};

console.log(`Иконка ${sel}: ${variant.name}`);

// --- PWA (public/) ---
await render(variant.any, 192, join(ROOT, 'public/icons/icon-192.png'));
await render(variant.any, 512, join(ROOT, 'public/icons/icon-512.png'));
await render(variant.maskable, 512, join(ROOT, 'public/icons/icon-maskable-512.png'));

// --- Android mipmap ---
const densities = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 };
for (const [dpi, px] of Object.entries(densities)) {
  await render(variant.any, px, join(ROOT, `android/app/src/main/res/mipmap-${dpi}/ic_launcher.png`));
  await render(variant.round, px, join(ROOT, `android/app/src/main/res/mipmap-${dpi}/ic_launcher_round.png`));
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
const faviconHref = variant.isRaster
  ? 'icons/icon-192.png'
  : 'data:image/svg+xml,' + encodeURIComponent(variant.any);
// Целим строкой (а не regex-ом): в data-URI favicon'а есть собственные '>'
const replaceLine = (tag, line) =>
  html.split('\n').map(l => l.includes(tag) ? line : l).join('\n');
html = replaceLine('rel="icon"', `    <link rel="icon" href="${faviconHref}" />`);
if (!/rel="apple-touch-icon"/.test(html)) {
  html = html.replace(
    /(<link rel="manifest"[^>]*\/>)/,
    `$1\n    <link rel="apple-touch-icon" href="icons/icon-192.png" />`
  );
} else {
  html = replaceLine('rel="apple-touch-icon"', '    <link rel="apple-touch-icon" href="icons/icon-192.png" />');
}
writeFileSync(htmlPath, html);
console.log('  index.html — favicon обновлён');

console.log('Готово.');

function exists(p) { try { readFileSync(p); return true } catch { return false } }
