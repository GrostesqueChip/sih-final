# NAWI-ReportPro — walkthrough film

A narrated, story-driven walkthrough of NAWI-ReportPro for the Smart India Hackathon judges (about 5¾ minutes, 1920×1080, Indian-English male voice at 1.3× pace, burned-in captions).

The rendered MP4 is not kept in git (`renders/` is ignored). It is shared separately (YouTube, unlisted).

## Story

The film follows one scale at the Bathinda cotton mandi, from the farmer's question to the national picture. The farmer, Gurpreet Singh, is a fictional character. The officers, instruments and certificates come from the app's demo dataset.

| # | Chapter | What the judges see |
|---|---|---|
| 0 | Cold open | The Bathinda mandi, and one number on the scale that decides a farmer's year |
| 1 | The problem | How a 1% load-cell drift costs 5 kg on a 500 kg load, and why paper-based periodic verification leaves the farmer with no way to check |
| – | NAWI-ReportPro | The standard and the law it is built on; the flow from first reading to the citizen's phone |
| 2 | Inspector | The real dashboard, the registry (this scale failed in Dec 2025 and was repaired) and live OIML R 76 checks during registration |
| 3 | Re-verification | The six tests, then RS-232 auto-capture that waits for a stable reading and computes the error, MPE and verdict live |
| 4 | Seal + PDF | A verdict nobody can override, an HMAC-SHA256 seal over the verdict and every reading, the bilingual certificate (explored region by region) and the 3-page data sheet |
| 5 | Rejection | A faulty load cell makes the readings turn red, and the scale gets a Certificate of Rejection |
| 6 | Public verification | Gurpreet scans the QR and sees VALID on his phone; a rejected record; one reading edited in the database turns the same certificate NOT AUTHENTIC; the 1915 helpline |
| 7 | Built for trust | The audit trail, Hindi/English and text-size options |
| 8 | Scaling to the nation | Every district; integrations labelled **BUILT** or **PROPOSED**; the architecture (stateless API, PostgreSQL, Vercel, HMAC seals); the outcomes |
| – | Close | Gurpreet again, and the NAWI-ReportPro end card |

## How it was made

- **Screens are real.** They were recorded from `main` after PR #2 (sealed readings, MPE precision), with certificate QR codes and footers pointing to https://nawi-reportpro.vercel.app.
  - `tools/demo-harness.cjs` boots the unchanged demo server (`server/demo.js`) with `PUBLIC_VERIFY_URL` set. It also opens a side port that edits one sealed reading directly in the demo database, for the tampered-certificate shot.
  - `tools/capture.mjs` drives the app with Playwright and records it through the Chrome DevTools screencast. Desktop screens are 1440×810 at DPR 4/3 (1920×1080 frames); phone screens are 390×844 @3×. It also downloads the certificate and data-sheet PDFs.
  - `tools/pdf2png.py` renders the PDFs to PNG (220 dpi) and extracts the certificate's QR code.
- **Voice.** The narration is Microsoft's `en-IN-PrabhatNeural` voice (via `edge-tts`) at +30% rate. `tools/voice.py` writes one WAV per line plus the engine's own word timestamps (`assets/voice/words/`), which time the captions and every on-screen beat to the spoken word. `script.json` holds what is spoken (`say`) and the caption text (`cap`).
- **Composition.** The film is a [HyperFrames](https://hyperframes.heygen.com) project. `tools/build.mjs` generates `index.html` and the 16 scene sub-compositions in `compositions/` from the real voice timings. Recordings are sped up where needed so each fits its scene.
- **Audio.** The music bed is a locally synthesised ambient pad. The sound effects come from the HyperFrames bundled library.

## Rebuild

```bash
# 1. (optional) re-record the app from a checkout of main
node tools/demo-harness.cjs                                # REPO=<repo root> if not run in place
npm run dev --workspace=client                             # from the repo root, in another terminal
RAW=/tmp/raw OUT=assets/capture node tools/capture.mjs
python tools/pdf2png.py /tmp/raw

# 2. (optional) regenerate the narration
python tools/voice.py

# 3. regenerate the composition from script + voice timings
node tools/build.mjs

# 4. validate and render
npx hyperframes@0.8.91 check
npx hyperframes@0.8.91 render -o renders/nawi-reportpro-walkthrough-v2.mp4 --video-frame-format png
```

Photographs and the State Emblem are the ones shipped with the app, from Wikimedia Commons.
