import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import app from '../../server/src/index';
import {
  DEFAULT_RULE_SET_ID,
  registerRuleSet,
  validateRuleSet,
  getRuleSet,
  getActiveRuleSet,
  setActiveRuleSet,
  listRuleSets,
} from '../../server/src/lib/ruleSets';
import { getMPE, calculateTimeDependence, calculateTemperatureEffect, evaluateTestResult, MPE_TABLE } from '../../server/src/services/mpeCalculator';
import { SAMPLE_INSTRUMENTS } from '../helpers/testUtils';

/**
 * Versioned rule sets: the engine takes every limit from a named edition, so a
 * revision of OIML R 76 is added as data, not by editing the calculations.
 */
const classIII = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III; // e = 20 kg
const base = getRuleSet(DEFAULT_RULE_SET_ID);

// A made-up later edition used only to prove the mechanism. It is NOT a real OIML document.
const hypothetical = (id) => ({
  ...base,
  id,
  title: 'Hypothetical revision (test fixture)',
  edition: 'test',
  effectiveFrom: '2099-01-01',
  mpeTable: {
    ...base.mpeTable,
    CLASS_III: [
      { minLoad: 0, maxLoad: 1000, mpeInitial: 0.5, stepName: 'STEP_1000E' },
      { minLoad: 1000, maxLoad: 4000, mpeInitial: 1.0, stepName: 'STEP_4000E' },
      { minLoad: 4000, maxLoad: 10000, mpeInitial: 1.5, stepName: 'STEP_10000E' },
    ],
  },
  inServiceFactor: 3,
  limits: { ...base.limits, creep30MinE: 1.0, zeroDriftBasisC: { CLASS_I: 1, DEFAULT: 10 } },
});

const creepData = (d15, d30) => ({
  testLoad: 60000,
  creepReadings: [
    { minute: 0, indication: 60000 },
    { minute: 15, indication: 60000 + d15 },
    { minute: 30, indication: 60000 + d30 },
  ],
  zeroReturn: { indicationAfterUnload: 0 },
});

afterEach(() => setActiveRuleSet(DEFAULT_RULE_SET_ID));

