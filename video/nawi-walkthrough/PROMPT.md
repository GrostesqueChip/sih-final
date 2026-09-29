# Prompt: make the NAWI-ReportPro walkthrough film

> Copy everything below the line into a fresh chat. The **Attach** section lists what to attach.
> Works best in Claude Code (web or CLI) with the HyperFrames plugin installed and the repo available:
> `claude plugin marketplace add heygen-com/hyperframes` then `claude plugin install hyperframes@hyperframes`.

## Attach

**Required**
1. **The repository.** Select `GrostesqueChip/sih-final` as the session's repo in Claude Code. In a plain chat, attach a zip of the repo instead. The new chat needs to run the app (`npm install && npm run demo`) to record real screens.

**Strongly recommended.** These let a fresh chat reuse the finished assets instead of re-making them. All paths are under `video/nawi-walkthrough/`:

2. `script.json`: the final narration. The prompt below also contains it.
3. `assets/capture/`: the real screen recordings (`c01…c13 *.mp4`), stills (`s-*.png`), certificate/data-sheet PDF renders (`pdf-*.png`) and `qr-pass.png`.
4. `assets/voice/`: the 45 male-voice WAV lines and `words/*.json` word timestamps. Skip these if you want a different voice.
5. `tools/capture.mjs` and `tools/build.mjs`: the capture script and the composition generator.

**Optional**
6. `renders/nawi-reportpro-walkthrough.mp4`: the current cut, as a reference to improve on.
7. `docs/screenshots/*.jpg` from the repo root: quick visual context if the chat can't run the app.
8. A real voice-over recording, if you have one. Tell the chat to use it instead of TTS.

In a plain chat (not Claude Code), attach at least items 3, 7 and 2. The chat then has real UI footage and doesn't need to run anything.

---

## THE PROMPT

You are making a narrated **product walkthrough film** for **NAWI-ReportPro**, our Smart India Hackathon 2026 project. It is a digital system for verifying and certifying non-automatic weighing instruments (weighing scales used in trade) under **OIML R 76-1:2006** and the **Legal Metrology Act, 2009** (with the Legal Metrology (General) Rules, 2011).

**Audience:** SIH judges.

**Goal:** a showcase that runs from the problem to the solution, through PDF certificate generation and public verification, and ends with how India would look if this were rolled out nationally. The film should work as a story judges can relate to from start to finish, and focus on details.

### Deliverable
- MP4, 16:9, 1920×1080, 30 fps, **about 6–6.5 minutes**. Take the time needed to cover everything, but no padding.
- **A male voice-over**: calm, clear, documentary tone.
- Burned-in captions (sentence chunks, max 2 lines, bottom band, never covering key UI).
- A soft ambient music bed, carved under the voice, plus a few subtle sound effects on key beats (seal, VALID, error).
- The HyperFrames project source, so it can be edited and re-rendered. Keep the MP4 under 95 MB (2-pass encode) so it fits in git.

### Non-negotiable honesty rules
- **Every app screen must be the real app**, recorded from `npm run demo`. Don't use mock-ups of the UI.
- Future integrations (DigiLocker, e-NAM) must be visibly labelled **PROPOSED**. Things the code already does must be labelled **BUILT**: RS-232/Web Serial indicators, dashboards, offline sync, HMAC seals, the PostgreSQL/Prisma backend.
- **Do not draw a map of India.** Boundary accuracy is sensitive. Show "every district" as an abstract dot field instead.
- The farmer **Gurpreet Singh is fictional**. Say so in small text on the end card, together with "Demo data and officers are illustrative. Photographs: Wikimedia Commons."
- Don't invent statistics. The only numbers used are the illustrative 1% → 5 kg on 500 kg, and figures visible in the demo data.

### How to run the app (for recording)
`npm install && npm run demo`, then open http://localhost:3000. It uses an in-memory demo database with no setup.
- One-click logins are on `/login`. The **Inspector** is Shri Vikramaditya Sharma; there are also a Controller and an Auditor.
- **Key instrument:** "Bathinda Cotton Mandi Platform Scale" (`/instruments/inst-ps-02`). Its history shows it **FAILED on 03 Dec 2025**, then **PASSED on 27 Feb 2026**, and is now **IN PROGRESS on 27 Sep 2026**. This is a real story beat.
- **Key session:** `/tests/sess-034` (cert NAWI-2026-000124) has 5 of 6 modules done. The creep test is at `/tests/sess-034/TIME_DEPENDENCE`, where you press **"Auto-capture remaining"**. Then press **Complete module**, **Finalise & seal**, and **Sign & seal certificate**. That opens `/reports/sess-034`.
- **Rejection demo:**
  1. Go to `/tests/new`, search "Kirana", select "Kirana Store Counter Scale", and click Open verification session.
  2. Go to `/<session>/WEIGHING_PERFORMANCE`.
  3. Click **"Faulty load cell"**, then Auto-capture. Out-of-tolerance readings turn red and the verdict becomes FAIL.
  4. Existing rejected certificate: NAWI-2026-000120 (session `sess-030`, Rajpura weighbridge, creep failure).
