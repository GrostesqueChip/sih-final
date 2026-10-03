// Generates index.html + compositions/*.html for the NAWI-ReportPro walkthrough film.
// Timing comes from the real voice files (assets/voice/*.wav) and the TTS engine's word
// timestamps (assets/voice/words/*.json, from tools/voice.py), so every visual beat lands
// on the spoken word.
//
//   node tools/build.mjs
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const script = JSON.parse(fs.readFileSync(path.join(ROOT, 'script.json'), 'utf8'));
const probe = (f) => parseFloat(execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());

// ---------------------------------------------------------------- timing
// v1 padding scaled down for the 1.3x narration
const GAP = 0.3;          // between lines inside a scene
const OVERLAP = 0.4;      // scene crossfade
const SCENE_PAD = {       // [lead, tail] seconds of picture around the voice
  's01-open': [1.9, 0.7], 's04-intro': [0.8, 0.7], 's11-pdf': [0.6, 0.8], 's13-verify': [0.6, 0.8],
  's15-scale': [0.7, 0.8], 's16-close': [0.6, 5.5],
};
const lines = {};
const scenes = [];
let cursor = 0;
for (const sc of script.scenes) {
  const [lead, tail] = SCENE_PAD[sc.id] || [0.55, 0.6];
  const start = scenes.length ? cursor - OVERLAP : 0;
  let t = lead;
  for (const l of sc.lines) {
    const file = path.join(ROOT, 'assets/voice', `${l.id}.wav`);
    const dur = probe(file);
    const words = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets/voice/words', `${l.id}.json`), 'utf8'));
    lines[l.id] = { ...l, scene: sc.id, local: t, global: start + t, dur, words };
    t += dur + GAP;
  }
  const dur = t - GAP + tail;
  scenes.push({ id: sc.id, start: +start.toFixed(3), dur: +dur.toFixed(3) });
  cursor = start + dur;
}
const TOTAL = +cursor.toFixed(3);

const norm = (s) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
// local (scene) time of the n-th word in a line whose text starts with `prefix`
function W(id, prefix, nth = 0) {
  const l = lines[id];
  const p = norm(prefix);
  let k = 0;
  for (const w of l.words) {
    if (norm(w.text).startsWith(p)) { if (k === nth) return +(l.local + w.start).toFixed(3); k++; }
  }
  throw new Error(`word "${prefix}" not found in ${id}: ${l.words.map((w) => w.text).join(' ')}`);
}
const L = (id) => +lines[id].local.toFixed(3);                 // line start (scene-local)
const E = (id) => +(lines[id].local + lines[id].dur).toFixed(3); // line end (scene-local)
const sceneOf = (id) => scenes.find((s) => s.id === id);
// recordings: speed a clip up (never below its v1 rate) so its usable part fits the scene
const clipLen = (f) => probe(path.join(ROOT, 'assets/capture', f));
const fit = (id, usable, minRate, start = 0.3) => {
  const avail = sceneOf(id).dur - start - 0.3;
  const rate = +Math.max(minRate, usable / avail).toFixed(3);
  return { rate, dur: Math.min(avail, usable / rate) };
};
const rates = {};

// ---------------------------------------------------------------- captions
function captionChunks(l) {
  const words = l.cap.split(/\s+/).filter(Boolean);
  const chunks = [];
  let cur = [];
  const flush = () => { if (cur.length) { chunks.push(cur); cur = []; } };
  for (const w of words) {
    cur.push(w);
    if (/[.?!:]$/.test(w) || w === '—') flush();
  }
  flush();
  // split long chunks near the middle, preferring a comma
  const out = [];
  for (const c of chunks) {
    if (c.length <= 12) { out.push(c); continue; }
    const parts = Math.ceil(c.length / 11);
    const size = Math.ceil(c.length / parts);
    let i = 0;
    while (i < c.length) {
      let j = Math.min(c.length, i + size);
      if (j < c.length) {
        for (let k = j; k > i + 3 && k > j - 4; k--) if (/[,—;]$/.test(c[k - 1])) { j = k; break; }
      }
      out.push(c.slice(i, j));
      i = j;
    }
  }
  const N = words.length, M = l.words.length;
  let idx = 0;
  const res = [];
  for (const c of out) {
    const a = idx, b = idx + c.length;
    idx = b;
    const wa = Math.min(M - 1, Math.floor((a / N) * M));
    const t0 = a === 0 ? 0 : l.words[wa].start;
    res.push({ text: c.join(' ').replace(/ —$/, ' —'), t0 });
  }
  for (let i = 0; i < res.length; i++) res[i].t1 = i + 1 < res.length ? res[i + 1].t0 : l.dur + 0.15;
  return res;
}

// ---------------------------------------------------------------- shared style
const COMMON_CSS = `
#root { position: absolute; inset: 0; width: 100%; height: 100%; overflow: hidden; color: #f3efe6; font-family: Montserrat, sans-serif; }
.wrap { position: absolute; inset: 0; }
.bg { position: absolute; inset: 0; background: #0b1a33; }
.glow { position: absolute; width: 1400px; height: 1400px; border-radius: 50%; background: radial-gradient(circle, rgba(245,158,11,0.22) 0%, rgba(245,158,11,0.07) 38%, rgba(11,26,51,0) 70%); }
.grid { position: absolute; inset: 0; background-image: linear-gradient(rgba(243,239,230,0.05) 2px, transparent 2px), linear-gradient(90deg, rgba(243,239,230,0.05) 2px, transparent 2px); background-size: 96px 96px; }
.ghost { position: absolute; font-family: Montserrat, sans-serif; font-weight: 900; font-size: 300px; letter-spacing: -0.04em; color: rgba(243,239,230,0.06); white-space: nowrap; line-height: 1; }
.chapter { position: absolute; left: 40px; top: 22px; display: flex; align-items: center; gap: 16px; font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 22px; letter-spacing: 0.14em; text-transform: uppercase; color: #f59e0b; }
.chapter .num { color: #0b1a33; background: #f59e0b; padding: 3px 10px; border-radius: 4px; }
.chapter .rule { width: 120px; height: 3px; background: rgba(245,158,11,0.6); display: block; }
.win { position: absolute; left: 40px; top: 72px; width: 1440px; height: 846px; border-radius: 14px; overflow: hidden; background: #0e1f3d; box-shadow: 0 30px 80px rgba(0,0,0,0.55), 0 0 0 3px rgba(243,239,230,0.12); }
.win .bar { position: absolute; left: 0; top: 0; width: 1440px; height: 36px; background: #1b2c4a; display: flex; align-items: center; gap: 10px; padding: 0 16px; }
.win .dot { width: 13px; height: 13px; border-radius: 50%; background: #56627a; display: block; }
.win .url { margin-left: 18px; height: 24px; width: 560px; border-radius: 12px; background: #0e1f3d; color: #a9b4c7; font-family: 'IBM Plex Mono', monospace; font-size: 15px; display: flex; align-items: center; padding: 0 14px; }
.win .screen { position: absolute; left: 0; top: 36px; width: 1440px; height: 810px; overflow: hidden; }
.win .screen img, .win .screen video { position: absolute; left: 0; top: 0; width: 1440px; height: 810px; object-fit: cover; }
.cam { position: absolute; left: 0; top: 0; width: 1440px; height: 810px; transform-origin: 0 0; }
.rail { position: absolute; left: 1510px; top: 72px; width: 372px; height: 846px; display: flex; flex-direction: column; gap: 18px; }
.rail h2 { font-weight: 900; font-size: 42px; line-height: 1.05; letter-spacing: -0.02em; color: #f3efe6; }
.rail .eyebrow { font-family: 'IBM Plex Mono', monospace; font-size: 20px; font-weight: 700; letter-spacing: 0.12em; color: #f59e0b; text-transform: uppercase; }
.card { background: rgba(18,38,74,0.92); border: 3px solid rgba(243,239,230,0.14); border-radius: 12px; padding: 16px 20px; }
.card .k { font-family: 'IBM Plex Mono', monospace; font-size: 18px; font-weight: 700; letter-spacing: 0.08em; color: #a9b4c7; text-transform: uppercase; }
.card .v { font-size: 28px; font-weight: 700; line-height: 1.2; color: #f3efe6; margin-top: 4px; }
.card.hot { border-color: #f59e0b; }
.card.pass { border-color: #2fb56a; }
.card.fail { border-color: #e04848; }
.tag { display: inline-block; font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 17px; padding: 3px 10px; border-radius: 4px; letter-spacing: 0.08em; }
.tag.pass { background: #2fb56a; color: #06210f; }
.tag.fail { background: #e04848; color: #2a0505; }
.tag.prog { background: #f59e0b; color: #2a1a02; }
.tag.built { background: #2fb56a; color: #06210f; }
.tag.prop { background: #3d5a8c; color: #f3efe6; }
.mono { font-family: 'IBM Plex Mono', monospace; }
.lcd { background: #050b16; border-radius: 18px; border: 4px solid #22324f; box-shadow: inset 0 0 40px rgba(0,0,0,0.8), 0 20px 60px rgba(0,0,0,0.5); }
.lcd .num { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #ffb020; letter-spacing: -0.02em; text-shadow: 0 0 24px rgba(255,176,32,0.45); line-height: 1; }
.lcd .unit { font-family: 'IBM Plex Mono', monospace; font-weight: 700; color: #ffb020; opacity: 0.8; }
.lcd .flags { font-family: 'IBM Plex Mono', monospace; font-weight: 700; font-size: 20px; letter-spacing: 0.12em; color: #3a4a66; }
.lcd .flags .on { color: #2fe07a; }
.photo { position: absolute; inset: 0; width: 1920px; height: 1080px; object-fit: cover; }
.shade { position: absolute; inset: 0; background: radial-gradient(ellipse at 30% 50%, rgba(8,18,38,0.55) 0%, rgba(8,18,38,0.88) 75%); }
.big { font-weight: 900; letter-spacing: -0.035em; line-height: 0.98; }
.strike { position: absolute; left: -6px; right: -6px; top: 52%; height: 5px; background: #e04848; transform-origin: left center; display: block; }
`;

// ---------------------------------------------------------------- builders
const esc = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');
function sub(id, title, html, js, extraCss = '') {
  const sc = sceneOf(id);
  return `<!doctype html>
<html lang="en">
  <head><meta charset="UTF-8" /><title>${esc(title)}</title></head>
  <body>
    <template>
      <style>${COMMON_CSS}${extraCss}</style>
      <div id="root" data-composition-id="${id}" data-width="1920" data-height="1080" data-duration="${sc.dur}">
        <div class="wrap" id="${id}-wrap">
${html}
        </div>
      </div>
      <script>
        (function () {
          const D = ${sc.dur};
          const tl = gsap.timeline({ paused: true });
          tl.fromTo("#${id}-wrap", { opacity: 0 }, { opacity: 1, duration: 0.5, ease: "power1.out" }, 0);
${js}
          window.__timelines["${id}"] = tl;
        })();
      </script>
    </template>
  </body>
</html>
`;
}
const chapter = (id, n, label) => `          <div class="chapter" id="${id}-chap"><span class="num">${n}</span><span>${label}</span><span class="rule"></span></div>`;
const chapterIn = (id, t = 0.3) => `          tl.fromTo("#${id}-chap", { opacity: 0, x: -30 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, ${t});`;
const bgLayer = (id, ghost = '', gx = 900, gy = 700) => `          <div class="bg"></div>
          <div class="glow" id="${id}-glow" style="left:${gx}px; top:-300px;"></div>
          <div class="grid"></div>
          ${ghost ? `<div class="ghost" data-layout-ignore aria-hidden="true" id="${id}-ghost" style="left:${gx - 700}px; top:${gy}px;">${ghost}</div>` : ''}`;
