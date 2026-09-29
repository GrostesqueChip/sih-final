/**
 * Deterministic demonstration dataset for the in-memory database.
 *
 * Everything here is generated, not hand-typed: each finalized verification
 * session carries the three verification tests (weighing, repeatability,
 * eccentricity) and each type evaluation session all six implemented OIML R 76
 * test modules; every verdict is computed by the same
 * `evaluateTestResult` engine the live API uses. The dashboard, the session
 * pages, the PDFs and the public verification portal therefore always agree
 * with one another, and the timeline is anchored to "today" so the demo never
 * looks stale.
 */
const bcrypt = require('bcryptjs');
const { evaluateTestResult } = require('../services/mpeCalculator');
const { requiredTestTypesFor, isInServiceSession } = require('./sessionTypes');

const DAY = 86400000;

// Small seeded PRNG so every boot produces the same numbers.
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function decimalsOf(step) {
  const s = String(step);
  if (s.includes('e-')) return Number(s.split('e-')[1]);
  return s.includes('.') ? s.split('.')[1].length : 0;
}

function quant(value, step) {
  const dp = decimalsOf(step) + 1;
  return Number((Math.round(value / step) * step).toFixed(dp));
}

function round4(v) {
  return Math.round(v * 10000) / 10000;
}

// -------------------------------------------------------------------------
// Officers
// -------------------------------------------------------------------------
const PASSWORDS = {
  admin: bcrypt.hashSync('Admin@123', 10),
  inspector: bcrypt.hashSync('Inspector@123', 10),
  viewer: bcrypt.hashSync('Viewer@123', 10),
};

const USERS = [
  {
    id: 'usr-admin-01',
    name: 'Shri Rajesh Kumar',
    email: 'admin@nawi.gov.in',
    password: PASSWORDS.admin,
    role: 'ADMIN',
    designation: 'Controller of Legal Metrology',
    district: 'Punjab (HQ, Chandigarh)',
    phone: '0172-2701245',
    isActive: true,
    createdDaysAgo: 420,
  },
  {
    id: 'usr-officer-01',
    name: 'Shri Vikramaditya Sharma',
    email: 'inspector@nawi.gov.in',
    password: PASSWORDS.inspector,
    role: 'INSPECTOR',
    designation: 'Inspector of Legal Metrology',
    district: 'Ludhiana',
    phone: '0161-2403318',
    isActive: true,
    createdDaysAgo: 400,
  },
  {
    id: 'usr-officer-02',
    name: 'Smt. Harpreet Kaur',
    email: 'harpreet.kaur@nawi.gov.in',
    password: PASSWORDS.inspector,
    role: 'INSPECTOR',
    designation: 'Inspector of Legal Metrology',
    district: 'Jalandhar',
    phone: '0181-2224519',
    isActive: true,
    createdDaysAgo: 390,
  },
  {
    id: 'usr-officer-03',
    name: 'Shri Amandeep Singh Gill',
    email: 'amandeep.gill@nawi.gov.in',
    password: PASSWORDS.inspector,
    role: 'INSPECTOR',
    designation: 'Assistant Controller of Legal Metrology',
    district: 'Patiala',
    phone: '0175-2212087',
    isActive: true,
    createdDaysAgo: 380,
  },
  {
    id: 'usr-lab-01',
    name: 'Dr. Meenakshi Iyer',
    email: 'meenakshi.iyer@nawi.gov.in',
    password: PASSWORDS.inspector,
    role: 'INSPECTOR',
    designation: 'Senior Scientific Officer (Mass)',
    district: 'State Metrology Laboratory, Chandigarh',
    phone: '0172-2745560',
    isActive: true,
    createdDaysAgo: 370,
  },
  {
    id: 'usr-viewer-01',
    name: 'Smt. Ananya Sen',
    email: 'viewer@nawi.gov.in',
    password: PASSWORDS.viewer,
    role: 'VIEWER',
    designation: 'Audit Officer (Internal Audit Wing)',
    district: 'Punjab (HQ, Chandigarh)',
    phone: '0172-2701290',
    isActive: true,
    createdDaysAgo: 360,
  },
  {
    id: 'usr-officer-04',
    name: 'Shri Gurmeet Singh Randhawa',
    email: 'gurmeet.randhawa@nawi.gov.in',
    password: PASSWORDS.inspector,
    role: 'INSPECTOR',
    designation: 'Inspector of Legal Metrology (Transferred)',
    district: 'Amritsar',
    phone: '0183-2562210',
    isActive: false,
    createdDaysAgo: 410,
  },
];

