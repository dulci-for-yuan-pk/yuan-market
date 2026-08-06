/* Decode text-committed image payloads back into real binaries at build time.
   Binary files cannot be pushed reliably through the GitHub integration, so
   they travel as base64 text and are restored here. Zero dependencies. */
import { readdir, readFile, writeFile, mkdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';

const ENC = 'assets/enc';
const OUT = 'img';

await mkdir(OUT, { recursive: true });
let n = 0;
for (const f of await readdir(ENC)) {
  if (!f.endsWith('.b64')) continue;
  const raw = (await readFile(path.join(ENC, f), 'utf8')).replace(/\s+/g, '');
  const target = path.join(OUT, f.replace(/\.b64$/, ''));
  await writeFile(target, Buffer.from(raw, 'base64'));
  n++;
  console.log(`decoded ${target} (${Buffer.from(raw, 'base64').length} bytes)`);
}
console.log(`build: restored ${n} image(s)`);

/* Content-hash the assets so a deployed fix can never be masked by a stale cache. */
const stamp = {};
for (const f of ['assets/yuan.css', 'assets/yuan.js', 'assets/i18n.js']) {
  try {
    const b = await readFile(f);
    stamp[path.basename(f)] = createHash('sha1').update(b).digest('hex').slice(0, 8);
  } catch (e) {}
}
for (const page of await walk('.')) {
  let html = await readFile(page, 'utf8');
  const before = html;
  for (const [name, hash] of Object.entries(stamp)) {
    html = html.replace(
      new RegExp(`(/assets/${name.replace('.', '\\.')})(\\?v=[a-f0-9]+)?`, 'g'),
      `$1?v=${hash}`
    );
  }
  if (html !== before) { await writeFile(page, html); console.log(`versioned ${page}`); }
}

async function walk(dir, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    if (e.name.startsWith('.') || e.name === 'node_modules' || e.name === 'netlify') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) await walk(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}
