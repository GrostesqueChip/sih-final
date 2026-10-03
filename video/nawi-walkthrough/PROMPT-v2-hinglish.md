# Prompt v2: NAWI-ReportPro walkthrough film (Hinglish, Indian male voice, 1.3× pace)

> Paste everything below the line into a fresh chat and attach `nawi-walkthrough-kit.zip`.
>
> The zip has everything from the first build except the old English voice files and the rendered MP4s, which are being replaced:
> - all screen recordings, stills and PDF renders;
> - photos, the State Emblem, the Ashoka Chakra, SFX, the music bed and vendored GSAP;
> - the 16 scene compositions and `index.html`;
> - `tools/build.mjs` (the generator) and `tools/capture.mjs` (the recorder);
> - `script.json` (the v1 English script), `timing.json`, `BRIEF.md`, `README.md`, `PROMPT.md` (v1) and this file.
>
> Best run in Claude Code with the `GrostesqueChip/sih-final` repo selected and the HyperFrames plugin installed:
> `claude plugin marketplace add heygen-com/hyperframes` then `claude plugin install hyperframes@hyperframes`.

---

## THE PROMPT

You are remaking the narrated walkthrough film for **NAWI-ReportPro**, our Smart India Hackathon 2026 project for digital verification and certification of non-automatic weighing instruments under **OIML R 76-1:2006** and the **Legal Metrology Act, 2009**.

**Audience:** SIH judges.

A **v1 film already exists**. The attached kit has its full source, the real screen recordings, and the generator that built it. Read `README.md`, `BRIEF.md`, `PROMPT.md` (v1 spec) and `tools/build.mjs` first. Do not lose anything from v1 unless this prompt changes it.

### What changes from v1
1. **Language:** natural **Hinglish** narration: Hindi-English mix, the way an Indian presenter would speak. Captions are in **Roman script** (e.g. "Cotton ka season hai."). Technical and legal terms stay in English (OIML R 76, MPE, HMAC-SHA256, Legal Metrology Act, certificate, QR code).
2. **Voice:** an **Indian male** voice with an Indian accent. Options, in order of preference:
   - a real recording, if I supply one;
   - a Hinglish-capable Indian TTS, e.g. Sarvam AI "Bulbul" male voices, or an ElevenLabs Indian-English male voice;
   - the local Kokoro Hindi male voices `hm_omega` / `hm_psi`. Kokoro's Hindi phonemizer needs **Devanagari** input for Hindi words, so keep a Devanagari "say" text and a Roman "cap" text per line.

   Generate 2–3 sample lines in each available option and let me choose before generating everything.
3. **Pace: 1.3× faster.** Speak the narration at 1.3× speed; use the TTS speed parameter, or `atempo=1.3` on natural takes. **Re-time every visual to the new word timestamps** rather than speeding up the video. The target runtime is about **5 minutes** (v1 was 6:24). Shorten scene lead/tail padding proportionally (v1: 0.4 s between lines, 0.5 s scene overlap).
4. **Factual fixes.** The v1 script had these errors:
   - ❌ "verified… **every year**": the period depends on the instrument type under the LM rules. ✅ Say **"periodically"** / "samay-samay par".
   - ❌ "keeps **working offline in the field**, syncing when the network returns": no screen saves a verification offline; only the back-end sync endpoint exists. ✅ **Remove this claim.** Don't list "offline" as BUILT anywhere, including the "Built for trust" rail and the architecture bars in the scaling section.
   - ❌ "**follows GIGW accessibility guidelines**": high-contrast mode has a bug. ✅ Say **"text-size aur Hindi options"**. Don't show a "GIGW 3.0" callout.
   - ⚠️ "From this moment, **the readings are locked**" and "if a certificate is **tampered with, he will know**" are only true once **PR #2** is merged, because PR #2 makes the seal cover the verdict plus a SHA-256 digest of every reading. Keep these lines **only after PR #2 is merged and re-recorded**, as described below.
5. **Domain:** the app is deployed at **https://nawi-reportpro.vercel.app**.
   - The fake browser bar in v1 showed `localhost:3000/...`. Change it to `nawi-reportpro.vercel.app/...`. In `build.mjs`, every `url:` in the `win()` calls and in scene 14 is hard-coded.
   - Certificate QR codes and footers must show the Vercel domain.