- **Public portal:** `/verify` and `/verify/NAWI-2026-000124` (VALID) or `/verify/NAWI-2026-000120` (REJECTED). Record these in a 390×844 @3× phone viewport too.
- **PDFs:** log in via `POST /api/auth/login` (`inspector@nawi.gov.in` / `Inspector@123`) to get a JWT, then `GET /api/reports/<sessionId>/certificate` and `/datasheet`. Render the pages to PNG at about 220 dpi.
- Hindi toggle: the "हिंदी" button in the top strip. Also see `/audit` and `/instruments/new` (use its "Fill example data" button to show the live OIML check panel).
- **Recording method that worked well:** Playwright with the Chrome DevTools `Page.startScreencast` at 1440×810 CSS × DPR 4/3, giving 1920×1080 JPEG frames. Assemble them with ffmpeg concat using the frame timestamps. Inject a visible cursor plus a click-ripple via `addInitScript`, and move the mouse in smooth steps.

### Story and narration (use verbatim; this is the approved script)
Each bullet is one voice line. Brackets hold what's on screen.

**0 · Cold open**: [mandi photo, slow push; "30.21° N · 74.95° E"; big "Bathinda, Punjab."; an amber LCD scale readout counts 000.0 → 500.0 kg; "One number."]
- Bathinda, Punjab. Cotton season.
- Gurpreet Singh has spent eight months growing this crop. Today, a whole year of his work comes down to one number — the one on the mandi scale.

**1 · The problem**: [scale photo; "Who checked this scale?"; the LCD drifts 500.0 → 495.0 with a "LOAD CELL DRIFT −1%" flag; "−5 kg" in red; chips "every weighing / every farmer / all season long"; the readout blurs]
- But who checked that scale?
- If a load cell drifts by just 1%, a 500 kg load loses 5 kg. On every weighing. For every farmer. All season long.
- And nobody notices — because nobody can see.

**1 · Paper today**: ["LEGAL METROLOGY ACT, 2009 — Every weighing instrument used in trade — verified. Every year."; four cards appear on their words: paper register / readings copied by hand / error limits on a calculator / a certificate anyone can forge; then "no way to check"]
- By law, every weighing instrument used in trade must be verified by the Legal Metrology department. Every year.
- But today, verification often means a paper register, readings copied by hand, error limits worked out on a calculator, and a paper certificate anyone with a printer can forge.
- And for Gurpreet, there is no way to check any of it.

**Introducing the product**: [State Emblem; wordmark "NAWI-ReportPro" with a saffron underline; badges "OIML R 76-1:2006 / Legal Metrology Act, 2009 / LM (General) Rules, 2011"; then a 4-node flow: Officer's first reading → OIML R 76 engine → Sealed certificate → Citizen's phone]
- This is NAWI-ReportPro.
- A complete digital system for verifying and certifying non-automatic weighing instruments — built on OIML R 76 and the Legal Metrology Act, 2009.
- It follows a scale from the officer's very first reading, all the way to a sealed certificate any citizen can check on their phone.

**2 · Inspector dashboard**: [real recording: one-click Inspector login, dashboard scroll; right-rail callouts "81% · 13 of 16 valid", "Due · Expired · Rejected", "₹11,000 fees", "11 districts"]
- Meet Inspector Vikramaditya Sharma. One click, and he's in.
- His dashboard shows the whole jurisdiction at a glance: which scales hold a valid stamp, which are due, expired or rejected, and the fees collected — district by district.

**2 · Registry**: [recording: registry filter chips, search "Bathinda", open the instrument; punch in on the verification history; rail timeline 03 Dec 2025 FAIL → 27 Feb 2026 PASS → 27 Sep 2026 IN PROGRESS]
- Every weighing instrument in trade lives in one registry: mandi weighbridges, ration-shop scales, milk-collection scales, even jewellers' balances.
- Here is Gurpreet's mandi scale — and its history tells a story. Last December, this very scale failed verification. It was pulled from trade, repaired, and passed again in February.

**2 · Register**: [recording: "Fill example data"; punch in on the LIVE OIML R 76 CHECK panel; rail "n = Max/e = 3,000 ✓", "Min ≥ 20e ✓ · d ≤ e ✓", "MPE preview"]
- Registering a new scale takes a minute. As the officer types, the app checks the specifications against OIML R 76 — live — and previews the maximum permissible error at every load.