describe('Versioned OIML rule sets', () => {
  it('RS-1: the default edition is OIML R 76:2006 and is the active one', () => {
    expect(DEFAULT_RULE_SET_ID).toBe('OIML-R76-2006');
    expect(getActiveRuleSet().id).toBe('OIML-R76-2006');
    expect(getActiveRuleSet().title).toContain('R 76-1:2006');
    expect(MPE_TABLE).toEqual(base.mpeTable); // the engine's exported table is the edition's table
  });

  it('RS-2: the default edition reproduces R 76-1 Table 6 at every class boundary', () => {
    const table = { CLASS_I: [50000, 200000], CLASS_II: [5000, 20000], CLASS_III: [500, 2000], CLASS_IIII: [50, 200] };
    for (const [cls, [a, b]] of Object.entries(table)) {
      expect(getMPE(cls, a)).toBe(0.5);
      expect(getMPE(cls, a + 1)).toBe(1.0);
      expect(getMPE(cls, b)).toBe(1.0);
      expect(getMPE(cls, b + 1)).toBe(1.5);
      expect(getMPE(cls, a, true)).toBe(1.0); // in service: 2 x
    }
  });

  it('RS-3: registering a new edition does not change results until it is activated', () => {
    registerRuleSet(hypothetical('TEST-REV-A'));
    expect(getActiveRuleSet().id).toBe(DEFAULT_RULE_SET_ID);
    expect(getMPE('CLASS_III', 800)).toBe(1.0); // 2006: 500e < 800e <= 2000e
  });

  it('RS-4: activating an edition changes the MPE steps and the in-service factor without code changes', () => {
    setActiveRuleSet('TEST-REV-A');
    expect(getMPE('CLASS_III', 800)).toBe(0.5); // revised step: up to 1000e
    expect(getMPE('CLASS_III', 3000)).toBe(1.0);
    expect(getMPE('CLASS_III', 800, true)).toBe(1.5); // revised factor 3
    expect(getMPE('CLASS_II', 5000)).toBe(0.5); // classes the revision did not touch are unchanged
  });

  it('RS-5: creep and zero-drift limits follow the active edition', () => {
    const creep = creepData(14, 16); // 0.8e over 30 min, 0.1e between 15 and 30 min (e = 20 kg)
    expect(calculateTimeDependence(creep, classIII).overallPass).toBe(false); // 2006 limit 0.5e
    const temp = {
      temperaturePoints: [
        { temperature: 20, zeroIndication: 0, spanLoad: 60000, spanIndication: 60000 },
        { temperature: 25, zeroIndication: 0, spanLoad: 60000, spanIndication: 60000 },
      ],
    };
    expect(calculateTemperatureEffect(temp, classIII).zeroBasisC).toBe(5);
    setActiveRuleSet('TEST-REV-A');
    expect(calculateTimeDependence(creep, classIII).overallPass).toBe(true); // revised limit 1.0e
    expect(calculateTemperatureEffect(temp, classIII).zeroBasisC).toBe(10);
  });

  it('RS-6: every evaluated result records the edition it was judged against', () => {
    expect(evaluateTestResult('TIME_DEPENDENCE', creepData(0, 0), classIII).calculations.ruleSet).toBe('OIML-R76-2006');
    setActiveRuleSet('TEST-REV-A');
    expect(evaluateTestResult('TIME_DEPENDENCE', creepData(0, 0), classIII).calculations.ruleSet).toBe('TEST-REV-A');
  });

  it('RS-7: switching back restores the 2006 limits exactly', () => {
    setActiveRuleSet('TEST-REV-A');
    setActiveRuleSet(DEFAULT_RULE_SET_ID);
    expect(getMPE('CLASS_III', 800)).toBe(1.0);
    expect(getMPE('CLASS_III', 800, true)).toBe(2.0);
  });

  it('RS-8: malformed editions are rejected before they can reach the engine', () => {
    expect(() => validateRuleSet(null)).toThrow();
    expect(() => registerRuleSet({ ...hypothetical('BAD-1'), mpeTable: { ...base.mpeTable, CLASS_III: [] } })).toThrow(/CLASS_III/);
    const gap = [
      { minLoad: 0, maxLoad: 500, mpeInitial: 0.5 },
      { minLoad: 600, maxLoad: 2000, mpeInitial: 1 },
    ];
    expect(() => registerRuleSet({ ...hypothetical('BAD-2'), mpeTable: { ...base.mpeTable, CLASS_III: gap } })).toThrow(/contiguous/);
    expect(() => registerRuleSet({ ...hypothetical('BAD-3'), inServiceFactor: 0.5 })).toThrow(/inServiceFactor/);
    expect(() => registerRuleSet({ ...hypothetical('BAD-4'), limits: { ...base.limits, zeroReturnE: -1 } })).toThrow(/zeroReturnE/);
    expect(() => registerRuleSet(hypothetical('TEST-REV-A'))).toThrow(/already registered/);
    expect(() => setActiveRuleSet('NO-SUCH-EDITION')).toThrow(/Unknown rule set/);
    expect(getRuleSet('BAD-1')).toBeNull();
  });

  it('RS-9: the API lists the editions and names the active one', async () => {
    const res = await request(app).get('/api/rules');
    expect(res.status).toBe(200);
    expect(res.body.active).toBe('OIML-R76-2006');
    expect(res.body.data.find((r) => r.id === 'OIML-R76-2006')).toMatchObject({ active: true, edition: '2006' });
    expect(res.body.data.every((r) => !('mpeTable' in r))).toBe(true);
    expect(listRuleSets().filter((r) => r.active)).toHaveLength(1);
    const health = await request(app).get('/api/health');
    expect(health.body.ruleSet).toBe('OIML-R76-2006');
  });
});
