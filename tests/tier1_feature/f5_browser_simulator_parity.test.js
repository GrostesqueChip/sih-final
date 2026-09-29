import { describe, it, expect } from 'vitest';
import { TelemetrySimulator } from '../../server/src/services/telemetrySimulator';
import { BrowserIndicatorSimulator } from '../../client/src/components/telemetry/browserSimulator';

const FIELDS = ['weight', 'grossWeight', 'tareWeight', 'isStable', 'isZero', 'isOverload', 'isNet', 'rawAscii', 'rawHex'];

/** Drive both simulators through the same script and collect every frame. */
function run(config, script) {
  const server = new TelemetrySimulator();
  server.stopStreamingLoop();
  const serverFrames = [];
  server.subscribe({ write: (s) => serverFrames.push(JSON.parse(s.slice('data: '.length))) });
  server.configure(config);

  const browser = new BrowserIndicatorSimulator(config);
  const browserFrames = [];

  for (const step of script) {
    if (step.load !== undefined) {
      server.setTargetWeight(step.load);
      browser.setTargetWeight(step.load);
    }
    if (step.zero) {
      server.zero();
      browser.zero();
    }
    if (step.tare) {
      server.tare();
      browser.tare();
    }
    for (let i = 0; i < (step.ticks || 1); i++) {
      server.tick();
      browserFrames.push(browser.tick());
    }
  }
  const pick = (f) => Object.fromEntries(FIELDS.map((k) => [k, f[k]]));
  return { server: serverFrames.map(pick), browser: browserFrames.map(pick) };
}

const SCRIPT = [
  { ticks: 3 },
  { load: 20000, ticks: 8 },
  { tare: true, ticks: 3 },
  { load: 80000, ticks: 8 },
  { load: 0, ticks: 8 },
  { zero: true, ticks: 3 },
  { load: 100300, ticks: 8 },
];

describe('Tier 1: Feature 5 - In-browser indicator matches the server simulator', () => {
  for (const protocol of ['METTLER_SICS', 'AVERY_WEIGH_TRONIX', 'ESSAE']) {
    for (const condition of ['HEALTHY', 'FAULTY']) {
      it(`produces identical ${protocol} frames for a ${condition.toLowerCase()} load cell`, () => {
        const config = { protocol, condition, maxCapacity: 100000, verificationInterval_e: 20, actualInterval_d: 20, noiseLevel: 0 };
        const { server, browser } = run(config, SCRIPT);
        expect(browser).toHaveLength(server.length);
        expect(browser).toEqual(server);
      });
    }
  }

  it('produces identical frames for a class I balance with d < e', () => {
    const config = { unit: 'g', maxCapacity: 220, verificationInterval_e: 0.001, actualInterval_d: 0.0001, noiseLevel: 0 };
    const { server, browser } = run(config, [{ ticks: 2 }, { load: 110, ticks: 10 }, { load: 220, ticks: 10 }]);
    expect(browser).toEqual(server);
  });
});