### Step 0: Merge PR #2 and re-record the affected footage
PR #2 is `GrostesqueChip/sih-final#2`, "Fix certificate forgery, seal readings, correct MPE display, deploy on Vercel", branch `claude/tender-rubin-p27s6p`. It is currently a **draft with merge conflicts** against `main`, which has since gained the Vercel config and README commits.
1. Resolve the conflicts, run `npm test` (expect about 208 passing), then ask me to approve the merge.
2. After merging, check the v1 footage in `assets/capture/` for two old-code artifacts:
   - **a) An MPE shown as "± 0.02" next to a +0.02 error marked FAIL.** The old display rounded 0.015 to 0.02. Check `c08-faulty.mp4`, `s-faulty.png`, `c03-register.mp4`, `s-register.png`, the MPE table on the instrument page, and `pdf-datasheet-p*.png`.
   - **b) `localhost:3000` in a certificate QR or footer.** It is definitely present in v1: `pdf-cert-pass-p1.png`, `pdf-cert-reject-p1.png` and `pdf-datasheet-p*.png` show "Authenticity can be confirmed at http://localhost:3000/verify/…", and `qr-pass.png` encodes localhost. The certificate preview inside `c06-seal.mp4`, `c07-report.mp4` and `s-report.png` shows it too.
3. **Re-record** every affected shot against the merged code. Record either against https://nawi-reportpro.vercel.app, or locally with `PUBLIC_VERIFY_URL=https://nawi-reportpro.vercel.app` set so QR codes and footers carry the real domain.
   - Re-download the certificate/data-sheet PDFs and re-render them to PNG at about 220 dpi.
   - Re-crop the QR code.
   - **New shot worth adding:** PR #2's tamper check. Edit one reading in the DB, and the portal shows **NOT AUTHENTIC**. This makes the "tampered? he'll know" beat real footage instead of a claim.
   - Recording method: `tools/capture.mjs`. It uses Playwright plus the Chrome DevTools `Page.startScreencast` at 1440×810 × DPR 4/3, with an injected cursor and click ripple. Phone shots use 390×844 @3×.
   - **Note:** on Vercel, the live telemetry stream (SSE) may be cut off by the 30 s serverless limit. PR #2 moves the indicator simulator into the browser, so auto-capture should work, but verify it. If a shot fails on Vercel, record locally with `npm run demo`.

### Honesty rules (unchanged from v1, plus the fixes above)
- Every app screen is the real app. Don't use mock-ups.
- Integrations are labelled **BUILT** vs **PROPOSED**:
  - **BUILT:** RS-232/Web Serial indicators, dashboards, HMAC seals, PostgreSQL/Prisma, and the Vercel deployment.
  - **PROPOSED:** DigiLocker and e-NAM.
  - **Not mentioned:** offline field capture.
- No map of India; use the abstract dot field.
- Gurpreet Singh is fictional. The end card says so, along with "Demo data and officers are illustrative. Photographs: Wikimedia Commons."
- Don't invent statistics.

### Hinglish narration (draft; improve the phrasing so it sounds natural spoken aloud, but keep the facts)
Brackets repeat the v1 on-screen treatment; see `tools/build.mjs` for exact timings and animations.

**0 · Cold open**: [mandi photo, "Bathinda, Punjab.", LCD counting to 500.0 kg, "One number."]
- Bathinda, Punjab. Cotton ka season hai.
- Gurpreet Singh ne aath mahine is fasal par mehnat ki hai. Aur aaj, poore saal ki kamaai ek number par tiki hai — mandi ke kaante ka number.

**1 · The problem**: [LCD drifts 500 → 495, "−5 kg", chips, blur]
- Par us kaante ko check kisne kiya?
- Agar load cell sirf 1% bhi drift kare, toh 500 kilo ke load mein 5 kilo gayab. Har tol par. Har kisaan ke saath. Poore season.
- Aur kisi ko pata bhi nahi chalta — kyunki koi dekh hi nahi sakta.

**1 · Paper today**: [heading "Every weighing instrument used in trade — verified periodically."; 4 cards; then "no way to check"]
- Kanoon kehta hai, trade mein use hone wala har weighing instrument, Legal Metrology department se samay-samay par verify hona chahiye.
- Lekin aaj bhi verification ka matlab hai — paper register, haath se likhi readings, calculator par nikali error limits, aur ek paper certificate jo koi bhi printer se nakli bana sakta hai.
- Aur Gurpreet ke paas, isme se kuch bhi check karne ka koi tareeka nahi.