**3 · Six tests**: [recording of session sess-034; rail lists the six tests with their clauses (A.4.4, A.4.10, A.4.7, A.5.3, A.4.11, A.4.8), each lighting on its word; five checks turn green, the sixth pulses saffron]
- Now it's time for this year's re-verification. OIML R 76 demands six separate tests: weighing performance, repeatability, eccentricity, temperature, stability and creep.
- Five are already done. One remains.

**3 · Live capture**: [recording of creep auto-capture, slowed; punch in on the indicator; rail steps 01 Load → 02 Wait for STABLE → 03 Record → 04 Error vs MPE → verdict; then "Handwritten numbers / Calculator / Favours" struck through in red]
- The scale's digital indicator streams straight into the app. The inspector presses auto-capture.
- For each test point, the app loads the weight, waits until the reading is truly stable, and only then records it. The error, the legal limit and the verdict are calculated instantly.
- No handwritten numbers. No calculator. No room for a mistake — or a favour.

**4 · Finalise & seal**: [recording: Complete module → Finalise & seal dialog (punch in on "Outcome: APPROVED") → Sign & seal → report; rail: "Verdict computed from the readings — cannot be overridden"; the HMAC hash types out; "Readings locked"]
- All six tests are complete. He finalises the session.
- The verdict is computed by the engine, from the readings themselves. Nobody can override it.
- One signature, and the certificate is sealed with an HMAC-SHA256 digital seal. From this moment, the readings are locked.

**4 · The PDF**: [the real certificate PNG; the camera zooms region by region on each spoken word: bilingual title, emblem, tests table, uncertainty, signature & stamp, QR, HMAC seal; then the 3 data-sheet pages fan out and the error-envelope chart zooms in]
- The official certificate is generated in seconds.
- Bilingual, in Hindi and English. The State Emblem. Every test and its result. The measurement uncertainty. The officer's signature, the stamp, a QR code and the digital seal.
- Behind it, a three-page technical data sheet records every single reading and plots the error curve against the legal limits.

**5 · When a scale is wrong**: [recording: "Faulty load cell", auto-capture, readings turn red, FAIL (sped up about 1.6×, punch in on the red cells); then the real Certificate of Rejection slides in; rail "Not valid for trade · repaired by a licensed repairer and verified again · Sec. 25, LM Act 2009"]
- But what happens when a scale is wrong?
- Here, we simulate a faulty load cell on a neighbourhood grocery-store scale. As the load rises, the readings creep upward. The moment an error crosses the legal limit, it turns red.
- A failed scale receives a Certificate of Rejection. It cannot be used in trade until it is repaired and verified again.

**6 · Public verification**: [mandi photo again; the QR (cropped from the certificate) with a scan line; a phone mock-up plays the real mobile recording; a giant green "VALID" lands on the word, with cards for owner / verified by / valid until; then the phone switches to the REJECTED record, "Tampered? The seal won't match.", and a "1915 National Consumer Helpline" card; the closing line appears as big text]
- Now, back to the mandi.
- Gurpreet sees the QR code on the scale's verification sticker. He scans it with his phone. No app. No login.
- The portal recomputes the digital seal and answers in one word: VALID. Who owns this scale, which officer verified it, and until when.
- If a scale has been rejected, or a certificate tampered with, he will know that too. And one tap connects him to the National Consumer Helpline, 1915.
- For the first time, the person on the other side of the scale can see the truth.

**7 · Built for trust**: [recordings: audit trail, then the dashboard switching to Hindi; rail: append-only audit trail · Hindi + English · GIGW 3.0 · offline queue that syncs later]
- Every action — every reading, every edit, every seal — goes into an append-only audit trail.
- The whole interface works in Hindi and English, follows GIGW accessibility guidelines, and keeps working offline in the field — syncing when the network returns.

**8 · Scaling to the nation**:
- Visuals: a dot field of about 800 "districts" with 11 lit in saffron ("11 districts of Punjab — today"). A wave lights all of them ("Every state · every district — One platform").
- Photo tiles: mandi weighbridges / ration-shop scales / milk-collection centres / jewellers' balances.
- A hub diagram around a "NAWI-ReportPro · National platform" core, each node tagged BUILT or PROPOSED: Weighing indicators (BUILT) · DigiLocker (PROPOSED) · e-NAM mandis (PROPOSED) · District dashboards (BUILT).
- Architecture bars: Stateless REST API (JWT) · PostgreSQL / Prisma · Offline-first field app (IndexedDB queue) · HMAC-SHA256 seals.
- Three outcome lines at the end.

