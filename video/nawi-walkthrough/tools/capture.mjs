// Records the NAWI-ReportPro demo as crisp 1920x1080 clips via the CDP screencast,
// with an injected cursor so viewers can follow each action.
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const RAW = process.env.RAW;          // scratch dir for frames
const OUT = process.env.OUT;          // project assets/capture dir
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
fs.mkdirSync(RAW, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });
const BASE = process.env.BASE || 'http://localhost:3000';
const API = process.env.API || 'http://localhost:5000/api';
// recording harness side port that edits one sealed reading in the demo DB (tamper shot)
const TAMPER = process.env.TAMPER || 'http://localhost:5055/tamper?session=sess-034';

const CURSOR = `
(() => {
  const install = () => {
    if (document.getElementById('__cur')) return;
    const c = document.createElement('div');
    c.id = '__cur';
    c.innerHTML = '<svg width="26" height="26" viewBox="0 0 24 24"><path d="M4 2 L4 19 L8.6 14.8 L11.6 21.6 L14.4 20.4 L11.4 13.6 L17.6 13.6 Z" fill="#111" stroke="#fff" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    Object.assign(c.style, { position: 'fixed', left: '-40px', top: '-40px', zIndex: 2147483647, pointerEvents: 'none', filter: 'drop-shadow(0 2px 3px rgba(0,0,0,.35))' });
    document.documentElement.appendChild(c);
    const x = parseFloat(sessionStorage.getItem('__cx') || '-40'), y = parseFloat(sessionStorage.getItem('__cy') || '-40');
    c.style.left = (x - 3) + 'px'; c.style.top = (y - 2) + 'px';
    window.addEventListener('mousemove', (e) => { c.style.left = (e.clientX - 3) + 'px'; c.style.top = (e.clientY - 2) + 'px'; sessionStorage.setItem('__cx', e.clientX); sessionStorage.setItem('__cy', e.clientY); }, true);
    window.addEventListener('mousedown', (e) => {
      const r = document.createElement('div');
      Object.assign(r.style, { position: 'fixed', left: (e.clientX - 18) + 'px', top: (e.clientY - 18) + 'px', width: '36px', height: '36px', borderRadius: '50%', border: '3px solid #f59e0b', zIndex: 2147483646, pointerEvents: 'none', transition: 'transform .45s ease-out, opacity .45s ease-out' });
      document.documentElement.appendChild(r);
      requestAnimationFrame(() => { r.style.transform = 'scale(1.8)'; r.style.opacity = '0'; });
      setTimeout(() => r.remove(), 600);
    }, true);
  };
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install); else install();
})();`;

async function newPage(browser, opts) {
  const ctx = await browser.newContext(opts);
  await ctx.addInitScript(CURSOR);
  const p = await ctx.newPage();
  return { ctx, p };
}

async function record(p, name, fn, { maxW = 1920, maxH = 1080 } = {}) {
  if (ONLY && !ONLY.includes(name)) { await fn(); return; }
  const dir = path.join(RAW, name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await p.context().newCDPSession(p);
  const frames = [];
  cdp.on('Page.screencastFrame', async (f) => {
    const i = frames.length;
    const file = path.join(dir, `f${String(i).padStart(5, '0')}.jpg`).split(path.sep).join('/');
    fs.writeFileSync(file, Buffer.from(f.data, 'base64'));
    frames.push({ file, ts: f.metadata.timestamp });
    try { await cdp.send('Page.screencastFrameAck', { sessionId: f.sessionId }); } catch {}
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, maxWidth: maxW, maxHeight: maxH, everyNthFrame: 1 });
  const t0 = Date.now() / 1000;
  await fn();
  await p.waitForTimeout(600);
  await cdp.send('Page.stopScreencast');
  const tEnd = Date.now() / 1000;
  await cdp.detach().catch(() => {});
  if (!frames.length) { console.log('no frames for', name); return; }
  // concat list: hold each frame until the next one arrives
  let list = '';
  for (let i = 0; i < frames.length; i++) {
    const next = i + 1 < frames.length ? frames[i + 1].ts : Math.max(frames[i].ts + 0.1, tEnd - t0 + frames[0].ts);
    const d = Math.max(0.001, next - frames[i].ts);
    list += `file '${frames[i].file}'\nduration ${d.toFixed(4)}\n`;
  }
  list += `file '${frames[frames.length - 1].file}'\n`;
  fs.writeFileSync(path.join(dir, 'list.txt'), list);
  const out = path.join(OUT, `${name}.mp4`);
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', path.join(dir, 'list.txt'),
    '-vf', `fps=30,scale=${maxW}:${maxH}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2,format=yuv420p`,
    '-c:v', 'libx264', '-preset', 'medium', '-crf', '17', '-movflags', '+faststart', out]);
  const dur = execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', out]).toString().trim();
  console.log(`clip ${name}: ${frames.length} frames, ${dur}s`);
}

