// Render the vector source into Windows shortcut and touch icons. No image service.
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'public/assets');
const svg = await fs.readFile(path.join(assets, 'logo-mark.svg'), 'utf8');
const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage();
  const entries = [];
  for (const size of [16, 32, 48, 256]) {
    await page.setViewportSize({ width: size, height: size });
    await page.setContent(`<style>html,body{margin:0;background:transparent}svg{display:block;width:100vw;height:100vh}</style>${svg}`);
    entries.push({ size, png: await page.screenshot({ type: 'png', omitBackground: true }) });
  }
  const header = Buffer.alloc(6 + entries.length * 16);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(entries.length, 4);
  let offset = header.length;
  entries.forEach(({ size, png }, i) => {
    const position = 6 + i * 16;
    header[position] = header[position + 1] = size === 256 ? 0 : size;
    header.writeUInt16LE(1, position + 4);
    header.writeUInt16LE(32, position + 6);
    header.writeUInt32LE(png.length, position + 8);
    header.writeUInt32LE(offset, position + 12);
    offset += png.length;
  });
  await fs.writeFile(path.join(assets, 'app.ico'), Buffer.concat([header, ...entries.map(entry => entry.png)]));
  await page.setViewportSize({ width: 192, height: 192 });
  await page.screenshot({ path: path.join(assets, 'app-192.png'), omitBackground: true });
  console.log('Generated app.ico (16/32/48/256px) and app-192.png from logo-mark.svg.');
} finally { await browser.close(); }