**Introducing the product**
- Pesh hai NAWI-ReportPro.
- Non-automatic weighing instruments ko verify aur certify karne ka ek poora digital system — OIML R 76 aur Legal Metrology Act, 2009 par bana hua.
- Officer ki pehli reading se lekar, ek sealed certificate tak — jise koi bhi citizen apne phone par check kar sakta hai.

**2 · Inspector dashboard**
- Miliye Inspector Vikramaditya Sharma se. Ek click, aur login ho gaye.
- Dashboard par poora jurisdiction ek nazar mein — kaunse kaante valid hain, kaunse due, expired ya rejected, aur kitni fees aayi — district-wise.

**2 · Registry**
- Trade mein use hone wala har instrument ek registry mein hai — mandi weighbridges, ration shop ke kaante, milk collection scales, yahaan tak ki jewellers ke balance bhi.
- Yeh raha Gurpreet ki mandi ka kaanta — aur iski history ek kahaani batati hai. Pichhle December, yahi kaanta verification mein fail hua tha. Trade se hataaya gaya, repair hua, aur February mein phir se pass hua.

**2 · Register**
- Naya kaanta register karna — bas ek minute ka kaam. Officer type karta hai, aur app live OIML R 76 ke against specifications check karta hai, aur har load par maximum permissible error dikha deta hai.

**3 · Six tests**
- Ab is saal ka re-verification. OIML R 76 chhe alag tests maangta hai — weighing performance, repeatability, eccentricity, temperature, stability, aur creep.
- Paanch ho chuke hain. Bas ek baaki hai.

**3 · Live capture**
- Kaante ka digital indicator seedha app mein data bhejta hai. Inspector auto-capture dabata hai.
- Har test point par app weight load karta hai, reading stable hone ka intezaar karta hai, aur tabhi record karta hai. Error, legal limit aur verdict — sab turant calculate.
- Na haath se likhe number. Na calculator. Na galti ki gunjaaish — na kisi favour ki.