async function moveTo(p, loc, { click = true, steps = 28, pause = 350 } = {}) {
  await loc.scrollIntoViewIfNeeded().catch(() => {});
  const box = await loc.boundingBox();
  if (!box) throw new Error('no box');
  const x = box.x + box.width / 2, y = box.y + box.height / 2;
  await p.mouse.move(x, y, { steps });
  await p.waitForTimeout(pause);
  if (click) { await p.mouse.down(); await p.waitForTimeout(70); await p.mouse.up(); }
}
async function wheel(p, dy, n = 10, gap = 90) { for (let i = 0; i < n; i++) { await p.mouse.wheel(0, dy / n); await p.waitForTimeout(gap); } }
async function still(p, name, full = false) { await p.screenshot({ path: path.join(OUT, `${name}.png`), fullPage: full }); console.log('still', name); }

const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const desk = { viewport: { width: 1440, height: 810 }, deviceScaleFactor: 4 / 3 };
const { p } = await newPage(browser, desk);
await p.goto(`${BASE}/login`);
await p.waitForTimeout(1500);
await p.mouse.move(1100, 700);

// 1. login -> dashboard tour
await record(p, 'c01-login-dashboard', async () => {
  await p.waitForTimeout(1500);
  await moveTo(p, p.getByRole('button', { name: /Inspector/ }).first());
  await p.waitForURL('**/dashboard');
  await p.waitForTimeout(2500);
  await p.mouse.move(820, 500, { steps: 20 });
  await wheel(p, 520, 14, 110);
  await p.waitForTimeout(1800);
  await wheel(p, 560, 14, 110);
  await p.waitForTimeout(1800);
  await wheel(p, 620, 14, 110);
  await p.waitForTimeout(2000);
  await wheel(p, -1700, 10, 60);
  await p.waitForTimeout(800);
});
await still(p, 's-dashboard');

// 2. registry: filter chips + detail of the Bathinda scale (history shows Dec 2025 FAIL)
await record(p, 'c02-registry', async () => {
  await moveTo(p, p.getByRole('link', { name: /Instrument Registry/ }).first());
  await p.waitForURL('**/instruments');
  await p.waitForTimeout(1800);
  await moveTo(p, p.getByRole('button', { name: /^Rejected/ }).first());
  await p.waitForTimeout(2000);
  await moveTo(p, p.getByRole('button', { name: /^All/ }).first());
  await p.waitForTimeout(1200);
  await moveTo(p, p.getByPlaceholder(/Search by name/));
  await p.keyboard.type('Bathinda', { delay: 90 });
  await p.waitForTimeout(1500);
  await moveTo(p, p.getByText('Bathinda Cotton Mandi Platform Scale').first());
  await p.waitForURL('**/instruments/inst-ps-02');
  await p.waitForTimeout(2200);
  await p.mouse.move(900, 600, { steps: 15 });
  await wheel(p, 560, 12, 100);
  await p.waitForTimeout(3000);
});
await still(p, 's-instrument-detail');

// 3. registration form with the live OIML check
await record(p, 'c03-register', async () => {
  await p.goto(`${BASE}/instruments/new`);
  await p.waitForTimeout(1500);
  await moveTo(p, p.getByRole('button', { name: /Fill example data/ }));
  await p.waitForTimeout(1500);
  await p.mouse.move(900, 500, { steps: 15 });
  await wheel(p, 420, 10, 100);
  await p.waitForTimeout(3500);
});
await still(p, 's-register');

