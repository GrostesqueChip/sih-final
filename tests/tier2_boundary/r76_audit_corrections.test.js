import { describe, it, expect } from 'vitest';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import app from '../../server/src/index';
import {
  calculateTemperatureEffect,
  calculateStability,
  calculateTimeDependence,
  calculateWeighingPerformance,
} from '../../server/src/services/mpeCalculator';
import { requiredTestTypesFor, isInServiceSession } from '../../server/src/lib/sessionTypes';
import { buildSealInput, generateVerificationSeal } from '../../server/src/services/cryptoSeal';
import { generateCertificate } from '../../server/src/services/pdfCertificate';
import * as teReport from '../../server/src/services/pdfTypeEvaluationReport';
import { buildDemoData } from '../../server/src/lib/demoSeed';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

/**
 * Regression tests for the OIML R 76 corrections (limits quoted from the
 * OIML R 76-2:2007 test report forms).
 */
const jwtSecret = process.env.JWT_SECRET || 'nawi-reportpro-jwt-test-secret-2026';
const inspectorToken = jwt.sign(
  { id: 'usr-officer-01', email: 'inspector@nawi.gov.in', name: 'Shri Vikramaditya Sharma', role: 'INSPECTOR', isActive: true },
  jwtSecret,
  { expiresIn: '1h' }
);
const auth = (r) => r.set('Authorization', `Bearer ${inspectorToken}`);

const classI = SAMPLE_INSTRUMENTS.MICRO_BALANCE_CLASS_I; // e = 0.001 g
const classIII = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III; // e = 20 kg

describe('R 76 corrections — temperature effect on no-load indication (A.5.3.2)', () => {
  it('class I: limit is 1e per 1 °C (a 2e change over 5 °C passes)', () => {
    const r = calculateTemperatureEffect({
      temperaturePoints: [
        { temperature: 20, zeroIndication: 0, spanLoad: 220, spanIndication: 220 },
        { temperature: 25, zeroIndication: 0.002, spanLoad: 220, spanIndication: 220.002 },
      ],
    }, classI);
    expect(r.zeroBasisC).toBe(1);
    expect(r.zeroDriftEvaluations[0].driftPassed).toBe(true); // 0.4e per 1 °C
  });

  it('class I: 1.5e change over 1 °C fails', () => {
    const r = calculateTemperatureEffect({
      temperaturePoints: [
        { temperature: 20, zeroIndication: 0, spanLoad: 220, spanIndication: 220 },
        { temperature: 21, zeroIndication: 0.0015, spanLoad: 220, spanIndication: 220.0015 },
      ],
    }, classI);
    expect(r.zeroDriftEvaluations[0].driftPassed).toBe(false);
  });

  it('class III: limit stays 1e per 5 °C', () => {
    const r = calculateTemperatureEffect({
      temperaturePoints: [
        { temperature: 20, zeroIndication: 0, spanLoad: 60000, spanIndication: 60000 },
        { temperature: 25, zeroIndication: 40, spanLoad: 60000, spanIndication: 60040 },
      ],
    }, classIII);
    expect(r.zeroBasisC).toBe(5);
    expect(r.zeroDriftEvaluations[0].driftPassed).toBe(false); // 2e per 5 °C
  });
});

describe('R 76 corrections — creep and zero return (A.4.11)', () => {
  const readings = (d15, d30) => [
    { minute: 0, indication: 60000 },
    { minute: 15, indication: 60000 + d15 },
    { minute: 30, indication: 60000 + d30 },
  ];

  it('limits are 0.5e (0–30 min) and 0.2e (15–30 min), not fractions of MPE', () => {
    const r = calculateTimeDependence({ testLoad: 60000, creepReadings: readings(0, 0), zeroReturn: { indicationAfterUnload: 0 } }, classIII);
    expect(r.creepAnalysis.allowedDelta30).toBe(10); // 0.5 × 20 kg
    expect(r.creepAnalysis.allowedDelta15to30).toBe(4); // 0.2 × 20 kg
    expect(r.zeroReturnAnalysis.allowedZeroReturn).toBe(10);
  });

  it('a change of 0.3e between 15 and 30 min fails (it passed under the old 0.2 × MPE rule)', () => {
    const r = calculateTimeDependence({ testLoad: 60000, creepReadings: readings(0, 6), zeroReturn: { indicationAfterUnload: 0 } }, classIII);
    expect(r.creepAnalysis.creep15Passed).toBe(false);
    expect(r.overallPass).toBe(false);
  });

  it('condition b): a 4-hour reading within |mpe| rescues a failed condition a)', () => {
    const r = calculateTimeDependence({
      testLoad: 60000,
      creepReadings: [...readings(0, 6), { minute: 240, indication: 60020 }],
      zeroReturn: { indicationAfterUnload: 0 },
    }, classIII);
    expect(r.creepAnalysis.conditionA).toBe(false);
    expect(r.creepAnalysis.conditionB).toBe(true);
    expect(r.overallPass).toBe(true);
  });
});

