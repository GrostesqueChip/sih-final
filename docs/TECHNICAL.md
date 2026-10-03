# NAWI-ReportPro: technical documentation

Software architecture, calculation methodology and deployment framework, as asked for by problem statement SIH26035. It describes the code in this repository as it is; anything not yet built is listed under [Scope and limits](#7-scope-and-limits).

## 1. What the system does

An evaluator registers a test sample, records the laboratory conditions, enters or captures the readings of each OIML R 76 test, and the system computes the errors, compares them with the limits and issues a sealed test report. Two kinds of session exist:

| Session type | Tests required | Document issued |
|---|---|---|
| Type evaluation (model approval) | Weighing, repeatability, eccentricity, temperature, warm-up time, zero return and creep | OIML R 76 Type Evaluation Test Report (PDF, plus an editable Word copy) |
| Verification: initial, periodic, in-service inspection | Weighing, repeatability, eccentricity | Certificate of Verification or Rejection (PDF) |

`server/src/lib/sessionTypes.js` holds these rules. Whether in-service limits apply is decided there from the session type on the server and is never taken from the client.

## 2. Architecture

```
Indicator ── USB / RS-232 ──► Browser (React 18, Vite, PWA, i18next: English + Hindi)
                                   │  HTTPS, JSON, JWT
                                   ▼
                         API (Node.js, Express)
        ┌──────────────┬───────────┴───────────┬───────────────┬──────────────┐
   rule sets      calculation engine      report generators   seal        attachments
 (lib/ruleSets)  (services/mpeCalculator)  (PDFKit, docx)  (HMAC-SHA256)  (routes/attachments)
                                   │
                                   ▼
                    PostgreSQL through Prisma  (in-memory copy for the demo)
```

| Layer | Where | Notes |
|---|---|---|
| Capture | `client/src/components/telemetry/` | Web Serial in Chrome / Edge; a built-in indicator simulator; manual entry and CSV import as fallback |
| Indicator formats | `client/src/utils/indicatorProtocols.js` | Eight output formats parsed and identified from the data stream; serial settings selectable |
| Interface | `client/src/pages/` | Registry, sessions, test forms, reports hub, dashboard, audit trail, public verification page |
| API | `server/src/routes/` | Authentication, instruments, tests, attachments, reports, dashboard, audit, batch import, offline sync |
| Rules | `server/src/lib/ruleSets.js` | Every limit the engine applies, as a named edition |
| Engine | `server/src/services/mpeCalculator.js` | MPE and the six test evaluations |
| Uncertainty | `server/src/services/uncertaintyCalculator.js` | Expanded uncertainty for the data sheet |
| Reports | `server/src/services/pdf*.js`, `docxTypeEvaluationReport.js` | Bilingual PDFs; editable Word copy of the type evaluation report |
| Integrity | `server/src/services/cryptoSeal.js`, `middleware/auditLog.js` | Seal over the record; append-only audit log |
| Data | `server/prisma/schema.prisma`, `server/src/lib/mockDb.js` | User, Instrument, TestSession, TestResult, SessionAttachment, AuditLog |

Roles: **Controller** (administrator), **Inspector** (records tests; only in sessions they opened), **Auditor** (read-only). Permission and ownership are checked on every write route.

## 3. Calculation methodology

All limits are expressed in the verification scale interval *e* and come from the active rule set (section 4). Clause numbers refer to OIML R 76-1:2006.

### 3.1 Maximum permissible error (Table 6)

For a load *L*, the load in intervals is *n = L / e*. The MPE on initial verification is:

| Accuracy class | ±0.5 e up to | ±1 e up to | ±1.5 e up to |
|---|---|---|---|
| I | 50 000 e | 200 000 e | above |
| II | 5 000 e | 20 000 e | 100 000 e |
| III | 500 e | 2 000 e | 10 000 e |
| IIII | 50 e | 200 e | 1 000 e |

Boundaries are inclusive on the lower step: at exactly 500 e, class III has ±0.5 e. For in-service inspection the MPE is twice the value above (3.5.2). Multi-interval and multiple-range instruments use the *e* of the partial range the load falls in (3.4); `calculateMultiIntervalMPE` selects it. Tare is handled by `getTareAdjustedMPE` (3.5.3).

### 3.2 Error of indication

Where the change-point method is used (additional load ΔL applied until the indication changes), the indication before rounding and the error are

```
P = I + ½e − ΔL          E = P − L          Ec = E − E0
```

with *I* the indication, *L* the applied load and *E0* the error at zero. Without ΔL the error is *E = I − L*. `calculateIndicationAndError` implements this.

### 3.3 Tests

| Test | Clause | Evaluated as | Pass when |
|---|---|---|---|
| Weighing (increasing and decreasing loads) | A.4.4 | Ec at each load, both directions | every \|Ec\| ≤ MPE at that load |
| Repeatability | A.4.10 | spread (max − min) of each series | spread ≤ MPE at that load |
| Eccentricity | A.4.7 | error at the centre and each off-centre position | every error ≤ MPE at that load |
| Static temperatures and effect on no-load indication | A.5.3 | span error at each temperature; zero change between adjacent temperatures | span errors ≤ MPE, and zero change ≤ 1 e per 1 °C (class I) or per 5 °C (other classes) |
| Warm-up time | A.5.2 | zero and load indications at 0, 5, 15 and 30 minutes after switch-on | corrected load error ≤ MPE throughout |
| Zero return and creep | A.4.11 | indication at 0, 15 and 30 minutes under load; zero after unloading | \|I30 − I0\| ≤ 0.5 e and \|I30 − I15\| ≤ 0.2 e; zero return ≤ 0.5 e |

Hysteresis is reported for information; it is not a pass/fail criterion in R 76. A session passes only if every required test passes. The verdict is computed, stored and recomputed on the server; it cannot be typed in.

### 3.4 Validation of input

- Instrument registration checks *n = Max / e*, *Min ≥ k·e* and *d ≤ e* against R 76-1 Table 3.
- Readings must be numeric; a module saved as "in progress" never counts towards completion.
- A session can be sealed only when every test required for its type is complete.
- Results synchronised from an offline device are re-evaluated on the server before they are stored.

### 3.5 Measurement uncertainty

`uncertaintyCalculator.js` follows JCGM 100:2008 (GUM) and EURAMET cg-18: a type A component from the repeatability series, and type B components for the scale interval, the reference weights, temperature and eccentric loading, combined and expanded with *k* = 2. It is printed on the data sheet for laboratory use and takes no part in the pass/fail decision.

## 4. Rule sets: handling a revision of OIML R 76

The engine contains no limit of its own. `server/src/lib/ruleSets.js` holds each edition as data:

```
id, title, edition, effectiveFrom, source
mpeTable        Table 6 steps per accuracy class
minCapacityInE  Table 3 minimum capacity per class
inServiceFactor 2
limits          creep30MinE, creep15To30MinE, zeroReturnE, zeroDriftE, zeroDriftBasisC
```

- The edition shipped is `OIML-R76-2006` (R 76-1:2006 / R 76-2:2007).
- A revision is added with `registerRuleSet(...)`. It is validated first (steps contiguous from zero, positive limits, all four classes present); a malformed edition is rejected.
- `OIML_RULE_SET=<id>` (or `setActiveRuleSet`) selects the edition in force. Adding an edition changes nothing until it is selected.
- Every evaluated result stores the edition id it was judged against (`calculations.ruleSet`), and the report prints it, so an earlier report stays reproducible after a revision.
- `GET /api/rules` lists the editions and the active one.

Limit of this mechanism: it covers changes to limits and steps. A revision that adds a new test procedure still needs a new test module.

## 5. Reports, seal and attachments

- **Type Evaluation Test Report** (`pdfTypeEvaluationReport.js`): structured after the R 76-2 report format: general information on the type, test equipment and conditions, summary with clause references, the R 76-2 tests not covered, conclusion, signatures. It states that it is not a certificate of approval.
- **Word copy** (`docxTypeEvaluationReport.js`): the same content as editable tables. Its first line says the sealed PDF is the official record.
- **Technical data sheet** (`pdfDataSheet.js`): every reading, error and limit, with the uncertainty budget.
- **Seal** (`cryptoSeal.js`): HMAC-SHA256 over the report number, instrument identity and particulars, officer id, date, verdict and a digest of every reading of the required tests. The public page `/verify/:reportNo` recomputes it and answers VALID, REJECTED or NOT AUTHENTIC. An HMAC is a shared-key integrity check: it shows that a record was not altered, but it is not a digital signature under the Information Technology Act. eSign is the planned route for signatures.
- **Attachments** (`routes/attachments.routes.js`): photographs (JPEG, PNG, WebP) and PDF documents, up to 5 MB each and 10 per session. The type is decided from the file's content. Each file's SHA-256 is stored and listed in the report annex. Attachments can be added or removed only while the session is open.
- **Audit trail**: every create, change, seal, export and attachment action is logged with the user and time; the log has no update or delete route.

## 6. Deployment framework

| | Demonstration (today) | Proposed production |
|---|---|---|
| Web client | Static build on Vercel | Static build behind the department's web server |
| API | One serverless function | Node.js service on two or more servers behind a load balancer |
| Database | In-memory copy of the demo data | PostgreSQL, primary and standby, daily backups, restore tested |
| Hosting | Vercel | State Data Centre for a state roll-out; NIC MeghRaj cloud nationally |
| Secrets | Environment variables | `JWT_SECRET`, `HMAC_SECRET` in the host's secret store; rotation procedure |
| Login | Local accounts | Parichay single sign-on for officers |
| Before go-live | | Security audit by a CERT-In empanelled auditor; GIGW 3.0 accessibility assessment |

Run locally:

```bash
npm install
npm run demo          # in-memory database, http://localhost:3000
npm test              # full test suite
```

With PostgreSQL: set `DATABASE_URL`, `JWT_SECRET`, `HMAC_SECRET` in `.env`, then `npm run setup:postgres` and `npm run dev`. Database changes are Prisma migrations in `server/prisma/migrations/`.

Environment variables: `DATABASE_URL`, `JWT_SECRET`, `HMAC_SECRET`, `PUBLIC_VERIFY_URL` (printed in QR codes), `OIML_RULE_SET` (edition in force), `NAWI_DB_MODE=memory` (force the demo database), `NAWI_API_PORT`.

## 7. Scope and limits

- Six R 76 test modules are implemented. The other R 76-2 forms (zero-setting, tare, discrimination, sensitivity, stability of equilibrium, tilting, voltage variations, damp heat, disturbances, span stability, endurance, examination checklist) are listed as "not tested" on every report.
- USB capture has been verified with the built-in simulator and a USB serial emulator (`tools/scale-emulator/`), not with physical indicators.
- The hosted demonstration keeps data, including attachments, only while its server instance is running.
- No laboratory pilot has taken place; no time or error saving has been measured.
- Reports carry an HMAC seal, not a digital signature.

## 8. Tests

`npm test` runs the suite in `tests/`: features, boundaries (every Table 6 step, the R 76 limits, rule-set switching), combinations, real-world scenarios and adversarial cases (permissions, tampering, malformed input, disguised uploads).
