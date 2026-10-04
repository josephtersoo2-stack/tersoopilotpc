import path from 'node:path';
import { Camoufox } from 'camoufox-js';
import { resolveCamoufoxBinary } from '../packages/core/src/engines/camoufox/resolveBinary';

const bin = resolveCamoufoxBinary();
console.log('Testing Camoufox about:policies with binary:', bin);

const ctx = await Camoufox({
  headless: true,
  executable_path: bin,
  os: 'windows',
});

const page = ctx.pages()[0] || await ctx.newPage();
await page.goto('about:policies');
await page.waitForTimeout(2000);

const policiesHtml = await page.evaluate(() => {
  return document.body.innerText;
});

console.log('--- ABOUT:POLICIES OUTPUT ---');
console.log(policiesHtml);

await ctx.close();