const ambient = (id, hasGhost = true) => `          tl.fromTo("#${id}-glow", { scale: 0.9, opacity: 0.7 }, { scale: 1.12, opacity: 1, duration: D / 2, ease: "sine.inOut", yoyo: true, repeat: 1 }, 0);
          ${hasGhost ? `tl.fromTo("#${id}-ghost", { x: 0 }, { x: -260, duration: D, ease: "none" }, 0);` : ''}`;

// window with a screen recording (and an optional still underneath for holds)
function win(id, { url, video, still, start = 0.3, dur, mediaStart = 0, rate = 1 }) {
  return `          <div class="win" id="${id}-win">
            <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url">${url}</span></div>
            <div class="screen">
              <div class="cam" id="${id}-cam">
                ${still ? `<img id="${id}-still" src="assets/capture/${still}" alt="" />` : ''}
                <video id="${id}-vid" src="assets/capture/${video}" data-start="${start}" data-duration="${dur.toFixed(3)}" data-media-start="${mediaStart}" data-playback-rate="${rate}" muted playsinline></video>
              </div>
            </div>
          </div>`;
}
const winIn = (id) => `          tl.fromTo("#${id}-win", { opacity: 0, y: 40, scale: 0.97 }, { opacity: 1, y: 0, scale: 1, duration: 0.8, ease: "power3.out" }, 0.1);`;
// camera punch on the recording: focus point (fx, fy) in screen px, scale s
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const punch = (id, t, s, fx, fy, d = 1.0) => `          tl.to("#${id}-cam", { scale: ${s}, x: ${clamp(720 - fx * s, 1440 - 1440 * s, 0).toFixed(1)}, y: ${clamp(405 - fy * s, 810 - 810 * s, 0).toFixed(1)}, duration: ${d}, ease: "power2.inOut" }, ${t});`;
const unpunch = (id, t, d = 0.9) => `          tl.to("#${id}-cam", { scale: 1, x: 0, y: 0, duration: ${d}, ease: "power2.inOut" }, ${t});`;
const pop = (sel, t, from = '{ opacity: 0, y: 24 }', d = 0.5, ease = 'power3.out') => `          tl.fromTo("${sel}", ${from}, { opacity: 1, x: 0, y: 0, scale: 1, duration: ${d}, ease: "${ease}" }, ${t});`;

const scenesHtml = {};

// ================================================================ S01 — open
{
  const id = 's01-open';
  const html = `          <div class="bg"></div>
          <div class="cam" id="${id}-kb" style="width:1920px;height:1080px;transform-origin:50% 50%;"><img class="photo" src="assets/photos/mandi-labour.jpg" alt="" style="object-position: 50% 62%;" /></div>
          <div class="shade"></div>
          <div id="${id}-loc" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:110px; top:120px;">
            <div class="mono" id="${id}-coord" style="font-size:22px; font-weight:700; letter-spacing:0.16em; color:#f59e0b;">30.21° N · 74.95° E</div>
            <div class="big" id="${id}-place" style="font-size:118px; margin-top:14px;">Bathinda, Punjab.</div>
            <div id="${id}-season" style="font-size:44px; font-weight:400; margin-top:18px; color:#e8dfcc;">Cotton season.</div>
          </div>
          <div class="lcd" id="${id}-lcd" style="position:absolute; left:1060px; top:540px; width:760px; height:320px; padding:26px 40px;">
            <div class="flags"><span class="on" id="${id}-stable">STABLE</span> &nbsp; ZERO &nbsp; NET</div>
            <div style="display:flex; align-items:baseline; justify-content:flex-end; gap:22px; margin-top:34px;">
              <div class="num" id="${id}-num" style="font-size:170px;">000.0</div><div class="unit" style="font-size:54px;">kg</div>
            </div>
          </div>
          <div id="${id}-one" class="big" style="position:absolute; left:1060px; top:872px; width:760px; font-size:52px; color:#f59e0b; text-align:right;">One number.</div>`;
  const tNum = W('l02', 'number');
  const js = `          tl.fromTo("#${id}-kb", { scale: 1.06 }, { scale: 1.2, duration: D, ease: "none" }, 0);
          tl.fromTo("#${id}-coord", { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.8, ease: "power2.out" }, 0.6);
          tl.fromTo("#${id}-place", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" }, ${L('l01') - 0.1});
          tl.fromTo("#${id}-season", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, ${W('l01', 'cotton')});
          tl.to("#${id}-loc", { opacity: 0.35, duration: 0.8 }, ${W('l02', 'today') - 0.3});
          tl.fromTo("#${id}-lcd", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" }, ${W('l02', 'today')});
          const n = { v: 0 };
          tl.to(n, { v: 500, duration: 1.6, ease: "power2.out", onUpdate: () => { document.getElementById("${id}-num").textContent = n.v.toFixed(1).padStart(5, "0"); } }, ${tNum - 0.9});
          tl.fromTo("#${id}-stable", { opacity: 0.2 }, { opacity: 1, duration: 0.15, repeat: 3, yoyo: true }, ${tNum + 0.7});
          tl.fromTo("#${id}-one", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "back.out(1.6)" }, ${tNum});`;
  scenesHtml[id] = sub(id, 'Open — Bathinda mandi', html, js);
}

// ================================================================ S02 — problem
{
  const id = 's02-problem';
  const html = `${bgLayer(id, 'WHO CHECKED IT?', 1100, 760)}
${chapter(id, '01', 'The problem')}
          <div style="position:absolute; left:40px; top:90px; width:600px; height:830px; border-radius:16px; overflow:hidden; box-shadow:0 30px 80px rgba(0,0,0,0.5);">
            <img id="${id}-ph" src="assets/photos/bench-scale.jpg" alt="" style="position:absolute; left:0; top:0; width:600px; height:830px; object-fit:cover;" />
          </div>
          <div class="big" id="${id}-q" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:720px; top:110px; width:1140px; font-size:104px;">Who checked this scale?</div>
          <div class="lcd" id="${id}-lcd" style="position:absolute; left:720px; top:370px; width:720px; height:250px; padding:20px 36px;">
            <div class="flags"><span class="on">STABLE</span> &nbsp; <span id="${id}-drift" style="color:#e04848;">LOAD CELL DRIFT −1%</span></div>
            <div style="display:flex; align-items:baseline; justify-content:flex-end; gap:18px; margin-top:26px;">
              <div class="num" id="${id}-num" style="font-size:130px;">500.0</div><div class="unit" style="font-size:44px;">kg</div>
            </div>
          </div>
          <div id="${id}-loss" style="position:absolute; left:1480px; top:390px; width:380px; text-align:center;">
            <div class="big" style="font-size:132px; line-height:1.1; color:#e04848; margin-bottom:10px;">−5 kg</div>
            <div class="mono" style="font-size:22px; font-weight:700; letter-spacing:0.1em; color:#f3a3a3;">ON A 500 KG LOAD</div>
          </div>
          <div style="position:absolute; left:720px; top:650px; width:1140px; display:flex; gap:20px;">
            <div class="card" id="${id}-c1" style="flex:1;"><div class="k">×</div><div class="v">every weighing</div></div>
            <div class="card" id="${id}-c2" style="flex:1;"><div class="k">×</div><div class="v">every farmer</div></div>
            <div class="card" id="${id}-c3" style="flex:1;"><div class="k">×</div><div class="v">all season long</div></div>
          </div>
          <div class="big" id="${id}-inv" style="position:absolute; left:720px; top:800px; width:1140px; font-size:64px; color:#a9b4c7;">And nobody can see it.</div>`;
  const js = `${chapterIn(id)}
${ambient(id)}
          tl.fromTo("#${id}-ph", { scale: 1.12 }, { scale: 1.0, duration: D, ease: "none" }, 0);
          tl.fromTo("#${id}-q", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.7, ease: "expo.out" }, ${L('l03')});
          tl.fromTo("#${id}-lcd", { opacity: 0, x: 60 }, { opacity: 1, x: 0, duration: 0.7, ease: "power3.out" }, ${W('l04', 'load') - 0.2});
          tl.fromTo("#${id}-drift", { opacity: 0 }, { opacity: 1, duration: 0.12, repeat: 5, yoyo: true }, ${W('l04', 'drifts')});
          const n = { v: 500 };
          tl.to(n, { v: 495, duration: 1.4, ease: "power1.inOut", onUpdate: () => { document.getElementById("${id}-num").textContent = n.v.toFixed(1); } }, ${W('l04', 'loses') - 0.6});
          tl.fromTo("#${id}-loss", { opacity: 0, scale: 0.6 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, ${W('l04', 'five', 1)});
          tl.fromTo("#${id}-c1", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, ${W('l04', 'every')});
          tl.fromTo("#${id}-c2", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, ${W('l04', 'for')});
          tl.fromTo("#${id}-c3", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, ${W('l04', 'all')});
          tl.fromTo("#${id}-inv", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, ${W('l05', 'nobody', 1)});
          tl.to(["#${id}-lcd", "#${id}-loss"], { filter: "blur(10px)", opacity: 0.35, duration: 1.2, ease: "power2.inOut" }, ${W('l05', 'see') - 0.2});`;
  scenesHtml[id] = sub(id, 'The problem', html, js);
}