**4 · Finalise & seal**: [add the tamper beat's precursor only if PR #2 is merged]
- Chhe ke chhe tests complete. Inspector session finalise karta hai.
- Verdict engine khud readings se nikalta hai. Koi use badal nahi sakta.
- Ek signature, aur certificate par HMAC-SHA256 digital seal lag jaati hai — jo verdict aur har ek reading ko cover karti hai. Is pal ke baad, readings lock ho jaati hain.

**4 · The PDF**: [zoom tour of the re-recorded certificate with the Vercel QR/footer]
- Official certificate — seconds mein taiyaar.
- Hindi aur English dono mein. State Emblem. Har test aur uska result. Measurement uncertainty. Officer ka signature, stamp, QR code aur digital seal.
- Aur saath mein teen page ki technical data sheet — har ek reading, aur legal limits ke against error curve.

**5 · When a scale is wrong**
- Lekin agar kaanta galat ho, toh?
- Yahan hum ek mohalle ki kirana dukaan ke kaante mein kharab load cell simulate kar rahe hain. Load badhta hai, readings upar khisakti hain. Jaise hi error legal limit paar karta hai — woh laal ho jaata hai.
- Fail hone wale kaante ko milta hai Certificate of Rejection. Jab tak repair hokar dobara verify na ho, trade mein use nahi ho sakta.

**6 · Public verification**: [if PR #2 is merged, add the new NOT AUTHENTIC shot on the "tamper" line]
- Chaliye, wapas mandi.
- Gurpreet kaante ke verification sticker par QR code dekhta hai. Phone se scan karta hai. Na app, na login.
- Portal digital seal ko dobara compute karta hai, aur ek shabd mein jawab deta hai: VALID. Kaanta kiska hai, kis officer ne verify kiya, aur kab tak valid hai.
- Agar kaanta rejected hai, ya certificate ke saath chhed-chhaad hui hai — toh bhi use pata chal jaayega. Aur ek tap mein National Consumer Helpline, 1915.
- Pehli baar, kaante ke doosri taraf khada insaan bhi sach dekh sakta hai.

**7 · Built for trust**: [rail: append-only audit trail · Hindi + English · text-size options. No GIGW and no offline claim.]
- Har action — har reading, har edit, har seal — ek append-only audit trail mein jaata hai.
- Poora interface Hindi aur English mein hai, text-size ke options ke saath.

**8 · Scaling to the nation**: [dot field, photo tiles, hub diagram, architecture bars (Stateless REST API · PostgreSQL / Prisma · HMAC-SHA256 seals · deployed on Vercel), outcomes]
- Aaj yeh demo Punjab ke 11 districts cover karta hai. Lekin isme Punjab-specific kuch bhi nahi.
- Sochiye, har state ka Legal Metrology department ek hi platform par. Har mandi weighbridge. Har ration shop ka kaanta. Har milk collection centre. Har jeweller ka balance.
- Asli weighing indicators, seedha plug-in. Certificates jo DigiLocker tak ja sakein. Kaante ka stamping status, e-NAM mandiyon ke andar hi. Aur Bharat ke har district ke liye live compliance dashboard.
- Neev pehle se taiyaar hai — PostgreSQL par stateless API, cloud par deployed, aur aisi seal jise koi bhi, kahin bhi verify kar sake.
- Officers field mein, paperwork mein nahi. Nakli certificates bekaar. Aur har citizen seconds mein jaan sake ki saamne wala kaanta imaandaar hai ya nahi.

**Close**
- Gurpreet kabhi OIML R 76 nahi padhega. Use zaroorat bhi nahi.
- Use bas itna jaanna hai ki kaanta imaandaar hai.
- NAWI-ReportPro. Har kaanta verified. Har tol par bharosa.

### Keep from v1 (details that must not be lost)
- **Story beat:** Gurpreet's scale is the demo instrument "Bathinda Cotton Mandi Platform Scale" (`inst-ps-02`). It FAILED on 03 Dec 2025, PASSED on 27 Feb 2026, and is IN PROGRESS for 27 Sep 2026 (session `sess-034`, certificate NAWI-2026-000124). Rejection example: NAWI-2026-000120 (`sess-030`, Rajpura weighbridge, creep failure). Faulty-cell demo: "Kirana Store Counter Scale".
- **Design:**
  - Colours: navy `#0b1a33`, panels `#12264a`, text `#f3efe6`, saffron `#f59e0b`, PASS green `#2fb56a`, FAIL red `#e04848`.
  - Fonts: Montserrat 900 for statements, IBM Plex Mono 700 for measurements and labels.
  - Recurring amber LCD readout; chapter tags top-left; app window at left with the callout rail on the right; caption band at y ≈ 942–1062.
  - Every beat is anchored to a spoken word.
- **Build pipeline (v1 gotchas):**
  - One WAV per line; Parakeet word timestamps (`media-use/scripts/transcribe.mjs`), which also serve as a pronunciation check. For Hinglish, expect ASR mismatches; anchor beats to English keywords like "OIML", "VALID", "certificate", "1915" wherever possible.
  - GSAP is vendored in `assets/vendor/`.
  - Use root-relative asset paths; never tween `letterSpacing`.
  - Mark time-phased layers with `data-layout-allow-overlap` and ghost text with `data-layout-ignore`.
  - Put a still of the last frame under each recording.
  - `hyperframes check` must report 0 errors.
  - Render with `--video-frame-format png`.
- **Captions:** Roman-script Hinglish, sentence chunks of 12 words or fewer, 2 lines max. Montserrat has no Devanagari glyphs, so don't put Devanagari in captions without adding a Devanagari font via `@font-face`.
- **Audio:**
  - Keep the ambient bed (`assets/music/bed.mp3`) carved under the voice, and the SFX on key beats.
  - v1 automation: 0.55 in the cold open, about 0.26–0.32 under the voice, 0.5 on the end card.

### Deliverables and delivery
- MP4: 1920×1080, 30 fps, about 5 min, male Indian-accent Hinglish voice-over, captions.
- **Do not commit the MP4 to git.** Upload it to **YouTube as Unlisted** (I'll do the upload if you can't) and give me the file.
- Also remove the old 89 MB MP4 (`video/nawi-walkthrough/renders/nawi-reportpro-walkthrough.mp4`) from branch `claude/cool-fermat-1bb62z`, PR #1. Keep the source files. Add `renders/` to `.gitignore`.
- Show me snapshots at each scene's midpoint before the final render.

### Ask me before
- choosing the final voice (send samples);
- merging PR #2;
- any change to facts in the script.