// 4. session detail -> creep module -> auto-capture
await record(p, 'c04-session', async () => {
  await p.goto(`${BASE}/tests/sess-034`);
  await p.waitForTimeout(2000);
  await p.mouse.move(800, 500, { steps: 15 });
  await wheel(p, 520, 12, 100);
  await p.waitForTimeout(1500);
  const btn = p.locator('button', { hasText: /Record|Start|Continue|Resume/ }).last();
  await moveTo(p, btn);
  await p.waitForURL('**/TIME_DEPENDENCE');
  await p.waitForTimeout(2500);
});
await record(p, 'c05-creep-capture', async () => {
  await p.waitForTimeout(1200);
  await moveTo(p, p.getByRole('button', { name: /Auto-capture remaining/ }));
  const start = Date.now();
  while (Date.now() - start < 150000) {
    await p.waitForTimeout(1000);
    const done = await p.getByText(/All readings recorded/).count();
    if (done) break;
  }
  await p.waitForTimeout(2500);
});
await still(p, 's-creep-done');

// 5. complete module -> finalise & seal
await record(p, 'c06-seal', async () => {
  await moveTo(p, p.getByRole('button', { name: /Complete module/ }));
  await p.waitForTimeout(2500);
  if (!p.url().endsWith('/tests/sess-034')) { await p.goto(`${BASE}/tests/sess-034`); await p.waitForTimeout(1500); }
  await moveTo(p, p.getByRole('button', { name: /Finalise & seal/ }));
  await p.waitForTimeout(2500);
  await still(p, 's-seal-dialog');
  await moveTo(p, p.getByRole('button', { name: /Sign & seal certificate/ }));
  await p.waitForTimeout(6000);
});
await still(p, 's-after-seal');
console.log('after seal url', p.url());

// 6. report page with pdf preview
await record(p, 'c07-report', async () => {
  if (!p.url().includes('/reports/')) { await p.goto(`${BASE}/reports/sess-034`); }
  await p.waitForTimeout(4000);
  await p.mouse.move(900, 500, { steps: 15 });
  await wheel(p, 700, 14, 120);
  await p.waitForTimeout(2500);
  await wheel(p, 700, 14, 120);
  await p.waitForTimeout(2500);
});
await still(p, 's-report');

// 7. rejection: faulty load cell on the neighbourhood kirana scale
await record(p, 'c08-faulty', async () => {
  await p.goto(`${BASE}/tests/new`);
  await p.waitForTimeout(1500);
  await moveTo(p, p.getByPlaceholder(/Search name, serial/));
  await p.keyboard.type('Kirana', { delay: 80 });
  await p.waitForTimeout(900);
  await moveTo(p, p.getByText('Kirana Store Counter Scale').first());
  await p.waitForTimeout(900);
  await moveTo(p, p.getByRole('button', { name: /Open verification session/ }));
  await p.waitForURL(/\/tests\/[^/]+$/);
  await p.waitForTimeout(1800);
  await p.goto(p.url() + '/WEIGHING_PERFORMANCE');
  await p.waitForTimeout(2500);
  await p.mouse.move(1200, 500, { steps: 10 });
  await wheel(p, 300, 6, 80);
  await moveTo(p, p.getByRole('button', { name: /Faulty load cell/ }));
  await p.waitForTimeout(1500);
  await wheel(p, -300, 6, 80);
  await moveTo(p, p.getByRole('button', { name: /Auto-capture remaining/ }));
  const start = Date.now();
  while (Date.now() - start < 150000) {
    await p.waitForTimeout(1000);
    if (await p.getByText(/All readings recorded/).count()) break;
  }
  await p.waitForTimeout(3000);
});
await still(p, 's-faulty');

// 8. hindi interface
await record(p, 'c09-hindi', async () => {
  await p.goto(`${BASE}/dashboard`);
  await p.waitForTimeout(2000);
  await moveTo(p, p.getByRole('button', { name: 'हिंदी' }).first());
  await p.waitForTimeout(3500);
  await p.mouse.move(820, 500, { steps: 15 });
  await wheel(p, 500, 12, 100);
  await p.waitForTimeout(2500);
});
await still(p, 's-hindi');
await p.getByRole('button', { name: 'English' }).first().click().catch(() => {});