// -------------------------------------------------------------------------
// Registered weighing instruments (Punjab)
// -------------------------------------------------------------------------
const INSTRUMENTS = [
  {
    id: 'inst-wb-01', name: 'Khanna APMC Mandi Truck Weighbridge No. 1', type: 'WEIGHBRIDGE',
    manufacturer: 'Avery India Ltd', model: 'Weigh-Tronix E1205 Pitless', serialNumber: 'AVY-2021-KHN-0417',
    accuracyClass: 'CLASS_III', maxCapacity: 60000, minCapacity: 400, verificationInterval: 20, actualInterval: 20, unit: 'kg',
    location: 'Gate No. 2, New Grain Market, Khanna', district: 'Ludhiana', ownerName: 'Market Committee Khanna (Punjab Mandi Board)',
    officer: 'usr-officer-01', registeredDaysAgo: 360,
  },
  {
    id: 'inst-wb-02', name: 'Rajpura Anaj Mandi Weighbridge', type: 'WEIGHBRIDGE',
    manufacturer: 'Essae-Teraoka Pvt Ltd', model: 'EWB-80 Surface Mount', serialNumber: 'ESS-2022-RJP-1180',
    accuracyClass: 'CLASS_III', maxCapacity: 80000, minCapacity: 400, verificationInterval: 20, actualInterval: 20, unit: 'kg',
    location: 'Anaj Mandi, G.T. Road, Rajpura', district: 'Patiala', ownerName: 'M/s Shiv Shakti Dharam Kanda',
    officer: 'usr-officer-03', registeredDaysAgo: 350,
  },
  {
    id: 'inst-wb-03', name: 'Moga Grain Market Weighbridge', type: 'WEIGHBRIDGE',
    manufacturer: 'Mettler-Toledo India Pvt Ltd', model: 'PowerDeck WB-50', serialNumber: 'MTI-2020-MOG-0932',
    accuracyClass: 'CLASS_III', maxCapacity: 50000, minCapacity: 200, verificationInterval: 10, actualInterval: 10, unit: 'kg',
    location: 'Old Grain Market, Moga', district: 'Moga', ownerName: 'Market Committee Moga',
    officer: 'usr-officer-01', registeredDaysAgo: 345,
  },
  {
    id: 'inst-wb-04', name: 'Ferozepur Container Depot Weighbridge', type: 'WEIGHBRIDGE',
    manufacturer: 'Avery India Ltd', model: 'Weigh-Tronix BridgeMont 100', serialNumber: 'AVY-2026-FZR-0021',
    accuracyClass: 'CLASS_III', maxCapacity: 100000, minCapacity: 400, verificationInterval: 20, actualInterval: 20, unit: 'kg',
    location: 'Inland Container Depot, Ferozepur Cantt.', district: 'Ferozepur', ownerName: 'Central Warehousing Corporation',
    officer: 'usr-officer-02', registeredDaysAgo: 4,
  },
  {
    id: 'inst-ps-01', name: 'FCI Foodgrain Depot Platform Scale', type: 'PLATFORM_SCALE',
    manufacturer: 'CAS Corporation', model: 'DB-1H Industrial', serialNumber: 'CAS-2023-JAL-088',
    accuracyClass: 'CLASS_III', maxCapacity: 600, minCapacity: 4, verificationInterval: 0.2, actualInterval: 0.2, unit: 'kg',
    location: 'FCI Food Storage Depot, Suchi Pind, Jalandhar', district: 'Jalandhar', ownerName: 'Food Corporation of India',
    officer: 'usr-officer-02', registeredDaysAgo: 340, photo: '/assets/photos/fci-godown.jpg',
  },
  {
    id: 'inst-ps-02', name: 'Bathinda Cotton Mandi Platform Scale', type: 'PLATFORM_SCALE',
    manufacturer: 'Phoenix Scales Pvt Ltd', model: 'PX-500 Heavy Duty', serialNumber: 'PHX-2022-BTI-3310',
    accuracyClass: 'CLASS_III', maxCapacity: 500, minCapacity: 2, verificationInterval: 0.1, actualInterval: 0.1, unit: 'kg',
    location: 'Cotton Yard, New Anaj Mandi, Bathinda', district: 'Bathinda', ownerName: 'M/s Guru Nanak Cotton Traders',
    officer: 'usr-officer-03', registeredDaysAgo: 330,
  },
  {
    id: 'inst-ps-03', name: 'Amritsar Wholesale Fruit Market Scale', type: 'PLATFORM_SCALE',
    manufacturer: 'Essae-Teraoka Pvt Ltd', model: 'DS-252 Platform', serialNumber: 'ESS-2023-ASR-2207',
    accuracyClass: 'CLASS_III', maxCapacity: 300, minCapacity: 2, verificationInterval: 0.1, actualInterval: 0.1, unit: 'kg',
    location: 'Fruit & Vegetable Market, Vallah, Amritsar', district: 'Amritsar', ownerName: 'M/s Bhatia Fruit Company',
    officer: 'usr-officer-02', registeredDaysAgo: 320,
  },
  {
    id: 'inst-es-01', name: 'Ludhiana Subzi Mandi Platform Scale', type: 'PLATFORM_SCALE',
    manufacturer: 'Essae-Teraoka Pvt Ltd', model: 'DS-215 High Precision', serialNumber: 'ESS-2024-LDH-042',
    accuracyClass: 'CLASS_III', maxCapacity: 150, minCapacity: 1, verificationInterval: 0.05, actualInterval: 0.05, unit: 'kg',
    location: 'Shed No. 4, Subzi Mandi, Bahadur Ke Road, Ludhiana', district: 'Ludhiana', ownerName: 'M/s Arora Sabzi Traders',
    officer: 'usr-officer-01', registeredDaysAgo: 300,
  },
  {
    id: 'inst-cs-01', name: 'Kirana Store Counter Scale', type: 'ELECTRONIC_SCALE',
    manufacturer: 'Citizen Scales (India) Pvt Ltd', model: 'CG-30 Counter', serialNumber: 'CTZ-2024-LDH-7781',
    accuracyClass: 'CLASS_III', maxCapacity: 30, minCapacity: 0.1, verificationInterval: 0.005, actualInterval: 0.005, unit: 'kg',
    location: 'Shop No. 12, Ghumar Mandi, Ludhiana', district: 'Ludhiana', ownerName: 'M/s Jain General Store',
    officer: 'usr-officer-01', registeredDaysAgo: 290,
  },
  {
    id: 'inst-cs-02', name: 'Patiala Sabzi Mandi Counter Scale', type: 'ELECTRONIC_SCALE',
    manufacturer: 'Contech Instruments Ltd', model: 'CTG-15 Retail', serialNumber: 'CON-2023-PTA-5540',
    accuracyClass: 'CLASS_III', maxCapacity: 15, minCapacity: 0.04, verificationInterval: 0.005, actualInterval: 0.005, unit: 'kg',
    location: 'Stall No. 38, Sanauri Adda Sabzi Mandi, Patiala', district: 'Patiala', ownerName: 'Shri Balwinder Singh (Vendor)',
    officer: 'usr-officer-03', registeredDaysAgo: 280,
  },
  {
    id: 'inst-cs-03', name: 'Fair Price Shop (PDS) Weighing Scale', type: 'ELECTRONIC_SCALE',
    manufacturer: 'Essae-Teraoka Pvt Ltd', model: 'DS-852 ePoS Linked', serialNumber: 'ESS-2024-SGR-0118',
    accuracyClass: 'CLASS_III', maxCapacity: 50, minCapacity: 0.2, verificationInterval: 0.01, actualInterval: 0.01, unit: 'kg',
    location: 'Fair Price Shop No. 118, Ward 7, Sangrur', district: 'Sangrur', ownerName: 'Fair Price Shop No. 118 (Food & Civil Supplies)',
    officer: 'usr-officer-03', registeredDaysAgo: 270,
  },
  {
    id: 'inst-cs-04', name: 'Verka Milk Collection Centre Scale', type: 'PLATFORM_SCALE',
    manufacturer: 'Phoenix Scales Pvt Ltd', model: 'PX-100 SS Dairy', serialNumber: 'PHX-2024-HSP-4471',
    accuracyClass: 'CLASS_III', maxCapacity: 100, minCapacity: 0.4, verificationInterval: 0.02, actualInterval: 0.02, unit: 'kg',
    location: 'Village Milk Collection Centre, Bajwara, Hoshiarpur', district: 'Hoshiarpur', ownerName: 'Milkfed Punjab (Verka) Co-operative',
    officer: 'usr-officer-02', registeredDaysAgo: 260,
  },
  {
    id: 'inst-ps-04', name: 'LPG Distributor Cylinder Check Scale', type: 'ELECTRONIC_SCALE',
    manufacturer: 'Citizen Scales (India) Pvt Ltd', model: 'CPS-60 Platform', serialNumber: 'CTZ-2023-MOH-3309',
    accuracyClass: 'CLASS_III', maxCapacity: 60, minCapacity: 0.2, verificationInterval: 0.01, actualInterval: 0.01, unit: 'kg',
    location: 'Indane Gas Agency, Phase 7, S.A.S. Nagar (Mohali)', district: 'S.A.S. Nagar', ownerName: 'M/s Mohali Gas Service',
    officer: 'usr-officer-01', registeredDaysAgo: 250,
  },
  {
    id: 'inst-jw-01', name: 'Hall Bazaar Jewellery Balance', type: 'ELECTRONIC_SCALE',
    manufacturer: 'Shimadzu Analytical India', model: 'UW-620H Jewellery', serialNumber: 'SHM-2024-ASR-6620',
    accuracyClass: 'CLASS_II', maxCapacity: 620, minCapacity: 0.5, verificationInterval: 0.01, actualInterval: 0.001, unit: 'g',
    location: 'Shop No. 44, Guru Bazaar, Hall Gate, Amritsar', district: 'Amritsar', ownerName: 'M/s Kundan Jewellers',
    officer: 'usr-officer-02', registeredDaysAgo: 240,
  },
  {
    id: 'inst-lb-01', name: 'State Metrology Laboratory Analytical Balance', type: 'LABORATORY_BALANCE',
    manufacturer: 'Mettler-Toledo India Pvt Ltd', model: 'XPR205 Analytical', serialNumber: 'MTI-2024-CHD-0007',
    accuracyClass: 'CLASS_I', maxCapacity: 220, minCapacity: 0.01, verificationInterval: 0.001, actualInterval: 0.0001, unit: 'g',
    location: 'Mass Laboratory, State Metrology Laboratory, Sector 39, Chandigarh', district: 'Chandigarh (UT)', ownerName: 'Department of Legal Metrology, Punjab',
    officer: 'usr-lab-01', registeredDaysAgo: 380,
  },
  {
    id: 'inst-lb-02', name: 'Secondary Standards Precision Balance', type: 'LABORATORY_BALANCE',
    manufacturer: 'Sartorius India Pvt Ltd', model: 'Cubis II MCA6.2S', serialNumber: 'SRT-2023-CHD-0012',
    accuracyClass: 'CLASS_II', maxCapacity: 6200, minCapacity: 0.5, verificationInterval: 0.1, actualInterval: 0.01, unit: 'g',
    location: 'Secondary Standards Section, State Metrology Laboratory, Chandigarh', district: 'Chandigarh (UT)', ownerName: 'Department of Legal Metrology, Punjab',
    officer: 'usr-lab-01', registeredDaysAgo: 375,
  },
  // ---- Type evaluation (model approval) test samples — demo applicants ----
  {
    id: 'inst-te-01', name: 'Type evaluation sample — PW-30C counter scale', type: 'ELECTRONIC_SCALE',
    manufacturer: 'Punjab Precision Weighing Systems (demo applicant)', model: 'PW-30C', serialNumber: 'TE-2026-PW30C-S1',
    accuracyClass: 'CLASS_III', maxCapacity: 30, minCapacity: 0.1, verificationInterval: 0.005, actualInterval: 0.005, unit: 'kg',
    location: 'Type evaluation test bench, State Metrology Laboratory, Chandigarh', district: 'Chandigarh (UT)', ownerName: 'Punjab Precision Weighing Systems (applicant)',
    officer: 'usr-lab-01', registeredDaysAgo: 60,
  },
  {
    id: 'inst-te-02', name: 'Type evaluation sample — NL-620 precision balance', type: 'LABORATORY_BALANCE',
    manufacturer: 'Northline Instruments (demo applicant)', model: 'NL-620', serialNumber: 'TE-2026-NL620-S1',
    accuracyClass: 'CLASS_II', maxCapacity: 620, minCapacity: 0.5, verificationInterval: 0.01, actualInterval: 0.001, unit: 'g',
    location: 'Type evaluation test bench, State Metrology Laboratory, Chandigarh', district: 'Chandigarh (UT)', ownerName: 'Northline Instruments (applicant)',
    officer: 'usr-lab-01', registeredDaysAgo: 45,
  },
];

