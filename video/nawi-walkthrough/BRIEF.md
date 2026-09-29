---
workflow: general-video
flow: automation
storyboard: no
message: "A scale nobody can check becomes a scale anyone can check — NAWI-ReportPro takes a weighing instrument from the officer's first reading to a sealed, QR-verifiable certificate."
audience: "Smart India Hackathon 2026 judges"
destination: "Presentation / YouTube-style playback"
aspect: "16:9 (1920x1080)"
language: "English narration (bilingual app shown)"
length: "as needed to cover the full journey (~6 min)"
voice: "male (Kokoro am_michael, local)"
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

- Voiceover: local Kokoro `am_michael` (HeyGen not signed in; Higgsfield had 0 credits).
- Captions from Parakeet word timestamps.
- Music: a locally synthesized ambient pad (deterministic, no licensing); bundled SFX library.
- Vision scenes label integrations honestly as BUILT vs PROPOSED. No map of India is drawn (avoids
  boundary-accuracy issues); districts are shown as an abstract dot field.

## Notes

- Inferred: 16:9, ~6 minutes, captions on, music bed on, automation without storyboard review.