describe('R 76 corrections — warm-up time (A.5.2)', () => {
  it('passes when |EL − E0| <= MPE at every time point, using the recorded zero', () => {
    const r = calculateStability({
      timePoints: [0, 5, 15, 30].map((m) => ({ timestampMinutes: m, zeroReading: 20, loadReading: 60040, appliedLoad: 60000 })),
    }, classIII);
    // EL = +40, E0 = +20 → EL − E0 = 20 <= 30 (1.5e at 3000e)
    expect(r.maxCorrectedLoadError).toBe(20);
    expect(r.overallPass).toBe(true);
  });

  it('fails when |EL − E0| exceeds MPE at any time point', () => {
    const r = calculateStability({
      timePoints: [
        { timestampMinutes: 0, zeroReading: 0, loadReading: 60000, appliedLoad: 60000 },
        { timestampMinutes: 30, zeroReading: -20, loadReading: 60020, appliedLoad: 60000 },
      ],
    }, classIII);
    expect(r.overallPass).toBe(false);
  });
});

describe('R 76 corrections — hysteresis is informational only', () => {
  it('+1e rising and −1e falling at 3000e (MPE 1.5e) is a PASS', () => {
    const r = calculateWeighingPerformance({
      points: [
        { appliedLoad: 0, indicatedValue: 0, isIncreasing: true },
        { appliedLoad: 60000, indicatedValue: 60020, isIncreasing: true },
        { appliedLoad: 60000, indicatedValue: 59980, isIncreasing: false },
      ],
    }, classIII);
    expect(r.hysteresisAnalysis.overallPass).toBe(false); // 40 kg > 30 kg, reported
    expect(r.hysteresisAnalysis.informationalOnly).toBe(true);
    expect(r.overallPass).toBe(true); // not a pass/fail criterion
  });
});

describe('Session types — verification vs type evaluation', () => {
  it('verification sessions need only the three verification tests', () => {
    expect(requiredTestTypesFor('PERIODIC')).toEqual(['WEIGHING_PERFORMANCE', 'REPEATABILITY', 'ECCENTRICITY']);
    expect(requiredTestTypesFor('TYPE_EVALUATION')).toHaveLength(6);
    expect(isInServiceSession('INSPECTION')).toBe(true);
    expect(isInServiceSession('PERIODIC')).toBe(false);
  });

  it('rejects a type-evaluation module on a verification session', async () => {
    const open = buildDemoData().testSessions.find(
      (x) => x.status === 'IN_PROGRESS' && x.verificationType === 'PERIODIC' && x.conductedById === 'usr-officer-01'
    );
    const res = await auth(request(app).post(`/api/tests/${open.id}/results`)).send({
      testType: 'TEMPERATURE',
      data: { temperaturePoints: [{ temperature: 20, zeroIndication: 0 }] },
    });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/type-evaluation test/i);
  });

  it('opens a type evaluation session with its own TER register', async () => {
    const res = await auth(request(app).post('/api/tests')).send({ instrumentId: 'inst-te-01', verificationType: 'TYPE_EVALUATION' });
    expect(res.status).toBe(201);
    expect(res.body.data.certificateNo).toMatch(/^TER-\d{4}-\d{6}$/);
  });

  it('ignores a client-supplied isInService flag on a periodic session', async () => {
    const open = await auth(request(app).post('/api/tests')).send({ instrumentId: 'inst-wb-01', verificationType: 'PERIODIC' });
    const id = open.body.data.id;
    // Error of 2e at Max: fails 1× MPE (1.5e) but would pass 2× MPE (3e).
    const res = await auth(request(app).post(`/api/tests/${id}/results`)).send({
      testType: 'WEIGHING_PERFORMANCE',
      isInService: true,
      data: { points: [
        { appliedLoad: 0, indicatedValue: 0, isIncreasing: true },
        { appliedLoad: 60000, indicatedValue: 60040, isIncreasing: true },
        { appliedLoad: 60000, indicatedValue: 60040, isIncreasing: false },
      ] },
    });
    expect(res.status).toBe(201);
    expect(res.body.data.result).toBe('FAIL');
  });
});

describe('Seal covers instrument particulars', () => {
  it('changing the accuracy class after sealing changes the seal', () => {
    const d = buildDemoData();
    const s = d.testSessions.find((x) => x.status === 'COMPLETED');
    const inst = d.instruments.find((i) => i.id === s.instrumentId);
    const results = d.testResults.filter((r) => r.testSessionId === s.id);
    const a = generateVerificationSeal(buildSealInput({ ...s, instrument: inst, testResults: results }));
    const b = generateVerificationSeal(buildSealInput({ ...s, instrument: { ...inst, accuracyClass: 'CLASS_IIII' }, testResults: results }));
    expect(a).not.toBe(b);
  });

  it('locks sealed particulars on an instrument that has issued certificates', async () => {
    const res = await auth(request(app).put('/api/instruments/inst-wb-01')).send({ accuracyClass: 'CLASS_IIII' });
    expect(res.status).toBe(409);
    expect(res.body.lockedFields).toContain('accuracyClass');
  });
});

describe('Type evaluation test report PDF', () => {
  it('lists the R 76-2 tests it does not cover', () => {
    const clauses = teReport.NOT_COVERED.map((x) => x[1]);
    expect(clauses).toEqual(expect.arrayContaining(['A.4.8', 'B.4', 'A.5.1', 'B.3']));
  });

  it('renders an R 76 type evaluation report (not a verification certificate)', async () => {
    const d = buildDemoData();
    const s = d.testSessions.find((x) => x.verificationType === 'TYPE_EVALUATION' && x.status === 'COMPLETED');
    const pdf = await generateCertificate({
      ...s,
      verificationSeal: 'a'.repeat(64),
      instrument: d.instruments.find((i) => i.id === s.instrumentId),
      testResults: d.testResults.filter((r) => r.testSessionId === s.id),
      conductedBy: d.users.find((u) => u.id === s.conductedById),
    });
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
  });
});
