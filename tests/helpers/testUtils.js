/**
 * Test Utilities & Metrological Fixtures for NAWI-ReportPro Test Suite
 */

export const SAMPLE_INSTRUMENTS = {
  WEIGHBRIDGE_60T_CLASS_III: {
    id: 'inst-weighbridge-60t',
    name: 'Essae 60-Tonne Electronic Truck Weighbridge',
    model: 'WB-60T-DS',
    serialNumber: 'SN-WB-2026-9901',
    accuracyClass: 'CLASS_III',
    maxCapacity: 60000,
    minCapacity: 400,
    verificationInterval: 20,
    actualInterval: 20,
    unit: 'kg',
    location: 'APMC Yard, Khanna Mandi, Punjab',
  },
  DUAL_INTERVAL_RETAIL_CLASS_III: {
    id: 'inst-retail-dual-interval',
    name: 'Dual-Interval Electronic Price Computing Scale',
    model: 'ACS-15/30',
    serialNumber: 'SN-ACS-2026-4412',
    accuracyClass: 'CLASS_III',
    maxCapacity: 30,
    minCapacity: 0.1,
    verificationInterval: 0.005,
    actualInterval: 0.005,
    unit: 'kg',
    ranges: [
      { max: 15, e: 0.005, d: 0.005, min: 0.1 },
      { max: 30, e: 0.010, d: 0.010, min: 15 },
    ],
  },
  TRIPLE_INTERVAL_LAB_CLASS_II: {
    id: 'inst-lab-triple-interval',
    name: 'Triple-Interval High Precision Analytical Scale',
    model: 'HP-6000-TRI',
    serialNumber: 'SN-HP-2026-7821',
    accuracyClass: 'CLASS_II',
    maxCapacity: 6000,
    minCapacity: 1,
    verificationInterval: 0.01,
    actualInterval: 0.01,
    unit: 'g',
    ranges: [
      { max: 1000, e: 0.01, d: 0.01, min: 0.5 },
      { max: 3000, e: 0.02, d: 0.02, min: 1000 },
      { max: 6000, e: 0.05, d: 0.05, min: 3000 },
    ],
  },
  MICRO_BALANCE_CLASS_I: {
    id: 'inst-micro-class-i',
    name: 'Micro-Balance Special Accuracy Class I',
    model: 'MB-220-EX',
    serialNumber: 'SN-MB-2026-0001',
    accuracyClass: 'CLASS_I',
    maxCapacity: 220,
    minCapacity: 0.01,
    verificationInterval: 0.001,
    actualInterval: 0.0001,
    unit: 'g',
  },
  CRANE_SCALE_CLASS_IIII: {
    id: 'inst-crane-class-iiii',
    name: 'Heavy Duty Crane Scale Class IIII',
    model: 'CS-10T-HD',
    serialNumber: 'SN-CS-2026-3399',
    accuracyClass: 'CLASS_IIII',
    maxCapacity: 10000,
    minCapacity: 100,
    verificationInterval: 10,
    actualInterval: 10,
    unit: 'kg',
  },
};

export const MOCK_OFFICER = {
  id: 'usr-officer-01',
  name: 'Inspector Vikramaditya Sharma',
  designation: 'Senior Inspector of Legal Metrology',
  jurisdiction: 'Northern Division, Ludhiana Zone',
  email: 'v.sharma@lm.gov.in',
};
