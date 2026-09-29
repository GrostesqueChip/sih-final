/** Officer-level preferences stored in this browser (Settings page). */
export const SETTINGS_KEY = 'nawi_settings';

export const DEFAULTS = {
  defaultVerificationType: 'PERIODIC',
  defaultTemperature: 24.5,
  defaultHumidity: 52,
  defaultPressure: 1010.5,
  indicatorProtocol: 'METTLER_SICS',
  autoConnectIndicator: true,
};

export function getSettings() {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    return raw ? { ...DEFAULTS, ...JSON.parse(raw) } : { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}
