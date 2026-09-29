import { describe, it, expect } from 'vitest';
import { formatLimit } from '../../client/src/utils/format';
import { limitFmt } from '../../server/src/services/pdfTheme';

// MPE and other limits are fractions of e (0.5 e, 1.5 e, 0.2 × MPE …). Rounding
// them to the display resolution showed a +0.02 kg error "failing" a ±0.02 kg
// limit on a 10 g scale whose true MPE was 0.015 kg.
describe('Tier 2: Limits are shown at the precision they need', () => {
  const scale10g = { actualInterval: 0.01, verificationInterval: 0.01, unit: 'kg' };
  const weighbridge = { actualInterval: 20, verificationInterval: 20, unit: 'kg' };

  it.each([
    [0.015, '0.015'],
    [0.01, '0.01'],
    [0.030000000000000002, '0.03'],
    [0.005, '0.005'],
    [0.003, '0.003'],
  ])('shows %s kg as %s on a 10 g scale (screen and PDF agree)', (value, text) => {
    expect(formatLimit(value, scale10g)).toBe(text);
    expect(limitFmt(scale10g)(value)).toBe(text);
  });

  it('keeps whole-interval limits unchanged on a 20 kg weighbridge', () => {
    expect(formatLimit(30, weighbridge)).toBe('30');
    expect(limitFmt(weighbridge)(10)).toBe('10');
  });

  it('renders missing values as a dash', () => {
    expect(formatLimit(null, scale10g)).toBe('—');
    expect(limitFmt(scale10g)(undefined)).toBe('—');
  });
});