// ================================================================ S03 — paper
{
  const id = 's03-paper';
  const icon = {
    book: '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.8"><path d="M4 4h11a3 3 0 0 1 3 3v13H7a3 3 0 0 1-3-3z"/><path d="M4 17a3 3 0 0 1 3-3h11"/></svg>',
    pen: '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.8"><path d="M4 20l4-1 11-11-3-3L5 16z"/><path d="M14 6l3 3"/></svg>',
    calc: '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.8"><rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8 7h8M8 12h2M12 12h2M16 12h0M8 16h2M12 16h2"/></svg>',
    doc: '<svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="1.8"><path d="M6 3h9l4 4v14H6z"/><path d="M15 3v4h4M9 12h7M9 16h5"/></svg>',
  };
  const cards = [
    ['book', 'A paper register', 'paper'],
    ['pen', 'Readings copied by hand', 'readings'],
    ['calc', 'Error limits on a calculator', 'calculator'],
    ['doc', 'A certificate anyone can forge', 'certificate'],
  ];
  const html = `${bgLayer(id, 'PAPER', 1000, 780)}
${chapter(id, '01', 'The problem · today')}
          <div id="${id}-law" style="position:absolute; left:110px; top:120px; width:1700px;">
            <div class="mono" style="font-size:24px; font-weight:700; letter-spacing:0.14em; color:#f59e0b;">LEGAL METROLOGY ACT, 2009</div>
            <div class="big" style="font-size:84px; margin-top:14px;">Every weighing instrument used in trade — verified periodically.</div>
          </div>
          <div style="position:absolute; left:110px; top:430px; width:1700px; display:flex; gap:28px;">
${cards.map((c, i) => `            <div class="card" id="${id}-p${i}" style="flex:1; height:300px; padding:30px; position:relative;">
              ${icon[c[0]]}
              <div class="mono" style="font-size:20px; font-weight:700; color:#a9b4c7; margin-top:26px;">0${i + 1}</div>
              <div style="font-size:36px; font-weight:700; line-height:1.15; margin-top:8px; position:relative;">${c[1]}</div>
            </div>`).join('\n')}
          </div>
          <div id="${id}-no" style="position:absolute; left:110px; top:790px; width:1700px; display:flex; align-items:center; gap:28px;">
            <svg width="84" height="84" viewBox="0 0 24 24" fill="none" stroke="#e04848" stroke-width="2"><path d="M3 3l18 18"/><path d="M10.6 5.1A10.5 10.5 0 0 1 12 5c5 0 9 4.5 10 7a13 13 0 0 1-3.2 4.2M6.2 6.3A13 13 0 0 0 2 12c1 2.5 5 7 10 7a9.9 9.9 0 0 0 5.8-1.8"/></svg>
            <div class="big" style="font-size:66px;">And for the farmer — no way to check any of it.</div>
          </div>`;
  const js = `${chapterIn(id)}
${ambient(id)}
          tl.fromTo("#${id}-law", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, ${L('l06')});
${cards.map((c, i) => `          tl.fromTo("#${id}-p${i}", { opacity: 0, y: 60, rotation: ${i % 2 ? 2 : -2} }, { opacity: 1, y: 0, rotation: 0, duration: 0.55, ease: "back.out(1.4)" }, ${W('l07', c[2]) - 0.15});`).join('\n')}
          tl.to(["#${id}-p0", "#${id}-p1", "#${id}-p2", "#${id}-p3"], { opacity: 0.4, duration: 0.6 }, ${L('l08')});
          tl.fromTo("#${id}-no", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.7, ease: "power3.out" }, ${L('l08') + 0.1});`;
  scenesHtml[id] = sub(id, 'Paper today', html, js);
}

