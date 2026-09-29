---
workflow: general-video
flow: automation
storyboard: no
message: "A scale nobody can check becomes a scale anyone can check — NAWI-ReportPro takes a weighing instrument from the officer's first reading to a sealed, QR-verifiable certificate."
audience: "Smart India Hackathon 2026 judges"
destination: "Presentation / YouTube-style playback"
aspect: "16:9 (1920x1080)"
language: "English narration, Indian-English voice (bilingual app shown)"
length: "as needed to cover the full journey (v2: ~5:45 at 1.3x pace)"
voice: "Indian-English male (Microsoft en-IN-PrabhatNeural via edge-tts, +30% rate)"
---

# NAWI-ReportPro — product walkthrough film

## Intent

User's words: "the full walkthrough of the application how it will be used from the problem to the solution
to pdf generation of the certificate to verification … its own showcase of the product of what problem exists
how it solves it and the scalability options of how the country would look like if this solutions becomes a
reality focus on the details too (like develop a story that judges can relate throughout the whole walkthrough)".
"take what is appropriate amount of time to include all that". "Male voice".

Story spine: Gurpreet Singh, a cotton farmer at the Bathinda mandi (illustrative character), and the question
"who checked that scale?" → paper-based verification today → NAWI-ReportPro → Inspector Vikramaditya Sharma
(demo officer) verifies Gurpreet's own mandi scale (demo instrument inst-ps-02, which really failed in Dec 2025 in
the demo history and was repaired) → sealed PDF certificate → a rejection on a faulty load cell → Gurpreet scans
the QR on the scale → national-scale vision → close on Gurpreet.

## Assets

- Real screen recordings of the running app (`npm run demo`), captured with Playwright + CDP screencast at
  1920x1080 (desktop) and 1170x2532 (phone): `assets/capture/c*.mp4`, stills `assets/capture/s-*.png`.
- Real generated PDFs rendered to PNG: `assets/capture/pdf-*.png`.
- Photos and government marks shipped with the app (`client/public/assets`, Wikimedia Commons).

## Customizations

- v2 voiceover: `en-IN-PrabhatNeural` at 1.3x, chosen by the user over Hinglish samples (Madhur, Kokoro hm_omega/hm_psi) so
  terms like "mandi" sound right while the narration stays in English.
- Captions and beats timed from the TTS engine's word timestamps.
- v2 factual fixes: verification is periodic (not "every year"); no offline-capture claim; no GIGW claim
  (text-size options only); "readings locked" / "tampered? he'll know" kept because PR #2 (seal over verdict +
  readings digest) is merged, and shown with a real NOT AUTHENTIC shot.
- Music: a locally synthesized ambient pad (deterministic, no licensing); bundled SFX library.
- Vision scenes label integrations honestly as BUILT vs PROPOSED. No map of India is drawn (avoids
  boundary-accuracy issues); districts are shown as an abstract dot field.

## Notes

- Inferred: 16:9, ~6 minutes, captions on, music bed on, automation without storyboard review.