// 9. public verification portal — desktop
const pub = await newPage(browser, desk);
await pub.p.goto(`${BASE}/verify`);
await pub.p.waitForTimeout(1500);
await pub.p.mouse.move(1000, 600);
await record(pub.p, 'c10-verify-desktop', async () => {
  await pub.p.waitForTimeout(1500);
  await moveTo(pub.p, pub.p.locator('#cert'));
  await pub.p.keyboard.type('NAWI-2026-000124', { delay: 110 });
  await pub.p.waitForTimeout(500);
  await moveTo(pub.p, pub.p.getByRole('button', { name: /Verify/ }).first());
  await pub.p.waitForTimeout(3500);
  await pub.p.mouse.move(900, 500, { steps: 15 });
  await wheel(pub.p, 650, 14, 110);
  await pub.p.waitForTimeout(2500);
  await wheel(pub.p, 650, 14, 110);
  await pub.p.waitForTimeout(2500);
});
await still(pub.p, 's-verify-desktop');

// 10. public verification — phone (as scanned from the QR sticker)
const mob = await newPage(browser, { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await record(mob.p, 'c11-verify-mobile', async () => {
  await mob.p.goto(`${BASE}/verify/NAWI-2026-000124`);
  await mob.p.waitForTimeout(3500);
  for (let i = 0; i < 4; i++) { await mob.p.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' })); await mob.p.waitForTimeout(1800); }
}, { maxW: 1170, maxH: 2532 });
await still(mob.p, 's-mobile-valid');
await record(mob.p, 'c12-verify-mobile-rejected', async () => {
  await mob.p.goto(`${BASE}/verify/NAWI-2026-000120`);
  await mob.p.waitForTimeout(3500);
  for (let i = 0; i < 3; i++) { await mob.p.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' })); await mob.p.waitForTimeout(1800); }
}, { maxW: 1170, maxH: 2532 });
await mob.p.goto(`${BASE}/verify/NAWI-2026-000120`);
await mob.p.waitForTimeout(2500);
await still(mob.p, 's-mobile-rejected');

// 10b. tamper: edit one sealed reading directly in the database, then scan the same QR again
if (!ONLY || ONLY.includes('c14-verify-mobile-tampered')) console.log('tamper', await (await fetch(TAMPER)).text());
await record(mob.p, 'c14-verify-mobile-tampered', async () => {
  await mob.p.goto(`${BASE}/verify/NAWI-2026-000124`);
  await mob.p.waitForTimeout(3500);
  for (let i = 0; i < 2; i++) { await mob.p.evaluate(() => window.scrollBy({ top: 420, behavior: 'smooth' })); await mob.p.waitForTimeout(1800); }
}, { maxW: 1170, maxH: 2532 });
await mob.p.goto(`${BASE}/verify/NAWI-2026-000124`);
await mob.p.waitForTimeout(2500);
await still(mob.p, 's-mobile-tampered');

// 11. audit trail
await record(p, 'c13-audit', async () => {
  await p.goto(`${BASE}/audit`);
  await p.waitForTimeout(2500);
  await p.mouse.move(900, 500, { steps: 15 });
  await wheel(p, 500, 12, 110);
  await p.waitForTimeout(2500);
});
await still(p, 's-audit');

// 12. PDFs (certificate of verification, certificate of rejection, data sheet), fetched with the officer's token
// (sealed before the tamper edit; rendered to PNG by tools/pdf2png.py)
const token = await p.evaluate(() => { for (const k of Object.keys(localStorage)) { const v = localStorage.getItem(k) || ''; const m = v.match(/eyJ[\w-]+\.[\w-]+\.[\w-]+/); if (m) return m[0]; } return null; });
for (const [name, url] of [['cert-pass', `${API}/reports/sess-034/certificate`], ['cert-reject', `${API}/reports/sess-030/certificate`], ['datasheet', `${API}/reports/sess-034/datasheet`]]) {
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  fs.writeFileSync(path.join(RAW, `${name}.pdf`), Buffer.from(await r.arrayBuffer()));
  console.log('pdf', name, r.status);
}

await browser.close();
