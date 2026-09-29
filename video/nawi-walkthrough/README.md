# NAWI-ReportPro — walkthrough film

A narrated, story-driven walkthrough of NAWI-ReportPro for the Smart India Hackathon judges (about 6 minutes, 1920×1080, male voice, burned-in captions).

**Final video:** [`renders/nawi-reportpro-walkthrough.mp4`](renders/nawi-reportpro-walkthrough.mp4)

## Story

The film follows one scale at the Bathinda cotton mandi, from the farmer's question to the national picture. The farmer, Gurpreet Singh, is a fictional character. The officers, instruments and certificates come from the app's demo dataset.

| # | Chapter | What the judges see |
|---|---|---|
| 0 | Cold open | The Bathinda mandi, and one number on the scale that decides a farmer's year |
| 1 | The problem | How a 1% load-cell drift costs 5 kg on a 500 kg load, and why paper-based verification leaves the farmer with no way to check |
| – | NAWI-ReportPro | The standard and the law it is built on; the flow from first reading to the citizen's phone |
| 2 | Inspector | The real dashboard, the registry (this scale failed in Dec 2025 and was repaired) and live OIML R 76 checks during registration |
| 3 | Re-verification | The six tests, then RS-232 auto-capture that waits for a stable reading and computes the error, MPE and verdict live |
| 4 | Seal + PDF | A verdict nobody can override, an HMAC-SHA256 seal, the bilingual certificate (explored region by region) and the 3-page data sheet |
| 5 | Rejection | A faulty load cell makes the readings turn red, and the scale gets a Certificate of Rejection |
| 6 | Public verification | Gurpreet scans the QR and sees VALID on his phone; a rejected record; the 1915 helpline |
| 7 | Built for trust | The audit trail, Hindi/English, GIGW accessibility and offline use in the field |
| 8 | Scaling to the nation | Every district; integrations labelled **BUILT** or **PROPOSED**; the architecture; the outcomes |
| – | Close | Gurpreet again, and the NAWI-ReportPro end card |

## How it was made

- **Screens are real.** `tools/capture.mjs` drives the running demo (`npm run demo`) with Playwright and records it through the Chrome DevTools screencast:
  - 1920×1080 for desktop screens;
  - a 390×844 @3× viewport for the phone screens.
  
  The certificate and data-sheet PDFs were downloaded from the API and rendered to PNG.
- **Voice.** The narration uses the local Kokoro TTS model with the `am_michael` voice (`script.json` holds what is spoken and the caption text). Parakeet word timestamps (`assets/voice/words/`) time the captions and every on-screen beat to the spoken word.
- **Composition.** The film is a [HyperFrames](https://hyperframes.heygen.com) project. `tools/build.mjs` generates `index.html` and the 16 scene sub-compositions in `compositions/` from the real voice timings.
- **Audio.** The music bed is a locally synthesised ambient pad. The sound effects come from the HyperFrames bundled library.

## Rebuild

```bash
# 1. (optional) re-record the app: start the demo, then
npm run demo                         # from the repo root, in another terminal
RAW=/tmp/raw OUT=assets/capture node tools/capture.mjs

# 2. regenerate the composition from script + voice timings
node tools/build.mjs

# 3. validate and render
npx hyperframes@0.8.91 check
npx hyperframes@0.8.91 render -o renders/nawi-reportpro-walkthrough.mp4 --video-frame-format png
```

Photographs and the State Emblem are the ones shipped with the app, from Wikimedia Commons.