Narration:
- Today, this demo covers 11 districts of Punjab. But nothing in it is specific to Punjab.
- Imagine every state's Legal Metrology department on one platform. Every mandi weighbridge. Every ration-shop scale. Every milk-collection centre. Every jeweller's balance.
- Real weighing indicators, plugged straight in. Certificates that could flow into DigiLocker. A scale's stamping status, shown right inside e-NAM mandis. Live compliance dashboards for every district in India.
- The foundation is already built for it: a stateless API on PostgreSQL, an offline-first field app, and seals anyone can verify, anywhere.
- Officers spend their time in the field, not on paperwork. Forged certificates stop working. And every citizen can check, in seconds, whether the scale in front of them is honest.

**Close**: [mandi photo with the quote; then the end card: emblem, "NAWI-ReportPro", "Every scale, verified. Every weighing, trusted.", "SMART INDIA HACKATHON 2026 · OIML R 76-1:2006 · LEGAL METROLOGY ACT, 2009", and small credits]
- Gurpreet will never read OIML R 76. He doesn't need to.
- He just needs to know that the scale is honest.
- NAWI-ReportPro. Every scale, verified. Every weighing, trusted.

**TTS pronunciation tips:** write "Nawi Report Pro", "O I M L, R seventy-six", "H MAC, S H A two fifty-six", "nineteen fifteen", "Digi Locker" and "e-Nam" in the spoken text. Avoid "kirana"; say "grocery store". Keep the caption text in its proper written form.

### Design system
- **Colour:** navy background `#0b1a33`, panels `#12264a`, warm off-white text `#f3efe6`, a single saffron accent `#f59e0b` (the app's own), green `#2fb56a` for PASS/VALID and red `#e04848` for FAIL. Add a subtle grid, a breathing saffron radial glow, and faint oversized "ghost" words per scene.
- **Type:** Montserrat 900 for statements and IBM Plex Mono 700 for measurements, labels and chapter tags. The contrast is deliberate: human voice versus instrument precision. Headlines 80–150 px, body 28–38 px, never under 20 px.
- **Recurring motif:** an amber 7-segment-style LCD readout, used in the cold open and the problem scene.
- **App-screen layout:** a browser window (1440×810 recording plus a 36 px chrome bar showing `localhost:3000/...`) at the left, x 40 / y 72. The right rail (x 1510, width about 372) holds synced callout cards. Chapter tags ("02 · THE SOLUTION · INSPECTOR") sit at the top-left. The caption band is y ≈ 942–1062.
- **Motion:** time every callout, zoom and stamp to the **spoken word** using word timestamps. Crossfade scenes with a 0.5 s overlap. Use punch-ins on the recording (a transform on an inner wrapper), and vary the eases.

### Technical approach that worked (HyperFrames)
1. Make a HyperFrames project with `hyperframes init … --example=blank`, one sub-composition per scene under `compositions/`, and `index.html` holding the voice `<audio>` clips, captions, SFX and the music bed with a volume-automation lane.
2. **Voice:** generate one WAV per line so timing is exact; I used the local Kokoro `am_michael` voice. Use a better male voice if one is available: ElevenLabs, a HeyGen sign-in, or a real recording. Then transcribe each line locally with Parakeet to get word timestamps. That transcript doubles as a pronunciation check.
3. **Build:** a generator script computes scene starts from the real WAV durations (0.4 s between lines; per-scene lead and tail) and writes every scene with tweens anchored to word times.
4. **Gotchas:**
   - **Vendor GSAP locally.** A CDN fetch fails behind proxies.
   - Use root-relative `assets/...` paths in sub-compositions.
   - Don't tween `letterSpacing`.
   - Mark time-phased overlapping layers with `data-layout-allow-overlap` and decorative ghost text with `data-layout-ignore`.
   - Keep `<video>` timing on the video itself, never on a timed parent.
   - Put a still of the clip's last frame under each recording so holds never go blank.
5. Run `hyperframes check` until it reports 0 errors and WCAG AA contrast passes. Snapshot the midpoint of each scene and review the images. Render with `--video-frame-format png`, then do a 2-pass encode to about 1.7 Mbps video and 160 kbps AAC so the MP4 stays under 95 MB.

### Improvements welcome (if time allows)
- A better male voice: more natural, with Indian English pronunciation of Gurpreet, mandi and Bathinda.
- A short live-action or illustrated shot of a farmer and a weighbridge, only if a properly licensed source exists.
- Tighter pacing in the scaling section, which is about 60 s.

Ask me before changing the script's facts. Otherwise just build it and show me snapshots before the final render.
