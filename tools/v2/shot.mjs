#!/usr/bin/env node
// Screenshot a page of the app with the system Chrome (Playwright).
// usage: node tools/v2/shot.mjs <url> <out.png> [--dark] [--width=1280] [--height=820] [--full] [--wait=600] [--click=<css>]...
import { chromium } from 'playwright';
const args = process.argv.slice(2);
const [url, out] = args.filter((a) => !a.startsWith('--'));
const opt = (k, d) => {
  const a = args.find((x) => x.startsWith(`--${k}=`));
  return a ? a.split('=').slice(1).join('=') : d;
};
const flags = new Set(args.filter((a) => a.startsWith('--') && !a.includes('=')).map((a) => a.slice(2)));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({
  viewport: { width: Number(opt('width', 1280)), height: Number(opt('height', 820)) },
  colorScheme: flags.has('dark') ? 'dark' : 'light',
  deviceScaleFactor: 1,
});
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto(url, { waitUntil: 'networkidle' });
for (const sel of args.filter((a) => a.startsWith('--click=')).map((a) => a.slice(8))) {
  await page.click(sel);
  await page.waitForTimeout(300);
}
await page.waitForTimeout(Number(opt('wait', 600)));
await page.screenshot({ path: out, fullPage: flags.has('full') });
await browser.close();
console.log(out + (errors.length ? `\nconsole errors:\n${errors.join('\n')}` : ''));