// ================================================================ S04 — intro
{
  const id = 's04-intro';
  const nodes = [
    ['Officer’s first reading', 'first', 'RS-232 indicator · live capture'],
    ['OIML R 76 engine', 'all', 'errors · MPE · verdict'],
    ['Sealed certificate', 'sealed', 'HMAC-SHA256 · PDF'],
    ['Citizen’s phone', 'phone', 'QR · public portal'],
  ];
  const html = `          <div class="bg"></div>
          <div class="glow" id="${id}-glow" style="left:260px; top:-360px;"></div>
          <img id="${id}-chakra" src="assets/gov/ashoka-chakra.svg" alt="" style="position:absolute; left:1180px; top:-120px; width:900px; height:900px; opacity:0.08;" />
          <div id="${id}-brand" style="position:absolute; left:120px; top:150px; width:1300px;">
            <img id="${id}-emb" src="assets/gov/emblem-white-240.png" alt="" style="width:96px; height:auto;" />
            <div class="big" id="${id}-word" data-layout-allow-overlap style="font-size:150px; margin-top:24px;">NAWI-ReportPro</div>
            <div id="${id}-ul" style="width:980px; height:10px; background:#f59e0b; margin-top:18px; transform-origin:left center;"></div>
            <div id="${id}-sub" style="font-size:38px; margin-top:26px; color:#e8dfcc; width:1200px; line-height:1.25;">Digital verification &amp; certification of non-automatic weighing instruments</div>
          </div>
          <div id="${id}-badges" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:120px; top:640px; display:flex; gap:20px;">
            <div class="card hot" id="${id}-b0"><div class="k">Standard</div><div class="v">OIML R 76-1:2006</div></div>
            <div class="card hot" id="${id}-b1"><div class="k">Law</div><div class="v">Legal Metrology Act, 2009</div></div>
            <div class="card hot" id="${id}-b2"><div class="k">Rules</div><div class="v">LM (General) Rules, 2011</div></div>
          </div>
          <div id="${id}-flow" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:120px; top:600px; width:1680px; height:300px;">
            <div id="${id}-line" style="position:absolute; left:40px; top:52px; width:1600px; height:6px; background:#f59e0b; transform-origin:left center;"></div>
${nodes.map((n, i) => `            <div id="${id}-n${i}" style="position:absolute; left:${i * 540}px; top:0; width:420px;">
              <div style="width:110px; height:110px; border-radius:50%; background:#12264a; border:5px solid #f59e0b; display:flex; align-items:center; justify-content:center; font-family:'IBM Plex Mono',monospace; font-weight:700; font-size:40px; color:#f59e0b;">${i + 1}</div>
              <div style="font-size:38px; font-weight:900; margin-top:24px; letter-spacing:-0.02em;">${n[0]}</div>
              <div class="mono" style="font-size:21px; color:#a9b4c7; margin-top:8px;">${n[2]}</div>
            </div>`).join('\n')}
          </div>`;
  const js = `          tl.fromTo("#${id}-glow", { scale: 0.85 }, { scale: 1.15, duration: D, ease: "sine.inOut" }, 0);
          tl.fromTo("#${id}-chakra", { rotation: 0 }, { rotation: 60, duration: D, ease: "none" }, 0);
          tl.fromTo("#${id}-emb", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6, ease: "power2.out" }, ${L('l09') - 0.4});
          tl.fromTo("#${id}-word", { opacity: 0, y: 50, scale: 1.04 }, { opacity: 1, y: 0, scale: 1, duration: 1.0, ease: "expo.out" }, ${W('l09', 'nawi') - 0.1});
          tl.fromTo("#${id}-ul", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "power3.inOut" }, ${W('l09', 'nawi') + 0.3});
          tl.fromTo("#${id}-sub", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, ${L('l10') + 0.3});
          tl.fromTo("#${id}-b0", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }, ${W('l10', 'oiml')});
          tl.fromTo("#${id}-b1", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }, ${W('l10', 'legal')});
          tl.fromTo("#${id}-b2", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.5, ease: "back.out(1.5)" }, ${W('l10', 'act') + 0.4});
          tl.to("#${id}-badges", { opacity: 0, y: -20, duration: 0.5 }, ${L('l11') - 0.2});
          tl.to("#${id}-brand", { y: -60, duration: 0.8, ease: "power2.inOut" }, ${L('l11') - 0.2});
          tl.fromTo("#${id}-line", { scaleX: 0 }, { scaleX: 1, duration: ${(W('l11', 'phone') - W('l11', 'first')).toFixed(2)}, ease: "none" }, ${W('l11', 'first')});
${nodes.map((n, i) => `          tl.fromTo("#${id}-n${i}", { opacity: 0, y: 30, scale: 0.9 }, { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, ${W('l11', n[1]) - 0.1});`).join('\n')}`;
  scenesHtml[id] = sub(id, 'Introducing NAWI-ReportPro', html, js);
}

// generic rail list scene helper
function railList(id, items) {
  return items.map((it, i) => `            <div class="card ${it.cls || ''}" id="${id}-r${i}"><div class="k">${it.k}</div><div class="v">${it.v}</div></div>`).join('\n');
}

// ================================================================ S05 — dashboard
{
  const id = 's05-dashboard';
  const sc = sceneOf(id);
  const items = [
    { k: 'Stamping compliance', v: '81% · 13 of 16 valid', t: W('l13', 'valid') },
    { k: 'Needs action', v: 'Due · Expired · Rejected', t: W('l13', 'due') },
    { k: 'Verification fees', v: '₹ 11,000 this FY', t: W('l13', 'fees') },
    { k: 'District-wise', v: '11 districts at a glance', t: W('l13', 'district') },
  ];
  const html = `${bgLayer(id)}
${chapter(id, '02', 'The solution · inspector')}
${win(id, { url: 'nawi-reportpro.vercel.app/dashboard', video: 'c01-login-dashboard.mp4', still: 's-dashboard.png', ...fit(id, clipLen('c01-login-dashboard.mp4') - 0.6, 1) })}
          <div class="rail">
            <div class="eyebrow" id="${id}-ey">Inspector</div>
            <h2 id="${id}-h">Shri Vikramaditya Sharma</h2>
${railList(id, items)}
          </div>`;
  const js = `${chapterIn(id)}
${ambient(id, false)}
${winIn(id)}
          tl.fromTo(["#${id}-ey", "#${id}-h"], { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.6, stagger: 0.12, ease: "power3.out" }, ${W('l12', 'inspector')});
${items.map((it, i) => pop(`#${id}-r${i}`, it.t - 0.1, '{ opacity: 0, x: 40 }')).join('\n')}`;
  scenesHtml[id] = sub(id, 'Dashboard', html, js);
}

// ================================================================ S06 — registry
{
  const id = 's06-registry';
  const sc = sceneOf(id);
  const items = [
    { k: 'Registry', v: 'Mandi weighbridges', t: W('l14', 'weighbridges') },
    { k: 'Registry', v: 'Ration-shop scales', t: W('l14', 'ration') },
    { k: 'Registry', v: 'Milk-collection scales', t: W('l14', 'milk') },
    { k: 'Registry', v: 'Jewellers’ balances', t: W('l14', 'jewellers') },
  ];
  const hist = [
    ['03 Dec 2025', 'FAIL', 'fail', 'failed'],
    ['27 Feb 2026', 'PASS', 'pass', 'passed'],
    ['27 Sep 2026', 'IN PROGRESS', 'prog', 'passed'],
  ];
  const html = `${bgLayer(id)}
${chapter(id, '02', 'Instrument registry')}
${win(id, { url: 'nawi-reportpro.vercel.app/instruments', video: 'c02-registry.mp4', still: 's-instrument-detail.png', ...fit(id, clipLen('c02-registry.mp4') - 0.6, 0.85) })}
          <div class="rail">
            <div id="${id}-list" data-layout-allow-overlap data-layout-allow-occlusion style="display:flex; flex-direction:column; gap:14px;">
${railList(id, items)}
            </div>
            <div id="${id}-hist" data-layout-allow-overlap data-layout-allow-occlusion style="display:flex; flex-direction:column; gap:14px; position:absolute; left:0; top:0; width:372px;">
              <div class="eyebrow">Gurpreet’s mandi scale</div>
              <h2 style="font-size:36px;">Bathinda Cotton Mandi Platform Scale</h2>
${hist.map((h, i) => `              <div class="card ${h[2]}" id="${id}-h${i}"><div class="k">${h[0]}</div><div class="v"><span class="tag ${h[2]}">${h[1]}</span></div></div>`).join('\n')}
              <div class="mono" id="${id}-note" style="font-size:20px; color:#a9b4c7; line-height:1.4;">Failed → pulled from trade → repaired → passed.</div>
            </div>
          </div>`;
  const js = `${chapterIn(id)}
${ambient(id, false)}
${winIn(id)}
${items.map((it, i) => pop(`#${id}-r${i}`, it.t - 0.1, '{ opacity: 0, x: 40 }')).join('\n')}
          tl.to("#${id}-list", { opacity: 0, x: 40, duration: 0.5 }, ${L('l15') - 0.2});
          tl.fromTo("#${id}-hist", { opacity: 0 }, { opacity: 1, duration: 0.5 }, ${L('l15') + 0.2});
          tl.set(["#${id}-h0", "#${id}-h1", "#${id}-h2", "#${id}-note"], { opacity: 0 }, 0);
          tl.fromTo("#${id}-h0", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, ${W('l15', 'failed') - 0.1});
          tl.fromTo("#${id}-note", { opacity: 0 }, { opacity: 1, duration: 0.6 }, ${W('l15', 'pulled')});
          tl.fromTo("#${id}-h1", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, ${W('l15', 'passed') - 0.1});
          tl.fromTo("#${id}-h2", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, ${W('l15', 'february') + 0.3});
${punch(id, W('l15', 'history') - 0.3, 1.45, 780, 610, 1.2)}`;
  scenesHtml[id] = sub(id, 'Registry', html, js);
}

// ================================================================ S07 — register
{
  const id = 's07-register';
  const sc = sceneOf(id);
  const items = [
    { k: 'Live OIML R 76 check', v: 'n = Max / e = 3,000 ✓', t: W('l16', 'checks') },
    { k: 'Class III limits', v: 'Min ≥ 20 e ✓ · d ≤ e ✓', t: W('l16', 'specifications') },
    { k: 'MPE preview', v: '±0.05 · ±0.1 · ±0.15 kg', t: W('l16', 'maximum') },
  ];
  const html = `${bgLayer(id)}
${chapter(id, '02', 'Register an instrument')}
${win(id, { url: 'nawi-reportpro.vercel.app/instruments/new', video: 'c03-register.mp4', still: 's-register.png', ...fit(id, clipLen('c03-register.mp4') - 0.6, 0.75) })}
          <div class="rail">
            <div class="eyebrow">New instrument</div>
            <h2>Checked against the standard as you type</h2>
${railList(id, items)}
          </div>`;
  const js = `${chapterIn(id)}
${ambient(id, false)}
${winIn(id)}
${items.map((it, i) => pop(`#${id}-r${i}`, it.t - 0.1, '{ opacity: 0, x: 40 }')).join('\n')}
${punch(id, W('l16', 'checks') - 0.2, 1.6, 1230, 250, 1.1)}
${unpunch(id, E('l16') - 0.6)}`;
  scenesHtml[id] = sub(id, 'Register', html, js);
}

// ================================================================ S08 — session
{
  const id = 's08-session';
  const sc = sceneOf(id);
  const tests = [['Weighing performance', 'weighing', 'A.4.4'], ['Repeatability', 'repeatability', 'A.4.10'], ['Eccentricity', 'eccentricity', 'A.4.7'], ['Temperature', 'temperature', 'A.5.3'], ['Stability', 'stability', 'A.4.11'], ['Creep', 'creep', 'A.4.8']];
  const html = `${bgLayer(id)}
${chapter(id, '03', 'Re-verification · six tests')}
${win(id, { url: 'nawi-reportpro.vercel.app/tests/sess-034', video: 'c04-session.mp4', ...fit(id, clipLen('c04-session.mp4') - 0.6, 0.6) })}
          <div class="rail" style="gap:12px;">
            <div class="eyebrow">OIML R 76-1 test programme</div>
${tests.map((t, i) => `            <div class="card" id="${id}-t${i}" style="display:flex; align-items:center; gap:16px; padding:14px 18px;">
              <div id="${id}-ck${i}" style="width:44px; height:44px; border-radius:50%; background:#2fb56a; color:#06210f; display:flex; align-items:center; justify-content:center; font-weight:900; font-size:26px;">${i < 5 ? '✓' : '6'}</div>
              <div><div class="v" style="font-size:25px; margin-top:0;">${t[0]}</div><div class="k" style="font-size:16px;">R 76-1 ${t[2]}</div></div>
            </div>`).join('\n')}
          </div>`;
  const js = `${chapterIn(id)}
${ambient(id, false)}
${winIn(id)}
${tests.map((t, i) => pop(`#${id}-t${i}`, W('l17', t[1]) - 0.1, '{ opacity: 0, x: 40 }', 0.4)).join('\n')}
          tl.set([${tests.map((t, i) => `"#${id}-ck${i}"`).join(',')}], { scale: 0, opacity: 0 }, 0);
          tl.to([${tests.slice(0, 5).map((t, i) => `"#${id}-ck${i}"`).join(',')}], { scale: 1, opacity: 1, duration: 0.35, stagger: 0.12, ease: "back.out(2)" }, ${W('l18', 'five')});
          tl.set("#${id}-ck5", { background: "#f59e0b", color: "#2a1a02" }, 0);
          tl.to("#${id}-ck5", { scale: 1, opacity: 1, duration: 0.35, ease: "back.out(2)" }, ${W('l18', 'one')});
          tl.to("#${id}-t5", { borderColor: "#f59e0b", duration: 0.2, repeat: 3, yoyo: true }, ${W('l18', 'one') + 0.2});`;
  scenesHtml[id] = sub(id, 'Session', html, js);
}

// ================================================================ S09 — capture
{
  const id = 's09-capture';
  const sc = sceneOf(id);
  const f = fit(id, clipLen('c05-creep-capture.mp4') - 0.6, 0.55);
  rates[id] = f.rate;
  const steps = [
    ['Load the test point', 'loads'],
    ['Wait for STABLE', 'waits'],
    ['Record the reading', 'records'],
    ['Error vs MPE → verdict', 'error'],
  ];
  const html = `${bgLayer(id)}
${chapter(id, '03', 'Live capture · creep test')}
${win(id, { url: 'nawi-reportpro.vercel.app/tests/sess-034/TIME_DEPENDENCE', video: 'c05-creep-capture.mp4', still: 's-creep-done.png', ...f })}
          <div class="rail">
            <div class="eyebrow">RS-232 indicator → app</div>
            <h2 id="${id}-h">No reading until the scale settles</h2>
${steps.map((s, i) => `            <div class="card" id="${id}-s${i}" style="display:flex; gap:14px; align-items:center; padding:14px 18px;"><div class="mono" style="font-size:26px; font-weight:700; color:#f59e0b;">0${i + 1}</div><div class="v" style="font-size:25px; margin-top:0;">${s[0]}</div></div>`).join('\n')}
            <div id="${id}-no" style="display:flex; flex-direction:column; gap:10px; margin-top:8px;">
${['Handwritten numbers', 'Calculator', 'Favours'].map((s, i) => `              <div style="position:relative; font-size:30px; font-weight:900; color:#f3a3a3; width:max-content;" id="${id}-x${i}">${s}<span class="strike" id="${id}-xs${i}"></span></div>`).join('\n')}
            </div>
          </div>`;
  const js = `${chapterIn(id)}
${ambient(id, false)}
${winIn(id)}
          tl.fromTo("#${id}-h", { opacity: 0, x: 30 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, ${L('l19') + 0.2});
${steps.map((s, i) => pop(`#${id}-s${i}`, W('l20', s[1]) - 0.1, '{ opacity: 0, x: 40 }', 0.45)).join('\n')}
${punch(id, W('l20', 'for') - 0.2, 1.55, 1240, 400, 1.2)}
${unpunch(id, W('l20', 'error') - 0.3)}
          tl.to(["#${id}-s0", "#${id}-s1", "#${id}-s2", "#${id}-s3"], { opacity: 0.35, duration: 0.4 }, ${L('l21') - 0.1});
${['numbers', 'calculator', 'mistake'].map((w, i) => `          tl.fromTo("#${id}-x${i}", { opacity: 0, x: 20 }, { opacity: 1, x: 0, duration: 0.35, ease: "power3.out" }, ${W('l21', w) - 0.35});
          tl.fromTo("#${id}-xs${i}", { scaleX: 0 }, { scaleX: 1, duration: 0.3, ease: "power2.in" }, ${W('l21', w) + 0.1});`).join('\n')}`;
  scenesHtml[id] = sub(id, 'Live capture', html, js);
}

// ================================================================ S10 — seal
{
  const id = 's10-seal';
  const sc = sceneOf(id);
  // the real seal on certificate NAWI-2026-000124, as encoded in its QR code
  const hash = '9a558094b0a676941dc6e8ab0c769136205f40905a0c1b765669282ff4c24e22';
  const html = `${bgLayer(id)}
${chapter(id, '04', 'Finalise & seal')}
${win(id, { url: 'nawi-reportpro.vercel.app/tests/sess-034', video: 'c06-seal.mp4', still: 's-report.png', ...fit(id, clipLen('c06-seal.mp4') - 0.6, 0.7) })}
          <div class="rail">
            <div class="card pass" id="${id}-v"><div class="k">Verdict</div><div class="v">Computed from the readings. Cannot be overridden.</div></div>
            <div class="card hot" id="${id}-seal"><div class="k">HMAC-SHA256 seal · verdict + every reading</div><div class="mono" id="${id}-hash" style="font-size:22px; line-height:1.45; color:#ffb020; word-break:break-all; margin-top:8px; height:132px;"></div></div>
            <div class="card" id="${id}-lock" style="display:flex; align-items:center; gap:16px;">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>
              <div class="v" style="margin-top:0;">Readings locked. Session read-only.</div>
            </div>
          </div>`;
  const tSeal = W('l24', 'sealed');
  const js = `${chapterIn(id)}
${ambient(id, false)}
${winIn(id)}
${pop(`#${id}-v`, W('l23', 'verdict') - 0.1, '{ opacity: 0, x: 40 }')}
${punch(id, W('l23', 'verdict') - 0.4, 1.45, 720, 470, 1.0)}
${unpunch(id, E('l23') + 0.1)}
${pop(`#${id}-seal`, tSeal - 0.2, '{ opacity: 0, x: 40 }')}
          const h = { n: 0 };
          tl.to(h, { n: ${hash.length}, duration: 2.2, ease: "none", onUpdate: () => { document.getElementById("${id}-hash").textContent = "${hash}".slice(0, Math.round(h.n)); } }, ${tSeal + 0.2});
${pop(`#${id}-lock`, W('l24', 'locked') - 0.3, '{ opacity: 0, x: 40 }')}`;
  scenesHtml[id] = sub(id, 'Seal', html, js);
}

// ================================================================ S11 — pdf
{
  const id = 's11-pdf';
  // certificate image shown 707 x 1000 at (L0, T0); focus points are fractions of the page
  const Wd = 707, Ht = 1000, L0 = 360, T0 = 40;
  const focus = [
    { t: W('l25', 'official') + 0.2, fx: 0.5, fy: 0.5, s: 1, label: 'Certificate of Verification', sub: 'Generated in seconds · PDFKit' },
    { t: W('l26', 'bilingual'), fx: 0.5, fy: 0.215, s: 2.1, label: 'Bilingual', sub: 'सत्यापन प्रमाणपत्र · Hindi + English', hindi: true },
    { t: W('l26', 'state'), fx: 0.5, fy: 0.085, s: 2.6, label: 'State Emblem', sub: 'Government of India · Punjab' },
    { t: W('l26', 'every'), fx: 0.5, fy: 0.52, s: 1.75, label: 'Every test, every result', sub: 'Six OIML R 76 clauses · PASS / FAIL' },
    { t: W('l26', 'measurement'), fx: 0.5, fy: 0.63, s: 2.0, label: 'Measurement uncertainty', sub: 'ISO GUM · U = ±0.1 kg (k = 2)' },
    { t: W('l26', 'signature'), fx: 0.33, fy: 0.815, s: 2.0, label: 'Signature & official stamp', sub: 'Digitally sealed, with timestamp' },
    { t: W('l26', 'qr'), fx: 0.85, fy: 0.815, s: 2.3, label: 'QR code', sub: 'Opens the public verification portal' },
    { t: W('l26', 'seal') , fx: 0.5, fy: 0.925, s: 2.1, label: 'Digital seal', sub: 'HMAC-SHA256 · any alteration breaks it' },
    { t: E('l26') + 0.2, fx: 0.5, fy: 0.5, s: 1, label: 'Technical data sheet', sub: 'Three pages · every reading · error envelope' },
  ];
  const cx = 715, cy = 470;
  const html = `${bgLayer(id, 'CERTIFICATE', 1100, 800)}
${chapter(id, '04', 'The certificate · PDF')}
          <div id="${id}-cert" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:${L0}px; top:${T0}px; width:${Wd}px; height:${Ht}px; transform-origin:0 0; box-shadow:0 30px 90px rgba(0,0,0,0.6);">
            <img src="assets/capture/pdf-cert-pass-p1.png" alt="" style="width:${Wd}px; height:${Ht}px; display:block;" />
          </div>
          <div id="${id}-ds" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:120px; top:60px; width:1200px; height:880px;">
            <img id="${id}-d1" src="assets/capture/pdf-datasheet-p1.png" alt="" style="position:absolute; left:0; top:40px; width:560px; height:792px; box-shadow:0 20px 60px rgba(0,0,0,0.5);" />
            <img id="${id}-d3" src="assets/capture/pdf-datasheet-p3.png" alt="" style="position:absolute; left:640px; top:40px; width:560px; height:792px; box-shadow:0 20px 60px rgba(0,0,0,0.5);" />
            <div id="${id}-d2w" style="position:absolute; left:250px; top:0; width:640px; height:905px; overflow:hidden; box-shadow:0 30px 90px rgba(0,0,0,0.65); background:#fff;">
              <img id="${id}-d2" src="assets/capture/pdf-datasheet-p2.png" alt="" style="position:absolute; left:0; top:0; width:640px; height:905px; transform-origin:50% 14%;" />
            </div>
          </div>
          <div style="position:absolute; left:1300px; top:0; width:620px; height:1080px; background:linear-gradient(90deg, rgba(11,26,51,0) 0%, rgba(11,26,51,0.96) 18%);"></div>
          <div class="rail" style="left:1440px; top:300px; width:440px; height:520px;">
${focus.map((f, i) => `            <div id="${id}-f${i}" style="position:absolute; left:0; top:0; width:440px;">
              <div class="mono" style="font-size:22px; font-weight:700; color:#f59e0b; letter-spacing:0.1em;">0${i + 1} / 0${focus.length}</div>
              <div class="big" style="font-size:54px; margin-top:12px;">${f.label}</div>
              <div style="font-size:28px; color:#e8dfcc; margin-top:14px; line-height:1.3;">${f.hindi ? 'Hindi + English, side by side' : f.sub}</div>
            </div>`).join('\n')}
          </div>`;
  let js = `${chapterIn(id)}
${ambient(id)}
          tl.fromTo("#${id}-cert", { opacity: 0, y: 80, rotation: -2 }, { opacity: 1, y: 0, rotation: 0, duration: 1.0, ease: "power3.out" }, 0.2);
          tl.set([${focus.map((f, i) => `"#${id}-f${i}"`).join(',')}], { opacity: 0 }, 0);
          tl.set("#${id}-ds", { opacity: 0 }, 0);`;
  focus.forEach((f, i) => {
    const s = f.s;
    const x = f.s === 1 ? 0 : (cx - L0 - f.fx * Wd * s);
    const y = f.s === 1 ? 0 : (cy - T0 - f.fy * Ht * s);
    if (i > 0 && i < focus.length - 1) js += `\n          tl.to("#${id}-cert", { scale: ${s}, x: ${x.toFixed(1)}, y: ${y.toFixed(1)}, duration: 0.9, ease: "power2.inOut" }, ${(f.t - 0.35).toFixed(3)});`;
    js += `\n          tl.fromTo("#${id}-f${i}", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, ${(f.t - 0.1).toFixed(3)});`;
    if (i > 0) js += `\n          tl.to("#${id}-f${i - 1}", { opacity: 0, y: -16, duration: 0.3 }, ${(f.t - 0.35).toFixed(3)});`;
  });
  const tDs = E('l26') + 0.1;
  js += `
          tl.to("#${id}-cert", { scale: 0.6, x: -700, y: 120, opacity: 0, duration: 0.9, ease: "power2.in" }, ${tDs});
          tl.to("#${id}-ds", { opacity: 1, duration: 0.3 }, ${tDs + 0.4});
          tl.fromTo("#${id}-d1", { opacity: 0, x: 200, rotation: 0 }, { opacity: 1, x: 0, rotation: -5, duration: 0.8, ease: "power3.out" }, ${tDs + 0.5});
          tl.fromTo("#${id}-d3", { opacity: 0, x: -200, rotation: 0 }, { opacity: 1, x: 0, rotation: 5, duration: 0.8, ease: "power3.out" }, ${tDs + 0.6});
          tl.fromTo("#${id}-d2w", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, ${tDs + 0.7});
          tl.to("#${id}-d2", { scale: 1.9, duration: 1.4, ease: "power2.inOut" }, ${W('l27', 'plots') - 0.4});`;
  scenesHtml[id] = sub(id, 'Certificate PDF', html, js);
}

// ================================================================ S12 — reject
{
  const id = 's12-reject';
  const { rate, dur: vDur } = fit(id, 42 - 15, 1.6); // faulty load cell run: source 15s → 42s
  const html = `${bgLayer(id)}
${chapter(id, '05', 'When a scale is wrong')}
${win(id, { url: 'nawi-reportpro.vercel.app/tests/…/WEIGHING_PERFORMANCE', video: 'c08-faulty.mp4', still: 's-faulty.png', dur: vDur, mediaStart: 15, rate })}
          <div id="${id}-rej" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:300px; top:40px; width:707px; height:1000px; box-shadow:0 30px 90px rgba(0,0,0,0.7);">
            <img src="assets/capture/pdf-cert-reject-p1.png" alt="" style="width:707px; height:1000px; display:block;" />
          </div>
          <div class="rail">
            <div id="${id}-a" data-layout-allow-overlap data-layout-allow-occlusion style="display:flex; flex-direction:column; gap:16px;">
              <div class="eyebrow">Simulated fault</div>
              <h2>Faulty load cell · grocery-store scale</h2>
              <div class="card fail" id="${id}-r0"><div class="k">Reading error</div><div class="v">Crosses the MPE → turns red</div></div>
              <div class="card fail" id="${id}-r1"><div class="k">Live verdict</div><div class="v"><span class="tag fail">FAIL</span></div></div>
            </div>
            <div id="${id}-b" data-layout-allow-overlap data-layout-allow-occlusion style="display:flex; flex-direction:column; gap:16px; position:absolute; left:0; top:0; width:372px;">
              <div class="eyebrow" style="color:#e04848;">Certificate of Rejection</div>
              <h2>Not valid for trade</h2>
              <div class="card fail"><div class="k">Until</div><div class="v">Repaired by a licensed repairer and verified again</div></div>
              <div class="card"><div class="k">Law</div><div class="v">Sec. 25, Legal Metrology Act, 2009</div></div>
            </div>
          </div>`;
  const tRed = W('l29', 'moment');
  const tCert = L('l30') - 0.3;
  const js = `${chapterIn(id)}
${ambient(id, false)}
${winIn(id)}
          tl.set(["#${id}-a", "#${id}-r0", "#${id}-r1", "#${id}-b", "#${id}-rej"], { opacity: 0 }, 0);
          tl.fromTo("#${id}-a", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.5, ease: "power3.out" }, ${W('l29', 'simulate')});
${pop(`#${id}-r0`, tRed, '{ opacity: 0, x: 40 }')}
${pop(`#${id}-r1`, W('l29', 'red'), '{ opacity: 0, scale: 0.8 }', 0.4, 'back.out(2)')}
${punch(id, tRed - 0.6, 1.5, 560, 520, 1.0)}
          tl.to("#${id}-a", { opacity: 0, duration: 0.4 }, ${tCert});
          tl.fromTo("#${id}-rej", { opacity: 0, y: 120, rotation: 3 }, { opacity: 1, y: 0, rotation: 0, duration: 0.9, ease: "power3.out" }, ${tCert});
          tl.to("#${id}-win", { opacity: 0.25, filter: "blur(6px)", duration: 0.8 }, ${tCert});
          tl.fromTo("#${id}-b", { opacity: 0, x: 40 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, ${W('l30', 'certificate')});`;
  scenesHtml[id] = sub(id, 'Rejection', html, js);
}

// ================================================================ S13 — public verification
{
  const id = 's13-verify';
  const tScan = W('l32', 'scans');
  const tReject = W('l34', 'rejected');
  const tTamper = W('l34', 'tampered');
  const vA = { start: tScan + 0.2, dur: Math.min(clipLen('c11-verify-mobile.mp4') - 0.6, tReject - tScan - 0.2) };
  const vB = { start: tReject, dur: Math.min(clipLen('c12-verify-mobile-rejected.mp4') - 0.6, tTamper - tReject) };
  // tampered: one sealed reading edited in the database, same certificate scanned again
  const vC = { start: tTamper, dur: clipLen('c14-verify-mobile-tampered.mp4') - 0.6 };
  const html = `          <div class="bg"></div>
          <div class="cam" id="${id}-kb" style="width:1920px;height:1080px;transform-origin:50% 50%;"><img class="photo" src="assets/photos/mandi-labour.jpg" alt="" style="object-position: 50% 62%;" /></div>
          <div class="shade" id="${id}-shade"></div>
${chapter(id, '06', 'Public verification · no login')}
          <div id="${id}-loc" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:110px; top:140px; width:900px;">
            <div class="mono" style="font-size:22px; font-weight:700; letter-spacing:0.16em; color:#f59e0b;">BATHINDA · NEW ANAJ MANDI</div>
            <div class="big" style="font-size:96px; margin-top:12px;">Back to the mandi.</div>
          </div>
          <div id="${id}-qr" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:140px; top:360px; width:360px; height:360px; background:#fff; border-radius:16px; padding:22px;">
            <img src="assets/capture/qr-pass.png" alt="" style="width:316px; height:316px; display:block;" />
            <div id="${id}-scan" style="position:absolute; left:10px; top:22px; width:340px; height:6px; background:#2fe07a; box-shadow:0 0 18px #2fe07a;"></div>
          </div>
          <div id="${id}-qrl" data-layout-allow-overlap data-layout-allow-occlusion class="mono" style="position:absolute; left:140px; top:740px; width:420px; font-size:22px; font-weight:700; color:#e8dfcc; letter-spacing:0.08em;">SCAN TO VERIFY · NAWI-2026-000124</div>
          <div id="${id}-valid" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:110px; top:330px; width:760px;">
            <div class="big" style="font-size:190px; color:#2fe07a; letter-spacing:-0.04em;">VALID</div>
            <div style="display:flex; flex-direction:column; gap:14px; margin-top:10px;">
              <div class="card pass" id="${id}-f0"><div class="k">Owner · place</div><div class="v">M/s Guru Nanak Cotton Traders, Bathinda</div></div>
              <div class="card pass" id="${id}-f1"><div class="k">Verified by</div><div class="v">Shri Vikramaditya Sharma</div></div>
              <div class="card pass" id="${id}-f2"><div class="k">Valid until</div><div class="v">30 Sep 2027</div></div>
            </div>
          </div>
          <div id="${id}-bad" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:110px; top:330px; width:760px;">
            <div id="${id}-rj" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:0; top:0; width:760px;">
              <div class="big" style="font-size:120px; color:#ff6b6b;">REJECTED</div>
              <div style="font-size:36px; margin-top:14px; line-height:1.3; color:#f3efe6;">Failed verification. Not valid for trade.</div>
            </div>
            <div id="${id}-tp" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:0; top:0; width:1040px;">
              <div class="big" style="font-size:112px; color:#ff6b6b; white-space:nowrap;">NOT AUTHENTIC</div>
              <div style="font-size:36px; margin-top:14px; line-height:1.3; color:#f3efe6; width:760px;">One reading edited after sealing. The seal no longer matches.</div>
            </div>
            <div style="height:240px;"></div>
            <div class="card hot" id="${id}-help" style="margin-top:30px; display:flex; align-items:center; gap:22px;">
              <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" stroke-width="2"><path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z"/></svg>
              <div><div class="k">National Consumer Helpline</div><div class="big" style="font-size:72px; color:#f59e0b;">1915</div></div>
            </div>
          </div>
          <div id="${id}-truth" data-layout-allow-overlap data-layout-allow-occlusion class="big" style="position:absolute; left:110px; top:360px; width:860px; font-size:78px;">For the first time, the person on the other side of the scale can see the truth.</div>
          <div id="${id}-phone" style="position:absolute; left:1250px; top:40px; width:430px; height:890px; border-radius:62px; background:#0a0f1a; padding:18px; box-shadow:0 40px 100px rgba(0,0,0,0.6), 0 0 0 3px #3a4660;">
            <div style="position:absolute; left:18px; top:18px; width:394px; height:854px; border-radius:46px; overflow:hidden; background:#f1f4f9;">
              <img src="assets/capture/s-mobile-valid.png" alt="" style="position:absolute; left:0; top:0; width:394px; height:854px; object-fit:cover; object-position:top;" />
              <video id="${id}-va" src="assets/capture/c11-verify-mobile.mp4" data-start="${vA.start.toFixed(3)}" data-duration="${vA.dur.toFixed(3)}" muted playsinline style="position:absolute; left:0; top:0; width:394px; height:854px; object-fit:cover; object-position:top;"></video>
              <img id="${id}-rimg" src="assets/capture/s-mobile-rejected.png" alt="" style="position:absolute; left:0; top:0; width:394px; height:854px; object-fit:cover; object-position:top;" />
              <video id="${id}-vb" src="assets/capture/c12-verify-mobile-rejected.mp4" data-start="${vB.start.toFixed(3)}" data-duration="${vB.dur.toFixed(3)}" muted playsinline style="position:absolute; left:0; top:0; width:394px; height:854px; object-fit:cover; object-position:top;"></video>
              <img id="${id}-timg" src="assets/capture/s-mobile-tampered.png" alt="" style="position:absolute; left:0; top:0; width:394px; height:854px; object-fit:cover; object-position:top;" />
              <video id="${id}-vc" src="assets/capture/c14-verify-mobile-tampered.mp4" data-start="${vC.start.toFixed(3)}" data-duration="${vC.dur.toFixed(3)}" muted playsinline style="position:absolute; left:0; top:0; width:394px; height:854px; object-fit:cover; object-position:top;"></video>
            </div>
          </div>`;
  const js = `          tl.fromTo("#${id}-kb", { scale: 1.2 }, { scale: 1.06, duration: D, ease: "none" }, 0);
${chapterIn(id)}
          tl.fromTo("#${id}-loc", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, ${L('l31') - 0.1});
          tl.to("#${id}-loc", { opacity: 0, y: -20, duration: 0.5 }, ${W('l32', 'qr') - 0.4});
          tl.set(["#${id}-valid", "#${id}-bad", "#${id}-truth", "#${id}-rimg", "#${id}-timg", "#${id}-tp"], { opacity: 0 }, 0);
          tl.fromTo("#${id}-qr", { opacity: 0, scale: 0.8 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.6)" }, ${W('l32', 'qr') - 0.2});
          tl.fromTo("#${id}-qrl", { opacity: 0 }, { opacity: 1, duration: 0.5 }, ${W('l32', 'qr')});
          tl.fromTo("#${id}-scan", { y: 0 }, { y: 320, duration: 0.9, ease: "sine.inOut", yoyo: true, repeat: 3 }, ${tScan - 0.6});
          tl.fromTo("#${id}-phone", { opacity: 0, y: 120 }, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" }, ${tScan - 0.3});
          tl.to(["#${id}-qr", "#${id}-qrl"], { opacity: 0, x: -40, duration: 0.5 }, ${W('l33', 'answers') - 0.2});
          tl.fromTo("#${id}-valid", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(2)" }, ${W('l33', 'valid') - 0.1});
          tl.set(["#${id}-f0", "#${id}-f1", "#${id}-f2"], { opacity: 0 }, 0);
${pop(`#${id}-f0`, W('l33', 'owns') - 0.1, '{ opacity: 0, x: -30 }', 0.4)}
${pop(`#${id}-f1`, W('l33', 'officer') - 0.1, '{ opacity: 0, x: -30 }', 0.4)}
${pop(`#${id}-f2`, W('l33', 'until') - 0.1, '{ opacity: 0, x: -30 }', 0.4)}
          tl.to("#${id}-valid", { opacity: 0, x: -40, duration: 0.5 }, ${L('l34') - 0.1});
          tl.set("#${id}-rimg", { opacity: 1 }, ${tReject});
          tl.fromTo("#${id}-bad", { opacity: 0, x: -40 }, { opacity: 1, x: 0, duration: 0.6, ease: "power3.out" }, ${tReject - 0.3});
          tl.set("#${id}-timg", { opacity: 1 }, ${tTamper});
          tl.to("#${id}-rj", { opacity: 0, y: -16, duration: 0.3 }, ${tTamper - 0.3});
          tl.fromTo("#${id}-tp", { opacity: 0, y: 24 }, { opacity: 1, y: 0, duration: 0.45, ease: "power3.out" }, ${tTamper - 0.05});
          tl.set("#${id}-help", { opacity: 0 }, 0);
${pop(`#${id}-help`, W('l34', 'national') - 0.2, '{ opacity: 0, scale: 0.85 }', 0.5, 'back.out(1.8)')}
          tl.to("#${id}-bad", { opacity: 0, duration: 0.5 }, ${L('l35') - 0.3});
          tl.to("#${id}-shade", { opacity: 0.7, duration: 1.0 }, ${L('l35') - 0.3});
          tl.to("#${id}-phone", { opacity: 0, x: 80, duration: 0.8, ease: "power2.in" }, ${L('l35') - 0.2});
          tl.fromTo("#${id}-truth", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.9, ease: "power3.out" }, ${L('l35')});`;
  scenesHtml[id] = sub(id, 'Public verification', html, js);
}

// ================================================================ S14 — trust layer
{
  const id = 's14-trust';
  const sc = sceneOf(id);
  const tHindi = L('l37') - 0.2;
  const items = [
    { k: 'Accountability', v: 'Append-only audit trail', t: W('l36', 'append') },
    { k: 'Language', v: 'Hindi + English, every screen', t: W('l37', 'hindi') },
    { k: 'Readability', v: 'Text-size options', t: W('l37', 'text') },
  ];
  const html = `${bgLayer(id)}
${chapter(id, '07', 'Built for trust')}
          <div class="win" id="${id}-win">
            <div class="bar"><span class="dot"></span><span class="dot"></span><span class="dot"></span><span class="url" id="${id}-url">nawi-reportpro.vercel.app/audit · /dashboard (हिंदी)</span></div>
            <div class="screen">
              <div class="cam" id="${id}-cam">
                <img src="assets/capture/s-hindi.png" alt="" />
                <video id="${id}-va" src="assets/capture/c13-audit.mp4" data-start="0.3" data-duration="${(tHindi - 0.3).toFixed(3)}" data-playback-rate="${((clipLen('c13-audit.mp4') - 0.6) / (tHindi - 0.3)).toFixed(3)}" muted playsinline></video>
                <video id="${id}-vb" src="assets/capture/c09-hindi.mp4" data-start="${tHindi.toFixed(3)}" data-duration="${Math.min(clipLen('c09-hindi.mp4') - 0.6, sc.dur - tHindi).toFixed(3)}" muted playsinline></video>
              </div>
            </div>
          </div>
          <div class="rail">
${railList(id, items)}
          </div>`;
  const js = `${chapterIn(id)}
${ambient(id, false)}
${winIn(id)}
${items.map((it, i) => pop(`#${id}-r${i}`, it.t - 0.1, '{ opacity: 0, x: 40 }')).join('\n')}`;
  scenesHtml[id] = sub(id, 'Trust', html, js);
}

// ================================================================ S15 — scale / vision
{
  const id = 's15-scale';
  const COLS = 40, ROWS = 20; // 800 dots — an abstract field of districts (no map drawn)
  const dots = [];
  for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) dots.push([c, r]);
  const punjab = new Set();
  [[8, 4], [9, 4], [10, 4], [8, 5], [9, 5], [10, 5], [11, 5], [9, 6], [10, 6], [11, 6], [10, 3]].forEach(([c, r]) => punjab.add(r * COLS + c));
  const tiles = [
    ['weighbridge.jpg', 'Mandi weighbridges', 'weighbridge'],
    ['counter-scale.jpg', 'Ration-shop scales', 'ration'],
    ['bench-scale.jpg', 'Milk-collection centres', 'milk'],
    ['lab-balance.jpg', 'Jewellers’ balances', 'jewel'],
  ];
  const hub = [
    ['Weighing indicators', 'RS-232 · Web Serial', 'built', 'BUILT', 'indicators', 60, 40],
    ['DigiLocker', 'certificates in citizens’ wallets', 'prop', 'PROPOSED', 'digilocker', 1180, 40],
    ['e-NAM mandis', 'stamping status at the point of sale', 'prop', 'PROPOSED', 'stamping', 60, 420],
    ['District dashboards', 'live compliance, nationwide', 'built', 'BUILT', 'dashboards', 1180, 420],
  ];
  const arch = [
    ['Stateless REST API', 'JWT · horizontal scaling', 'stateless'],
    ['PostgreSQL · Prisma', 'one schema, every state', 'postgresql'],
    ['Deployed on Vercel', 'live at nawi-reportpro.vercel.app', 'deployed'],
    ['HMAC-SHA256 seals', 'verifiable anywhere, by anyone', 'seals'],
  ];
  const outcomes = [
    ['Officers in the field,', 'not on paperwork.', 'officers'],
    ['Forged certificates', 'stop working.', 'forge'],
    ['Every citizen can check', 'in seconds.', 'every'],
  ];
  const html = `${bgLayer(id, 'ONE NATION', 1000, 800)}
${chapter(id, '08', 'Scaling to the nation')}
          <div id="${id}-p1" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; inset:0;">
            <div id="${id}-dots" style="position:absolute; left:760px; top:150px; width:${COLS * 27}px; height:${ROWS * 27}px;">
            </div>
            <div id="${id}-t1" style="position:absolute; left:110px; top:190px; width:600px;">
              <div class="big" style="font-size:150px; color:#f59e0b;">11</div>
              <div class="big" style="font-size:52px;">districts of Punjab — today.</div>
            </div>
            <div id="${id}-t2" style="position:absolute; left:110px; top:560px; width:600px;">
              <div class="big" style="font-size:52px;">Nothing in it is Punjab-specific.</div>
            </div>
            <div id="${id}-t3" style="position:absolute; left:110px; top:190px; width:620px;">
              <div class="mono" style="font-size:22px; font-weight:700; letter-spacing:0.14em; color:#f59e0b;">EVERY STATE · EVERY DISTRICT</div>
              <div class="big" style="font-size:96px; margin-top:14px;">One platform.</div>
            </div>
          </div>
          <div id="${id}-tiles" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:110px; top:640px; width:1700px; display:flex; gap:24px;">
${tiles.map((t, i) => `            <div id="${id}-ti${i}" style="flex:1; height:280px; border-radius:14px; overflow:hidden; position:relative; box-shadow:0 20px 60px rgba(0,0,0,0.5);">
              <img src="assets/photos/${t[0]}" alt="" style="position:absolute; left:0; top:0; width:100%; height:100%; object-fit:cover;" />
              <div style="position:absolute; left:0; right:0; bottom:0; padding:18px 20px; background:rgba(8,18,38,0.86); font-size:30px; font-weight:900;">${t[1]}</div>
            </div>`).join('\n')}
          </div>
          <div id="${id}-hub" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:120px; top:110px; width:1680px; height:780px;">
            <svg width="1680" height="780" style="position:absolute; left:0; top:0;">
${hub.map((h, i) => `              <line id="${id}-ln${i}" x1="840" y1="380" x2="${h[5] < 600 ? 520 : 1160}" y2="${h[6] < 200 ? 150 : 530}" stroke="#f59e0b" stroke-width="5" stroke-dasharray="14 10"/>`).join('\n')}
            </svg>
            <div id="${id}-core" style="position:absolute; left:640px; top:290px; width:400px; height:180px; border-radius:20px; background:#f59e0b; color:#0b1a33; display:flex; flex-direction:column; align-items:center; justify-content:center;">
              <div class="big" style="font-size:44px;">NAWI-ReportPro</div>
              <div class="mono" style="font-size:20px; font-weight:700; margin-top:6px;">NATIONAL PLATFORM</div>
            </div>
${hub.map((h, i) => `            <div class="card" id="${id}-hb${i}" style="position:absolute; left:${h[5]}px; top:${h[6]}px; width:440px; padding:22px 26px;">
              <span class="tag ${h[2]}">${h[3]}</span>
              <div class="v" style="font-size:36px; font-weight:900; margin-top:12px;">${h[0]}</div>
              <div style="font-size:24px; color:#a9b4c7; margin-top:6px;">${h[1]}</div>
            </div>`).join('\n')}
          </div>
          <div id="${id}-arch" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:110px; top:150px; width:1700px;">
            <div class="mono" style="font-size:22px; font-weight:700; letter-spacing:0.14em; color:#f59e0b;">THE FOUNDATION IS ALREADY BUILT</div>
            <div style="display:flex; flex-direction:column; gap:20px; margin-top:28px;">
${arch.map((a, i) => `              <div class="card" id="${id}-ar${i}" style="display:flex; align-items:center; gap:30px; padding:24px 32px; width:${1100 + i * 150}px;">
                <div class="mono" style="font-size:34px; font-weight:700; color:#f59e0b;">0${i + 1}</div>
                <div class="v" style="font-size:44px; font-weight:900; margin-top:0;">${a[0]}</div>
                <div style="font-size:26px; color:#a9b4c7;">${a[1]}</div>
              </div>`).join('\n')}
            </div>
          </div>
          <div id="${id}-out" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:110px; top:170px; width:1700px; display:flex; flex-direction:column; gap:40px;">
${outcomes.map((o, i) => `            <div id="${id}-o${i}" class="big" style="font-size:80px;">${o[0]} <span style="color:#f59e0b;">${o[1]}</span></div>`).join('\n')}
          </div>`;
  const t39 = L('l39'), t40 = L('l40'), t41 = L('l41'), t42 = L('l42');
  let js = `          const dotsEl = document.getElementById("${id}-dots");
          const PJ = ${JSON.stringify([...punjab])};
          for (let r = 0; r < ${ROWS}; r++) for (let c = 0; c < ${COLS}; c++) {
            const i = r * ${COLS} + c;
            const d = document.createElement("span");
            d.id = "${id}-d" + i;
            d.style.cssText = "position:absolute; left:" + (c * 27) + "px; top:" + (r * 27) + "px; width:14px; height:14px; border-radius:50%; display:block; background:" + (PJ.includes(i) ? "#f59e0b" : "#2a3f66") + ";";
            dotsEl.appendChild(d);
          }
${chapterIn(id)}
${ambient(id)}
          tl.set(["#${id}-t2", "#${id}-t3", "#${id}-tiles", "#${id}-hub", "#${id}-arch", "#${id}-out"], { opacity: 0 }, 0);
          tl.fromTo("#${id}-dots", { opacity: 0 }, { opacity: 1, duration: 0.8 }, 0.3);
          tl.fromTo("#${id}-t1", { opacity: 0, y: 40 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, ${W('l38', 'eleven') - 0.2});
          tl.fromTo("#${id}-t2", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.6, ease: "power3.out" }, ${W('l38', 'nothing') - 0.1});
          tl.to(["#${id}-t1", "#${id}-t2"], { opacity: 0, duration: 0.5 }, ${t39 - 0.2});
          tl.fromTo("#${id}-t3", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.7, ease: "power3.out" }, ${t39 + 0.1});`;
  // dots light up in a wave from Punjab outward
  const origin = [9.5, 5];
  const order = dots.map(([c, r], i) => ({ i, d: Math.hypot(c - origin[0], (r - origin[1]) * 1.2) })).filter((o) => !punjab.has(o.i));
  const maxD = Math.max(...order.map((o) => o.d));
  const wave0 = W('l39', 'imagine') + 0.2, waveLen = 3.2;
  js += `\n          const wave = ${JSON.stringify(order.map((o) => [o.i, +(wave0 + (o.d / maxD) * waveLen).toFixed(2)]))};
          wave.forEach(([i, t]) => { tl.to("#${id}-d" + i, { backgroundColor: "#f59e0b", duration: 0.35, ease: "power1.out" }, t); });`;
  js += `\n          tl.to("#${id}-dots", { scale: 0.72, x: 60, y: -120, opacity: 0.5, duration: 0.8, ease: "power2.inOut" }, ${W('l39', 'every', 1) - 0.4});`;
  tiles.forEach((t, i) => { js += `\n          tl.fromTo("#${id}-ti${i}", { opacity: 0, y: 60 }, { opacity: 1, y: 0, duration: 0.55, ease: "back.out(1.4)" }, ${W('l39', t[2]) - 0.15});`; });
  js += `\n          tl.set("#${id}-tiles", { opacity: 1 }, ${W('l39', 'weighbridge') - 0.3});
          tl.set([${tiles.map((t, i) => `"#${id}-ti${i}"`).join(',')}], { opacity: 0 }, 0);
          tl.to(["#${id}-p1", "#${id}-tiles"], { opacity: 0, duration: 0.5 }, ${t40 - 0.2});
          tl.to("#${id}-hub", { opacity: 1, duration: 0.3 }, ${t40});
          tl.fromTo("#${id}-core", { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 0.6, ease: "back.out(1.8)" }, ${t40});`;
  hub.forEach((h, i) => {
    js += `\n          tl.fromTo("#${id}-ln${i}", { opacity: 0 }, { opacity: 1, duration: 0.3 }, ${W('l40', h[4]) - 0.3});
          tl.fromTo("#${id}-hb${i}", { opacity: 0, scale: 0.85 }, { opacity: 1, scale: 1, duration: 0.5, ease: "back.out(1.6)" }, ${W('l40', h[4]) - 0.15});`;
  });
  js += `\n          tl.to("#${id}-hub", { opacity: 0, duration: 0.5 }, ${t41 - 0.3});
          tl.to("#${id}-arch", { opacity: 1, duration: 0.3 }, ${t41});`;
  arch.forEach((a, i) => { js += `\n          tl.fromTo("#${id}-ar${i}", { opacity: 0, x: -80 }, { opacity: 1, x: 0, duration: 0.55, ease: "power3.out" }, ${W('l41', a[2]) - 0.2});`; });
  js += `\n          tl.to("#${id}-arch", { opacity: 0, duration: 0.5 }, ${t42 - 0.3});
          tl.to("#${id}-out", { opacity: 1, duration: 0.3 }, ${t42});`;
  outcomes.forEach((o, i) => { js += `\n          tl.fromTo("#${id}-o${i}", { opacity: 0, y: 50 }, { opacity: 1, y: 0, duration: 0.7, ease: "expo.out" }, ${W('l42', o[2], o[2] === 'every' ? 0 : 0) - 0.15});`; });
  scenesHtml[id] = sub(id, 'Scale to the nation', html, js);
}

// ================================================================ S16 — close
{
  const id = 's16-close';
  const html = `          <div class="bg"></div>
          <div class="cam" id="${id}-kb" style="width:1920px;height:1080px;transform-origin:50% 50%;"><img class="photo" src="assets/photos/mandi-labour.jpg" alt="" style="object-position: 50% 62%;" /></div>
          <div class="shade" id="${id}-shade"></div>
          <div id="${id}-q" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; left:110px; top:330px; width:1720px;">
            <div class="big" id="${id}-q1" data-layout-allow-overlap style="font-size:84px;">Gurpreet will never read OIML R 76.</div>
            <div class="big" id="${id}-q2" data-layout-allow-overlap style="font-size:84px; color:#f59e0b; margin-top:24px;">He just needs to know the scale is honest.</div>
          </div>
          <div id="${id}-end" data-layout-allow-overlap data-layout-allow-occlusion style="position:absolute; inset:0; background:#0b1a33;">
            <div class="glow" id="${id}-glow" style="left:260px; top:-340px;"></div>
            <img id="${id}-chakra" src="assets/gov/ashoka-chakra.svg" alt="" style="position:absolute; left:1240px; top:180px; width:720px; height:720px; opacity:0.1;" />
            <div style="position:absolute; left:140px; top:190px; width:1400px;">
              <img id="${id}-emb" src="assets/gov/emblem-white-240.png" alt="" style="width:110px; height:auto;" />
              <div class="big" id="${id}-word" data-layout-allow-overlap style="font-size:160px; margin-top:24px;">NAWI-ReportPro</div>
              <div id="${id}-ul" style="width:1040px; height:10px; background:#f59e0b; margin-top:16px; transform-origin:left center;"></div>
              <div id="${id}-tag" data-layout-allow-overlap style="font-size:54px; font-weight:700; margin-top:34px;">Every scale, verified. <span style="color:#f59e0b;">Every weighing, trusted.</span></div>
              <div id="${id}-meta" class="mono" style="font-size:24px; color:#a9b4c7; margin-top:40px; letter-spacing:0.08em;">SMART INDIA HACKATHON 2026 · OIML R 76-1:2006 · LEGAL METROLOGY ACT, 2009</div>
            </div>
            <div id="${id}-cred" style="position:absolute; left:140px; top:960px; width:1640px; font-size:20px; color:#7f8ba3;">Demo data and officers are illustrative. Gurpreet Singh is a fictional character. Photographs: Wikimedia Commons.</div>
          </div>`;
  const tEnd = L('l45') - 0.5;
  const js = `          tl.fromTo("#${id}-kb", { scale: 1.08 }, { scale: 1.2, duration: D, ease: "none" }, 0);
          tl.fromTo("#${id}-q1", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, ${L('l43') - 0.1});
          tl.fromTo("#${id}-q2", { opacity: 0, y: 30 }, { opacity: 1, y: 0, duration: 0.8, ease: "power3.out" }, ${L('l44') - 0.1});
          tl.fromTo("#${id}-end", { opacity: 0 }, { opacity: 1, duration: 0.8, ease: "power1.inOut" }, ${tEnd});
          tl.fromTo("#${id}-glow", { scale: 0.85 }, { scale: 1.15, duration: D - ${tEnd}, ease: "sine.inOut" }, ${tEnd});
          tl.fromTo("#${id}-chakra", { rotation: 0 }, { rotation: 45, duration: D - ${tEnd}, ease: "none" }, ${tEnd});
          tl.fromTo("#${id}-emb", { opacity: 0, y: -20 }, { opacity: 1, y: 0, duration: 0.6 }, ${tEnd + 0.3});
          tl.fromTo("#${id}-word", { opacity: 0, y: 50, scale: 1.04 }, { opacity: 1, y: 0, scale: 1, duration: 1.0, ease: "expo.out" }, ${W('l45', 'report') - 0.5});
          tl.fromTo("#${id}-ul", { scaleX: 0 }, { scaleX: 1, duration: 0.9, ease: "power3.inOut" }, ${W('l45', 'report')});
          tl.fromTo("#${id}-tag", { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.7, ease: "power2.out" }, ${W('l45', 'every') - 0.1});
          tl.fromTo("#${id}-meta", { opacity: 0 }, { opacity: 1, duration: 0.8 }, ${E('l45') + 0.3});
          tl.fromTo("#${id}-cred", { opacity: 0 }, { opacity: 1, duration: 0.8 }, ${E('l45') + 0.8});`;
  scenesHtml[id] = sub(id, 'Close', html, js);
}

// ---------------------------------------------------------------- write scenes
fs.mkdirSync(path.join(ROOT, 'compositions'), { recursive: true });
for (const s of scenes) fs.writeFileSync(path.join(ROOT, 'compositions', `${s.id}.html`), scenesHtml[s.id]);

// ---------------------------------------------------------------- index.html
const caps = [];
for (const l of Object.values(lines)) for (const c of captionChunks(l)) caps.push({ text: c.text, start: +(l.global + c.t0).toFixed(3), end: +(l.global + c.t1).toFixed(3) });
for (let i = 0; i + 1 < caps.length; i++) if (caps[i].end > caps[i + 1].start) caps[i].end = caps[i + 1].start;

// sound design (global seconds)
const G = (sid, t) => +(sceneOf(sid).start + t).toFixed(3);
const sfx = [
  ['impact-bass-1', G('s04-intro', W('l09', 'nawi') - 0.1), 0.45],
  ['whoosh-short', G('s05-dashboard', 0.1), 0.35],
  ['chime', G('s08-session', W('l18', 'five')), 0.3],
  ['click-soft', G('s09-capture', 0.3 + 1.6 / rates['s09-capture']), 0.5],
  ['chime', G('s10-seal', W('l24', 'sealed')), 0.4],
  ['whoosh-short', G('s11-pdf', 0.2), 0.35],
  ['error', G('s12-reject', W('l29', 'red')), 0.3],
  ['whoosh-short', G('s12-reject', L('l30') - 0.3), 0.3],
  ['ping', G('s13-verify', W('l33', 'valid') - 0.05), 0.45],
  ['error', G('s13-verify', W('l34', 'tampered')), 0.25],
  ['riser', G('s15-scale', W('l39', 'imagine') - 1.0), 0.25],
  ['impact-bass-1', G('s16-close', L('l45') - 0.5), 0.4],
];
const sfxDur = (n) => probe(path.join(ROOT, 'assets/sfx', `${n}.mp3`));

const voiceTags = Object.values(lines).map((l) => `    <audio id="vo-${l.id}" src="assets/voice/${l.id}.wav" data-start="${l.global.toFixed(3)}" data-duration="${l.dur.toFixed(3)}" data-track-index="20" data-volume="1"></audio>`).join('\n');
const sfxTags = sfx.map(([n, t, v], i) => `    <audio id="sfx-${i}" src="assets/sfx/${n}.mp3" data-start="${t}" data-duration="${sfxDur(n).toFixed(3)}" data-track-index="${22 + (i % 2)}" data-volume="${v}"></audio>`).join('\n');
const sceneTags = scenes.map((s, i) => `    <div id="host-${s.id}" data-composition-id="${s.id}" data-composition-src="compositions/${s.id}.html" data-start="${s.start}" data-duration="${s.dur}" data-track-index="${i % 2}" data-width="1920" data-height="1080"></div>`).join('\n');
const capTags = caps.map((c, i) => `      <div id="cap-${i}" class="clip cap" data-start="${c.start}" data-duration="${(c.end - c.start).toFixed(3)}" data-track-index="30"><span>${esc(c.text)}</span></div>`).join('\n');

// music: louder in the cold open and on the end card, carved under the voice
const endCard = G('s16-close', L('l45') - 0.5);
const musicLane = { version: 1, lanes: [{ target: 'volume', points: [
  { t: 0, v: 0 }, { t: 1.5, v: 0.55 }, { t: G('s01-open', L('l01')) - 0.2, v: 0.28 },
  { t: G('s04-intro', L('l09')) - 0.8, v: 0.28 }, { t: G('s04-intro', L('l09')) - 0.3, v: 0.4 }, { t: G('s04-intro', L('l09')) + 0.2, v: 0.26 },
  { t: G('s15-scale', L('l39')) - 1.0, v: 0.26 }, { t: G('s15-scale', L('l39')), v: 0.32 },
  { t: endCard - 1, v: 0.3 }, { t: endCard + 2.5, v: 0.5 }, { t: TOTAL - 3, v: 0.5 }, { t: TOTAL, v: 0 },
] }] };

const index = `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=1920, height=1080" />
    <title>NAWI-ReportPro — Walkthrough</title>
    <script src="assets/vendor/gsap.min.js"></script>
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      html, body { margin: 0; width: 1920px; height: 1080px; overflow: hidden; background: #0b1a33; }
      #root { position: relative; width: 100%; height: 100%; overflow: hidden; background: #0b1a33; font-family: Montserrat, sans-serif; }
      .cap { position: absolute; left: 0; top: 942px; width: 1920px; height: 120px; display: flex; align-items: center; justify-content: center; pointer-events: none; }
      .cap span { display: block; max-width: 1500px; padding: 12px 30px; border-radius: 10px; background: rgba(6,14,30,0.86); color: #f7f3ea; font-family: Montserrat, sans-serif; font-weight: 700; font-size: 33px; line-height: 1.3; text-align: center; letter-spacing: -0.005em; }
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="${TOTAL}" data-width="1920" data-height="1080">
${sceneTags}
      <div id="captions" style="position:absolute; inset:0;">
${capTags}
      </div>
    </div>
${voiceTags}
${sfxTags}
    <audio id="music-bed" src="assets/music/bed.mp3" data-start="0" data-duration="${TOTAL}" data-track-index="25" data-volume="1" data-automation='${JSON.stringify(musicLane)}'></audio>
    <script>
      const tl = gsap.timeline({ paused: true });
      window.__timelines["main"] = tl;
    </script>
  </body>
</html>
`;
fs.writeFileSync(path.join(ROOT, 'index.html'), index);
fs.writeFileSync(path.join(ROOT, 'timing.json'), JSON.stringify({ total: TOTAL, scenes, lines: Object.fromEntries(Object.entries(lines).map(([k, v]) => [k, { scene: v.scene, global: +v.global.toFixed(3), local: +v.local.toFixed(3), dur: v.dur }])), captions: caps.length }, null, 2));
console.log(`total ${TOTAL.toFixed(1)}s (${Math.floor(TOTAL / 60)}:${String(Math.round(TOTAL % 60)).padStart(2, '0')}), ${scenes.length} scenes, ${caps.length} captions`);
for (const s of scenes) console.log(`  ${s.id.padEnd(15)} ${s.start.toFixed(1).padStart(6)}  +${s.dur.toFixed(1)}`);