const STANDARD_WEIGHTS = {
  WEIGHBRIDGE: 'M1 cast-iron standard weights (20 × 500 kg) + test vehicle, set SW-PB-WB-03; RRSL Faridabad cert. RRSL/F/2025/4417',
  PLATFORM_SCALE: 'M1 standard weights set SW-PB-M1-11 (1 kg – 20 kg); RRSL Faridabad cert. RRSL/F/2025/3982',
  ELECTRONIC_SCALE: 'F2 standard weights set SW-PB-F2-06 (1 g – 10 kg); RRSL Faridabad cert. RRSL/F/2025/3875',
  LABORATORY_BALANCE: 'E2 reference weights set SW-PB-E2-01 (1 mg – 200 g); NPL New Delhi cert. NPL/MASS/2025/0219',
};

// Test samples whose range is outside the default set for their category.
const STANDARD_WEIGHTS_BY_INSTRUMENT = {
  'inst-te-02': 'E2 reference weights set SW-PB-E2-03 (1 mg – 500 g); NPL New Delhi cert. NPL/MASS/2025/0231',
};

const FEES = { WEIGHBRIDGE: 3000, PLATFORM_SCALE: 400, ELECTRONIC_SCALE: 200, LABORATORY_BALANCE: 600 };

// -------------------------------------------------------------------------
// Session plan (days ago is relative to "today" at server boot)
// profile: healthy | span | ecc | rep | creep     status: pass/fail/progress
// -------------------------------------------------------------------------
const PLAN = [
  // ---- earlier cycle (> 6 months) — establishes re-verification history ----
  { inst: 'inst-lb-01', days: 352, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-wb-01', days: 348, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-lb-02', days: 345, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-wb-03', days: 339, type: 'PERIODIC', profile: 'healthy' }, // due for re-verification soon
  { inst: 'inst-wb-02', days: 333, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-ps-01', days: 318, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-ps-02', days: 300, type: 'PERIODIC', profile: 'span' },    // failed, later re-verified
  { inst: 'inst-ps-03', days: 296, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-es-01', days: 281, type: 'INITIAL', profile: 'healthy' },
  { inst: 'inst-cs-01', days: 272, type: 'INITIAL', profile: 'healthy' },
  { inst: 'inst-cs-02', days: 262, type: 'INITIAL', profile: 'healthy' },
  { inst: 'inst-cs-03', days: 255, type: 'INITIAL', profile: 'healthy' },
  { inst: 'inst-cs-04', days: 244, type: 'INITIAL', profile: 'healthy' },
  { inst: 'inst-ps-04', days: 236, type: 'INITIAL', profile: 'healthy' },
  { inst: 'inst-jw-01', days: 226, type: 'INITIAL', profile: 'healthy' },
  { inst: 'inst-ps-02', days: 214, type: 'PERIODIC', profile: 'healthy' },  // re-verified after adjustment
  // ---- last six months ----
  { inst: 'inst-cs-01', days: 171, type: 'INSPECTION', profile: 'healthy' },
  { inst: 'inst-es-01', days: 158, type: 'INSPECTION', profile: 'healthy' },
  { inst: 'inst-cs-03', days: 146, type: 'INSPECTION', profile: 'rep' },       // PDS scale unstable
  { inst: 'inst-cs-02', days: 131, type: 'INSPECTION', profile: 'healthy' },
  { inst: 'inst-cs-03', days: 118, type: 'PERIODIC', profile: 'healthy' },     // repaired & passed
  { inst: 'inst-ps-04', days: 104, type: 'INSPECTION', profile: 'healthy' },
  { inst: 'inst-cs-04', days: 92, type: 'INSPECTION', profile: 'ecc' },       // corner load-cell fault
  { inst: 'inst-jw-01', days: 79, type: 'INSPECTION', profile: 'healthy' },
  { inst: 'inst-cs-04', days: 71, type: 'PERIODIC', profile: 'healthy' },     // repaired & passed
  { inst: 'inst-ps-03', days: 60, type: 'INSPECTION', profile: 'healthy' },
  { inst: 'inst-lb-01', days: 46, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-wb-01', days: 38, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-lb-02', days: 30, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-wb-02', days: 24, type: 'PERIODIC', profile: 'healthy' },
  // ---- type evaluation (model approval) at the laboratory ----
  { inst: 'inst-te-01', days: 36, type: 'TYPE_EVALUATION', profile: 'healthy' },  // all implemented tests passed
  { inst: 'inst-te-02', days: 20, type: 'TYPE_EVALUATION', profile: 'creep' },    // creep beyond 0.2e — test failed
  { inst: 'inst-es-01', days: 17, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-cs-01', days: 11, type: 'PERIODIC', profile: 'healthy' },
  { inst: 'inst-ps-01', days: 6, type: 'PERIODIC', profile: 'span' },        // FCI scale over-reads — REJECTED
  // ---- open work for the evaluator ----
  // Assigned to the demo Inspector login so an evaluator can finish them.
  { inst: 'inst-ps-02', days: 2, type: 'PERIODIC', profile: 'healthy', progress: 2, officer: 'usr-officer-01' },  // 2 of 3 modules done
  { inst: 'inst-cs-02', days: 1, type: 'PERIODIC', profile: 'healthy', progress: 1, officer: 'usr-officer-01' },  // 1 of 3 modules done
  { inst: 'inst-te-01', days: 3, type: 'TYPE_EVALUATION', profile: 'healthy', progress: 5, officer: 'usr-officer-01' }, // 5 of 6 modules done
  { inst: 'inst-wb-04', days: 0, type: 'INITIAL', profile: 'healthy', progress: 0, officer: 'usr-officer-01' },   // freshly opened
];

const TYPE_ORDER = ['WEIGHING_PERFORMANCE', 'REPEATABILITY', 'ECCENTRICITY', 'TEMPERATURE', 'STABILITY', 'TIME_DEPENDENCE'];

// -------------------------------------------------------------------------
// Measurement generators (canonical payloads — identical to what the data
// entry screen posts, so seeded sessions reopen exactly like live ones)
// -------------------------------------------------------------------------
function makeModuleData(testType, inst, profile, rnd) {
  const max = inst.maxCapacity;
  const e = inst.verificationInterval;
  const d = inst.actualInterval || e;
  const fine = d < e; // high-resolution balance
  const jitter = () => (fine ? Math.round((rnd() - 0.5) * 4) * d : (rnd() < 0.25 ? d : 0));
  const spanErr = (load) => {
    if (profile === 'span') return quant((load / max) * 2.6 * e, d); // over-reads ~2.6e at Max
    // Healthy coarse instruments (d = e) read exactly up to 60 % of Max and one
    // division high near Max — well inside the stepped MPE. Fine-resolution
    // balances show a small proportional span error in sub-divisions.
    if (!fine) return load / max >= 0.8 ? d : 0;
    return quant((load / max) * 0.6 * e, d);
  };

  switch (testType) {
    case 'WEIGHING_PERFORMANCE': {
      const pcts = [0, 20, 40, 60, 80, 100];
      const points = [];
      pcts.forEach((pct) => {
        const load = round4(max * (pct / 100));
        const inc = pct === 0 ? 0 : quant(load + spanErr(load) + (fine ? jitter() : 0), d);
        const dec = pct === 0 ? 0 : quant(inc + (rnd() < 0.3 ? -d : 0), d);
        points.push({ appliedLoad: load, indicatedValue: inc, isIncreasing: true });
        points.push({ appliedLoad: load, indicatedValue: dec, isIncreasing: false });
      });
      return { points };
    }
    case 'REPEATABILITY': {
      const mk = (load) =>
        Array.from({ length: 6 }, (_, i) => {
          let v = load + spanErr(load) + jitter();
          if (profile === 'rep' && (i === 2 || i === 4)) v += (i === 2 ? 3 : -1) * e;
          return quant(v, d);
        });
      return {
        series: [
          { load: round4(max * 0.5), readings: mk(round4(max * 0.5)) },
          { load: max, readings: mk(max) },
        ],
      };
    }
    case 'ECCENTRICITY': {
      const load = quant(max / 3, e); // practical 1/3 Max, rounded to the scale interval
      const base = load + spanErr(load);
      const positions = [0, 1, 2, 3, 4].map((idx) => {
        let v = base + (idx === 0 ? 0 : jitter());
        if (profile === 'ecc' && idx === 3) v += 3 * e;
        return { position: idx === 0 ? 'CENTER' : `POS_${idx + 1}`, appliedLoad: load, indicatedValue: quant(v, d) };
      });
      return { positions };
    }
    case 'TEMPERATURE': {
      return {
        temperaturePoints: [20, 40, -10, 5].map((t) => ({
          temperature: t,
          zeroIndication: t === 20 ? 0 : quant(fine ? (t - 20) * 0.02 * e : 0, d),
          spanLoad: max,
          spanIndication: quant(max + spanErr(max) + (t === 40 && !fine ? 0 : 0), d),
        })),
      };
    }
    case 'STABILITY': {
      // Warm-up time (R 76-1 A.5.2): E0 and EL at 0, 5, 15 and 30 min after switch-on.
      const base = quant(max + spanErr(max), d);
      return {
        timePoints: [0, 5, 15, 30].map((m, i) => ({
          timestampMinutes: m,
          zeroReading: quant(fine && i === 0 ? d : 0, d),
          loadReading: quant(base + (fine && i === 0 ? d : 0), d),
          appliedLoad: max,
        })),
      };
    }
    case 'TIME_DEPENDENCE': {
      const base = quant(max + spanErr(max), d);
      return {
        testLoad: max,
        creepReadings: [0, 5, 10, 15, 20, 25, 30].map((m) => ({
          minute: m,
          indication: profile === 'creep' ? quant(base + (m >= 15 ? Math.round(m / 10) * e : 0), d) : base,
        })),
        zeroReturn: { appliedLoad: max, indicationAfterUnload: profile === 'creep' ? e : 0 },
      };
    }
    default:
      return {};
  }
}

const REMARKS = {
  healthy: {
    INITIAL: 'Initial verification prior to commercial use. Weighing, repeatability and eccentricity tests conform to the declared accuracy class. Instrument stamped and approved for trade.',
    TYPE_EVALUATION: 'Type evaluation of the test sample for model approval. All tests recorded in this report meet OIML R 76; the remaining R 76-2 tests are listed as not covered.',
    PERIODIC: 'Annual periodic re-verification under Rule 27, Legal Metrology (General) Rules, 2011. Errors within MPE at all load points. Verification stamp renewed.',
    INSPECTION: 'Surprise field inspection under Section 15 of the Legal Metrology Act, 2009. Instrument found within permissible limits; no irregularity observed.',
  },
  span: 'REJECTED — instrument over-reads progressively with load (span error beyond MPE from 60 % of Max upward), systematically over-charging sellers. Trader directed to withdraw the instrument from commercial use pending repair by a licensed repairer and re-verification.',
  ecc: 'REJECTED — off-centre loading at position 4 (back-right) exceeds MPE, indicating a defective corner load cell. Notice issued under Section 25; instrument sealed against use until repaired.',
  rep: 'REJECTED — repeated weighings of the same load differ by more than the MPE. Unstable indication observed at the PDS counter; beneficiaries at risk of short-weighment. Scale withdrawn pending repair.',
  creep: 'Creep test failed — indication drifts under sustained load (beyond 0.2e between 15 and 30 minutes) and does not return to within 0.5e after unloading. Applicant advised to revise the load-cell design before re-submission.',
};

const TEMPS = [22.5, 24.0, 26.5, 21.0, 28.5, 31.0, 19.5, 25.5, 27.0, 23.5];

// -------------------------------------------------------------------------
// Build
// -------------------------------------------------------------------------
function buildDemoData(now = Date.now()) {
  const rnd = mulberry32(20260929);
  // Anchor at 11:00 IST on each seeded day so sessions sit inside working hours.
  const anchor = (daysAgo, hour = 11, minute = 0) => {
    const dt = new Date(now - daysAgo * DAY);
    dt.setUTCHours(hour - 5, minute - 30, 0, 0); // IST = UTC+5:30
    return dt;
  };

  const users = USERS.map(({ createdDaysAgo, ...u }) => ({
    ...u,
    lastLoginAt: u.isActive ? anchor(Math.floor(rnd() * 5), 9, 30) : anchor(120, 10),
    createdAt: anchor(createdDaysAgo, 10),
    updatedAt: anchor(createdDaysAgo, 10),
  }));

  const instruments = INSTRUMENTS.map(({ officer, registeredDaysAgo, ...inst }) => ({
    ...inst,
    photo: inst.photo || null,
    ranges: null,
    isActive: true,
    createdAt: anchor(registeredDaysAgo, 10, 15),
    updatedAt: anchor(registeredDaysAgo, 10, 15),
  }));
  const instById = Object.fromEntries(instruments.map((i) => [i.id, i]));
  const officerFor = Object.fromEntries(INSTRUMENTS.map((i) => [i.id, i.officer]));

  const testSessions = [];
  const testResults = [];
  const auditLogs = [];
  const yearCounters = {};
  let auditSeq = 0;
  const ip = (uid) => `10.146.${20 + USERS.findIndex((u) => u.id === uid)}.${40 + (auditSeq % 60)}`;
  const log = (at, userId, action, entityType, entityId, details) => {
    auditSeq += 1;
    auditLogs.push({
      id: `aud-${String(auditSeq).padStart(4, '0')}`,
      userId, action, entityType, entityId, details,
      oldValues: null, newValues: null,
      ipAddress: ip(userId), createdAt: at,
    });
  };

  // System bootstrap & officer onboarding
  log(anchor(430, 9), 'usr-admin-01', 'SYSTEM_INITIALIZED', 'System', 'NAWI-REPORTPRO', 'NAWI-ReportPro deployed for Department of Legal Metrology, Punjab. OIML R-76-1:2006 rules engine v1.0 activated.');
  users.filter((u) => u.id !== 'usr-admin-01').forEach((u) => {
    log(u.createdAt, 'usr-admin-01', 'CREATE_USER', 'User', u.id, `Officer account created for ${u.name} (${u.designation}, ${u.district}).`);
  });
  users.filter((u) => u.id === 'usr-officer-04').forEach((u) => {
    log(anchor(120, 16), 'usr-admin-01', 'DEACTIVATE_USER', 'User', u.id, `Account deactivated for ${u.name} on transfer out of the district.`);
  });
  instruments.forEach((inst) => {
    log(inst.createdAt, officerFor[inst.id], 'CREATE_INSTRUMENT', 'Instrument', inst.id,
      `Registered ${inst.name} (S/N ${inst.serialNumber}, ${inst.accuracyClass.replace('CLASS_', 'Class ')}, Max ${inst.maxCapacity} ${inst.unit}) — ${inst.ownerName}.`);
  });

  PLAN.slice()
    .sort((a, b) => b.days - a.days)
    .forEach((plan, idx) => {
      const inst = instById[plan.inst];
      const officerId = plan.officer || officerFor[plan.inst];
      const start = anchor(plan.days, 10 + (idx % 4), (idx * 13) % 60);
      const year = start.getFullYear();
      const isTE = plan.type === 'TYPE_EVALUATION';
      const counterKey = isTE ? `TER-${year}` : year;
      yearCounters[counterKey] = (yearCounters[counterKey] || (isTE ? 40 : year === 2025 ? 812 : 100)) + 1;
      const certificateNo = `${isTE ? 'TER' : 'NAWI'}-${year}-${String(yearCounters[counterKey]).padStart(6, '0')}`;
      const id = `sess-${String(idx + 1).padStart(3, '0')}`;
      const isOpen = plan.progress !== undefined;
      const moduleTypes = TYPE_ORDER.filter((t) => requiredTestTypesFor(plan.type).includes(t));
      const moduleCount = isOpen ? plan.progress : moduleTypes.length;
      const isInService = isInServiceSession(plan.type);

      let allPass = true;
      moduleTypes.slice(0, moduleCount).forEach((testType, m) => {
        const data = makeModuleData(testType, inst, plan.profile, rnd);
        const evaluation = evaluateTestResult(testType, data, inst, isInService);
        if (evaluation.result !== 'PASS') allPass = false;
        const at = new Date(start.getTime() + (m + 1) * 14 * 60000);
        testResults.push({
          id: `res-${id.slice(5)}-${m + 1}`,
          testSessionId: id,
          testType,
          status: 'COMPLETED',
          result: evaluation.result,
          data,
          calculations: evaluation.calculations,
          remarks: evaluation.calculations.summary || null,
          createdAt: at,
          updatedAt: at,
        });
        log(at, officerId, 'ENTER_TEST_DATA', 'TestResult', `res-${id.slice(5)}-${m + 1}`,
          `Saved ${testType.replace(/_/g, ' ').toLowerCase()} test for ${certificateNo} — evaluation: ${evaluation.result}.`);
      });

      const completedAt = isOpen ? null : new Date(start.getTime() + (95 + (idx % 5) * 10) * 60000);
      const overallResult = isOpen ? null : allPass ? 'PASS' : 'FAIL';
      const profileKey = plan.profile === 'healthy' ? null : plan.profile;
      const remarks = isOpen
        ? plan.progress === 0
          ? 'Initial verification of newly installed weighbridge. Site inspection done; load testing to commence.'
          : `${isTE ? 'Type evaluation' : plan.type === 'INITIAL' ? 'Initial verification' : 'Annual re-verification'} in progress — ${plan.progress} of ${moduleTypes.length} test modules recorded.`
        : profileKey && !allPass
          ? REMARKS[profileKey]
          : REMARKS.healthy[plan.type];

      testSessions.push({
        id,
        certificateNo,
        instrumentId: inst.id,
        conductedById: officerId,
        status: isOpen ? 'IN_PROGRESS' : 'COMPLETED',
        overallResult,
        verificationType: plan.type,
        temperature: TEMPS[idx % TEMPS.length],
        humidity: 42 + ((idx * 7) % 26),
        atmosphericPressure: Number((1008 + ((idx * 3) % 9) + 0.25).toFixed(2)),
        standardWeightsUsed: STANDARD_WEIGHTS_BY_INSTRUMENT[inst.id] || STANDARD_WEIGHTS[inst.type],
        feeAmount: FEES[inst.type],
        remarks,
        verificationSeal: null,
        sealedAt: completedAt,
        startedAt: start,
        completedAt,
        createdAt: start,
        updatedAt: completedAt || start,
      });

      log(start, officerId, 'CREATE_TEST_SESSION', 'TestSession', id,
        `Opened ${isTE ? 'type evaluation' : plan.type === 'INITIAL' ? 'initial verification' : plan.type === 'INSPECTION' ? 'field inspection' : 'periodic re-verification'} ${certificateNo} for ${inst.name} (S/N ${inst.serialNumber}).`);
      if (!isOpen) {
        log(completedAt, officerId, 'FINALIZE_TEST_SESSION', 'TestSession', id,
          `Finalized and sealed ${certificateNo}. Overall outcome: ${overallResult}.`);
        if (idx % 3 === 0) {
          log(new Date(completedAt.getTime() + 20 * 60000), officerId, 'GENERATE_CERTIFICATE_PDF', 'TestSession', id,
            `Generated official ${isTE ? 'type evaluation test report' : 'certificate'} PDF for ${certificateNo}.`);
        }
      }
    });

  // A sprinkling of recent sign-ins
  users.filter((u) => u.isActive).forEach((u, i) => {
    [0, 2, 5].forEach((d) => log(anchor(d, 9, 5 + i * 7), u.id, 'LOGIN', 'User', u.id, `${u.name} signed in (${u.role}).`));
  });

  auditLogs.sort((a, b) => a.createdAt - b.createdAt);

  return { users, instruments, testSessions, testResults, auditLogs, yearCounters };
}

module.exports = { buildDemoData };
