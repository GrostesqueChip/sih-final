<div align="center">

<img src="client/public/assets/gov/emblem-240.png" alt="State Emblem of India" height="96" />

# NAWI-ReportPro

**विधिक माप विज्ञान विभाग · Department of Legal Metrology**

Digital verification and certification of **non-automatic weighing instruments** under **OIML R 76-1:2006** and the **Legal Metrology Act, 2009**. It covers every step from the officer's field readings to a sealed, QR-verifiable certificate a citizen can check on their phone.

*Smart India Hackathon 2026*

**Live demo: [nawi-reportpro.vercel.app](https://nawi-reportpro.vercel.app)**

</div>

---

## Try it online

Open **[nawi-reportpro.vercel.app](https://nawi-reportpro.vercel.app)** and sign in with one of the accounts in the table below. The hosted demo runs on the in-memory demo database, so the pre-loaded instruments, certificates and audit trail are identical on every visit. Records you create yourself are kept only while the serverless instance stays warm and may disappear afterwards.

## Run it in one minute

```bash
npm install
npm run demo
```

Open **http://localhost:3000**. No database or configuration is needed: `npm run demo` starts the API on an in-memory database with a realistic demo dataset.

| Role (one-click on the login page) | E-mail | Password | Can do |
|---|---|---|---|
| **Inspector** — Shri Vikramaditya Sharma | `inspector@nawi.gov.in` | `Inspector@123` | Record tests, capture readings, seal certificates |
| **Controller (Admin)** — Shri Rajesh Kumar | `admin@nawi.gov.in` | `Admin@123` | Everything, plus officers, settings and demo reset |
| **Auditor (read-only)** — Smt. Ananya Sen | `viewer@nawi.gov.in` | `Viewer@123` | Review sessions, certificates and the audit trail |

The demo data covers 18 instruments across 11 districts, including:
- mandi weighbridges and an FCI foodgrain-depot platform scale
- a PDS ration-shop scale, a Verka milk-collection scale and an LPG cylinder scale
- a jeweller's balance and State Metrology Laboratory balances
- two **type evaluation test samples** (a counter scale and a precision balance) submitted for model approval

There are 38 sessions over 12 months — verification sessions and type evaluation sessions — 7 officers and more than 300 audit entries. Every verdict is computed by the same OIML engine the live API uses.

## A 3-minute walkthrough for judges

1. **Sign in as the Inspector.** The dashboard shows:
   - stamping compliance for the whole registry;
   - monthly approvals and rejections;
   - instruments that are due, expired or rejected;
   - a district-wise summary;
   - the verification fees collected.
2. **Verification Sessions → "Type evaluation sample — PW-30C counter scale"** (type evaluation, 5 of 6 modules done). Open **Creep** and press **Auto-capture remaining**:
   - The simulated RS-232 indicator loads each test point.
   - It waits for a stable reading and captures it.
   - The error, MPE and verdict are evaluated live.
3. **Complete module → Finalise & seal.** The dialog shows the verdict, which is computed automatically and cannot be overridden. Signing it:
   - issues an **OIML R 76 Type Evaluation Test Report** (structured after R 76-2, listing the R 76-2 tests it does not cover);
   - applies an HMAC-SHA256 seal;
   - opens the PDF preview.

   Verification sessions (initial, periodic, in-service) need only the weighing, repeatability and eccentricity tests and issue a Certificate of Verification — try "Bathinda Cotton Mandi Platform Scale" (2 of 3 modules done).
4. **See a rejection.** Start a verification on any instrument, switch the indicator to **Faulty load cell** and capture the Weighing test. The out-of-tolerance points turn red, and sealing issues a **Certificate of Rejection**.
5. **Public verification.** Open `/verify` (no login) and pick a sample certificate. The portal re-computes the seal and shows **VALID** or **REJECTED**, together with the owner, location, officer and error curve. It works on a phone.
6. **Switch to हिंदी** in the top strip. The whole interface is bilingual.

## What it does

| Area | Highlights |
|---|---|
| **Instrument registry** | Registration with live checks against OIML R 76 Table 3 (n = Max/e, Min ≥ k·e, d ≤ e) and an MPE preview. Each instrument's stamping status is derived from the statutory 12-month validity: *Valid · Due · Expired · Rejected · Not verified*. |
| **Two report types** | **Verification** (initial / periodic / in-service): weighing (A.4.4), repeatability (A.4.10), eccentricity (A.4.7) → Certificate of Verification or Rejection. **Type evaluation** (model approval): the same three plus static temperatures & no-load temperature effect (A.5.3; 1e per 1 °C for class I, per 5 °C otherwise), warm-up time (A.5.2; \|EL − E0\| ≤ MPE) and zero return & creep (A.4.11; 0.5e / 0.2e) → Type Evaluation Test Report. Stepped MPE per OIML R 76-1 Table 6, with 2 × MPE for in-service inspection (derived on the server from the session type). |
| **Indicator capture** | A live RS-232 stream (Mettler-Toledo SICS, Avery Weigh-Tronix or Essae protocols) with stability detection, zero and tare, guided per-cell capture and auto-capture. Readings are never recorded unless the indicator has settled on the test load. A **Web Serial** option connects a real USB indicator. |
| **Integrity** | Partial saves never count as complete. A session can be sealed only when every module required for its type is done, and a sealed session is read-only. The seal covers the readings, the verdict and the instrument particulars (class, serial, Min, d, report type, test conditions); those particulars are locked once a certificate or report has been issued. Only the owning officer or the Controller can record readings. Every action goes into an append-only audit trail. |
| **Certificates & reports** | A one-page bilingual Certificate of Verification or Rejection (verification tests only), or a one-page OIML R 76 Type Evaluation Test Report for model approval. A Technical Data Sheet includes every reading, the ISO GUM uncertainty budget and the error-envelope chart. |
| **Public portal** | `/verify/:certificateNo` recomputes the seal in constant time, and shows the validity dates and a National Consumer Helpline (1915) link. |
| **GIGW 3.0** | Government of India utility strip, skip link, text size (A- / A / A+), high contrast, Hindi interface, Indian date and number formats, and a responsive layout. |
| **Field use** | Offline queue (IndexedDB) with an idempotent batch-sync endpoint, a service worker for the app shell in production builds, and CSV import of weighbridge readings. |

## SIH26035 expected solution — where it is

| Asked for in the problem statement | Where it is |
|---|---|
| Capture instrument specifications | Instrument registry (`/instruments`), live Table 3 checks |
| Record laboratory conditions | Session step 3: temperature, humidity, pressure, standards used — printed and sealed on every report |
| Data-entry forms for OIML R 76 tests | `/tests/:id/:module` — one form per test, with indicator capture or manual/CSV entry |
| Automatic permissible-error calculation and pass/fail | `mpeCalculator.js` (R 76-1 Table 6), evaluated live in the form and re-computed on the server |
| Standardised test report | Type Evaluation Test Report (R 76-2 structure) + Technical Data Sheet; Certificate of Verification for verification sessions |
| Report export: PDF / Word | PDF implemented. Editable Word (DOCX) export: **not yet implemented** |
| Instrument-wise test history, repository, search | Instrument detail → history tab; Certificates & Reports hub with search |
| Dashboard | `/dashboard` |
| Role-based access | Controller / Inspector / Auditor, enforced on every write route |
| Future OIML R 76 revisions | Limits are centralised in the engine; moving them to versioned rule tables is planned |
| R 76-2 tests not yet covered | Listed on every type evaluation report: zero-setting, tare, discrimination, sensitivity, stability of equilibrium, tilting, voltage variations, damp heat, disturbances, span stability, endurance, examination checklist |

## Screenshots

| | |
|---|---|
| ![Login](docs/screenshots/01-login.jpg) | ![Dashboard](docs/screenshots/02-dashboard.jpg) |
| ![Instrument registry](docs/screenshots/03-instrument-registry.jpg) | ![Live capture](docs/screenshots/04-live-capture.jpg) |
| ![Session](docs/screenshots/05-session.jpg) | ![Certificate](docs/screenshots/06-certificate.jpg) |
| ![Public verification](docs/screenshots/07-public-verification.jpg) | ![Hindi interface](docs/screenshots/08-hindi.jpg) |

## Architecture

```
client/   React 18 · Vite · Tailwind · TanStack Query · Recharts · pdf.js · i18next (EN/HI)
server/   Node.js · Express · Prisma (PostgreSQL) with an in-memory fallback · PDFKit · QR · HMAC-SHA256
tests/    Vitest + Supertest — 225 tests in five tiers (features, boundaries, combinations, scenarios, adversarial)
```

- `server/src/services/mpeCalculator.js` is the OIML R 76 engine: stepped MPE, multi-interval ranges, tare, and the six implemented test modules.
- `server/src/lib/sessionTypes.js` decides which modules each session type requires and whether in-service limits apply.
- `server/src/services/pdfTypeEvaluationReport.js` generates the Type Evaluation Test Report.
- `server/src/services/uncertaintyCalculator.js` produces the GUM / EURAMET cg-18 expanded uncertainty.
- `server/src/services/pdfCertificate.js` and `pdfDataSheet.js` generate the official PDFs, including the Devanagari fonts.
- `client/src/components/telemetry/browserSimulator.js` simulates the RS-232 indicator in the officer's browser, with a healthy or a faulty load cell. `server/src/services/telemetrySimulator.js` offers the same indicator as an SSE stream for API clients; a parity test keeps the two identical.
- `server/src/lib/demoSeed.js` holds the deterministic demo dataset, which is shared by the in-memory database and `prisma db seed`.

### Using PostgreSQL instead of the demo database

```bash
cp .env.example .env        # set DATABASE_URL, JWT_SECRET, HMAC_SECRET
npm run setup:postgres      # migrate + seed the same demo data
npm run dev
```

### Deploying to Vercel

The repository deploys to [Vercel](https://vercel.com) as it is. `vercel.json` builds the React client to `client/dist` and rewrites every `/api/*` request to `api/index.js`, which wraps the Express app as a single serverless function (with the PDF fonts and images from `server/assets` bundled in). Any other path falls back to `index.html`, so client-side routes work on refresh.

1. Import the GitHub repository in Vercel. The build settings come from `vercel.json`, so keep the defaults.
2. Add these environment variables for **Production**:

   | Variable | Value |
   |---|---|
   | `JWT_SECRET` | a long random string (the API refuses to start in production without it) |
   | `HMAC_SECRET` | a different long random string, used for the certificate seal |
   | `PUBLIC_VERIFY_URL` | optional: the URL printed in certificate QR codes. On Vercel it defaults to the project's production domain |

   Generate a secret with `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`.
3. Deploy. Every later push to `main` redeploys production automatically, and other branches get a preview URL.

Notes:
- `api/index.js` forces `NAWI_DB_MODE=memory`, so no database is needed. For persistent storage, remove that line and set `DATABASE_URL` to a hosted PostgreSQL instance (for example Neon); run `npx prisma migrate deploy` and `node prisma/seed.js --if-empty` in `server/` once. In production the API then refuses to fall back to demo data if the database is unreachable.
- Serverless functions are time-limited (30 s here), so long-lived connections such as the live telemetry stream (SSE) may be cut off on Vercel. They run without that limit with `npm run demo` locally.

### Tests

```bash
npm test
```

## Credits

- The State Emblem of India, the Ashoka Chakra, the National Flag and the photographs are from Wikimedia Commons. The photographs show:
  - the grain market at Bhawanigarh (Sangrur);
  - the Legal Metrology Bhavan, Kottayam;
  - a CWC/FCI foodgrain depot;
  - Indian weighbridges and scales.
- Standards referenced: OIML R 76-1:2006, the Legal Metrology Act 2009, and the Legal Metrology (General) Rules 2011.
