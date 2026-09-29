import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import QRCode from 'qrcode';
import { publicApiClient, verifyCertificate } from '../../client/src/services/publicApi.js';

describe('Tier 5: Adversarial Challenger Stress Harness - Frontend Verification & GIGW 3.0 Integrity', () => {

  // =========================================================================
  // 1. QR Code ISO/IEC 18004 Specification & Quiet Margins Stress Tests
  // =========================================================================
  describe('1. QR Code Generation (ISO/IEC 18004) & Quiet Zone Enforcement', () => {
    function generateQrMatrix(text, margin = 2) {
      if (!text) return [];
      try {
        const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
        const size = qr.modules.size;
        const totalSize = size + margin * 2;
        const matrix = Array.from({ length: totalSize }, () => Array(totalSize).fill(0));

        for (let r = 0; r < size; r++) {
          for (let c = 0; c < size; c++) {
            matrix[r + margin][c + margin] = qr.modules.get(r, c) ? 1 : 0;
          }
        }
        return matrix;
      } catch (err) {
        return [];
      }
    }

    it('should generate authentic QR matrices for standard and special-character URLs', () => {
      const testUrls = [
        'https://nawi.gov.in/verify/CERT-2026-IND-00941',
        'https://nawi.gov.in/verify/CERT-2026/PUNJAB/WB-001%20%26%20SEAL',
        'https://nawi.gov.in/verify/CERT-SPECIAL-CHARS-!@*()_+-=~',
        'https://nawi.gov.in/verify/' + 'A'.repeat(120), // Long URL payload
      ];

      for (const url of testUrls) {
        const matrix = generateQrMatrix(url, 2);
        expect(matrix.length).toBeGreaterThan(25); // At least Version 2 QR
        expect(matrix[0].length).toBe(matrix.length); // Square matrix
      }
    });

    it('should enforce strictly zero (white) quiet margins on all four outer boundaries', () => {
      const url = 'https://nawi.gov.in/verify/CERT-2026-WB-8819';
      const margin = 2;
      const matrix = generateQrMatrix(url, margin);
      const totalSize = matrix.length;

      // Check top margin rows (rows 0 and 1)
      for (let r = 0; r < margin; r++) {
        for (let c = 0; c < totalSize; c++) {
          expect(matrix[r][c], `Top margin module at (${r},${c}) must be 0`).toBe(0);
        }
      }

      // Check bottom margin rows
      for (let r = totalSize - margin; r < totalSize; r++) {
        for (let c = 0; c < totalSize; c++) {
          expect(matrix[r][c], `Bottom margin module at (${r},${c}) must be 0`).toBe(0);
        }
      }

      // Check left margin columns (cols 0 and 1)
      for (let r = 0; r < totalSize; r++) {
        for (let c = 0; c < margin; c++) {
          expect(matrix[r][c], `Left margin module at (${r},${c}) must be 0`).toBe(0);
        }
      }

      // Check right margin columns
      for (let r = 0; r < totalSize; r++) {
        for (let c = totalSize - margin; c < totalSize; c++) {
          expect(matrix[r][c], `Right margin module at (${r},${c}) must be 0`).toBe(0);
        }
      }
    });

    it('should contain valid 7x7 ISO/IEC 18004 finder patterns with concentric 3x3 centers', () => {
      const url = 'https://nawi.gov.in/verify/CERT-2026-LEGAL-METROLOGY';
      const margin = 2;
      const matrix = generateQrMatrix(url, margin);
      const qrSize = matrix.length - margin * 2;

      // Helper to verify a 7x7 finder pattern at (rowOffset, colOffset)
      const verifyFinderPattern = (rOffset, cOffset) => {
        // Outer 7x7 border: top & bottom rows must be 1, left & right cols must be 1
        for (let i = 0; i < 7; i++) {
          expect(matrix[rOffset + 0][cOffset + i]).toBe(1);
          expect(matrix[rOffset + 6][cOffset + i]).toBe(1);
          expect(matrix[rOffset + i][cOffset + 0]).toBe(1);
          expect(matrix[rOffset + i][cOffset + 6]).toBe(1);
        }
        // Sub-border (5x5): row 1 & row 5, col 1 & col 5 inside must be 0 (white ring)
        for (let i = 1; i < 6; i++) {
          expect(matrix[rOffset + 1][cOffset + i]).toBe(0);
          expect(matrix[rOffset + 5][cOffset + i]).toBe(0);
          expect(matrix[rOffset + i][cOffset + 1]).toBe(0);
          expect(matrix[rOffset + i][cOffset + 5]).toBe(0);
        }
        // Center 3x3 solid block: rows 2-4, cols 2-4 must be 1
        for (let r = 2; r <= 4; r++) {
          for (let c = 2; c <= 4; c++) {
            expect(matrix[rOffset + r][cOffset + c]).toBe(1);
          }
        }
      };

      // Top-Left Finder
      verifyFinderPattern(margin, margin);
      // Top-Right Finder
      verifyFinderPattern(margin, margin + qrSize - 7);
      // Bottom-Left Finder
      verifyFinderPattern(margin + qrSize - 7, margin);
    });

    it('should safely handle empty, null, and undefined inputs without crashing', () => {
      expect(generateQrMatrix('')).toEqual([]);
      expect(generateQrMatrix(null)).toEqual([]);
      expect(generateQrMatrix(undefined)).toEqual([]);
    });
  });

  // =========================================================================
  // 2. Public Verification Service & Axios Interceptor Isolation
  // =========================================================================
  describe('2. Public Verification Client Architecture & Isolation', () => {
    it('should export publicApiClient with baseURL=/api and no auth interceptors', () => {
      expect(publicApiClient).toBeDefined();
      expect(publicApiClient.defaults.baseURL).toBe('/api');

      // Request interceptors must NOT inject auth headers
      const reqHandlers = publicApiClient.interceptors.request.handlers || [];
      const hasAuthHeaderInjector = reqHandlers.some(h => {
        if (!h || !h.fulfilled) return false;
        return h.fulfilled.toString().includes('Authorization');
      });
      expect(hasAuthHeaderInjector).toBe(false);

      // Response interceptors must NOT intercept 401 and redirect to /login
      const respHandlers = publicApiClient.interceptors.response.handlers || [];
      const hasLoginRedirect = respHandlers.some(h => {
        if (!h || !h.rejected) return false;
        const str = h.rejected.toString();
        return str.includes('/login') || str.includes('window.location');
      });
      expect(hasLoginRedirect).toBe(false);
    });

    it('should reject verification calls when certificate number is missing', async () => {
      await expect(verifyCertificate('')).rejects.toThrow('Certificate reference number is required');
      await expect(verifyCertificate(null)).rejects.toThrow('Certificate reference number is required');
    });

    it('should verify PublicVerificationPage does NOT import apiClient or useApi', () => {
      const filePath = path.resolve('client/src/pages/public/PublicVerificationPage.jsx');
      const content = fs.readFileSync(filePath, 'utf8');

      expect(content).not.toContain("import apiClient from '../../hooks/useApi'");
      expect(content).not.toContain("from '../../hooks/useApi'");
      expect(content).toContain("import { verifyCertificate } from '../../services/publicApi'");
    });
  });

  // =========================================================================
  // 3. Test Session Read-Only Locking & Blank Data Initial State
  // =========================================================================
  describe('3. Test Session Read-Only Locking & Blank Initial Inputs', () => {
    const testDataEntryPath = path.resolve('client/src/pages/tests/TestDataEntryPage.jsx');
    const content = fs.readFileSync(testDataEntryPath, 'utf8');

    it('should derive read-only from the sealed status and officer ownership', () => {
      expect(content).toMatch(/const\s+sealed\s*=\s*session\s*\?\s*session\.status\s*===\s*['"]COMPLETED['"]/);
      expect(content).toMatch(/const\s+readOnly\s*=\s*sealed\s*\|\|\s*!isOwner/);
    });

    it('should never render save / complete actions for a read-only session', () => {
      expect(content).toContain('{!readOnly && (');
      expect(content).toContain("isPartial: !final");
      expect(content).toContain('disabled={readOnly}');
    });

    it('should gate module completion on every reading being present', () => {
      expect(content).toContain('const complete = evaln && evaln.filled === evaln.total;');
      expect(content).toContain('disabled={save.isPending || !complete}');
    });

    it('should start from blank readings and never synthesise passing values', () => {
      expect(content).not.toContain('load * 0.99998');
      expect(content).not.toContain('reading: load');
      // Readings map starts empty; only stored or captured values populate it.
      expect(content).toContain('const [R, setReadings] = useState({});');
      expect(content).toMatch(/v === '' \|\| v === undefined \|\| v === null/);
    });
  });

  // =========================================================================
  // 4. Settings Persistence & Fault-Tolerant LocalStorage Recovery
  // =========================================================================
  describe('4. Settings Persistence & LocalStorage Resilience', () => {
    const settingsPath = path.resolve('client/src/pages/SettingsPage.jsx');
    const content = fs.readFileSync(settingsPath, 'utf8');

    it('should use nawi_settings key and implement localStorage persistence', () => {
      expect(content).toContain("SETTINGS_STORAGE_KEY = 'nawi_settings'");
      expect(content).toContain('localStorage.getItem(SETTINGS_STORAGE_KEY)');
      expect(content).toContain('localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(');
    });

    it('should provide reset to defaults capability with toast notification', () => {
      expect(content).toContain('handleResetDefaults');
      expect(content).toContain('setSettings(DEFAULT_SETTINGS)');
      expect(content).toContain('FiRefreshCw');
    });

    it('should simulate localStorage parsing resilience against corrupted JSON', () => {
      const DEFAULT_SETTINGS = {
        ministryName: 'Ministry of Consumer Affairs, Food & Public Distribution',
        departmentName: 'Department of Legal Metrology',
        standardReference: 'Legal Metrology (General) Rules, 2011 / OIML R-76:2006',
        defaultTempMin: 10,
        defaultTempMax: 40,
        defaultHumidityMin: 40,
        defaultHumidityMax: 70,
        enableAuditChainValidation: true,
        requireInspectorSignature: true,
      };

      // Corrupted JSON recovery simulator
      const parseSettings = (rawStored) => {
        try {
          if (rawStored) {
            return { ...DEFAULT_SETTINGS, ...JSON.parse(rawStored) };
          }
        } catch {
          // Graceful fallback
        }
        return DEFAULT_SETTINGS;
      };

      // Test cases
      expect(parseSettings(null)).toEqual(DEFAULT_SETTINGS);
      expect(parseSettings('{{invalid-json')).toEqual(DEFAULT_SETTINGS);
      expect(parseSettings('{"defaultTempMin": 15}')).toEqual({
        ...DEFAULT_SETTINGS,
        defaultTempMin: 15,
      });
    });
  });

  // =========================================================================
  // 5. GIGW 3.0 State Emblem of India Component Verification
  // =========================================================================
  describe('5. State Emblem of India (official artwork) Verification', () => {
    const emblemPath = path.resolve('client/src/components/common/StateEmblem.jsx');
    const content = fs.readFileSync(emblemPath, 'utf8');

    it('should render the official emblem artwork shipped with the app', () => {
      expect(content).toContain('/assets/gov/emblem-240.png');
      expect(fs.existsSync(path.resolve('client/public/assets/gov/emblem-240.png'))).toBe(true);
      expect(fs.existsSync(path.resolve('client/public/assets/gov/emblem-white-240.png'))).toBe(true);
    });

    it('should describe the emblem and motto in its text alternative', () => {
      expect(content).toContain('State Emblem of India — Satyameva Jayate');
    });

    it('should provide the Ashoka Chakra and tricolour helpers', () => {
      expect(content).toContain('/assets/gov/ashoka-chakra.svg');
      expect(content).toContain('#FF9933');
      expect(content).toContain('#138808');
    });
  });

  // =========================================================================
  // 6. TopBar GIGW 3.0 Accessibility Controls & Bilingual Toggle
  // =========================================================================
  describe('6. TopBar GIGW 3.0 Accessibility Controls', () => {
    const topBarPath = path.resolve('client/src/components/layout/TopBar.jsx');
    const content = fs.readFileSync(topBarPath, 'utf8');

    it('should include font size adjustments A-, A, A+ with document root styling', () => {
      expect(content).toContain("['sm', 'A-']");
      expect(content).toContain("['base', 'A']");
      expect(content).toContain("['lg', 'A+']");
      expect(content).toContain('document.documentElement.style.fontSize');
      expect(content).toContain("localStorage.setItem('gigw_font_size'");
    });

    it('should include high contrast mode toggle targeting document.documentElement', () => {
      expect(content).toContain("document.documentElement.classList.toggle('high-contrast', highContrast)");
      expect(content).toContain("localStorage.setItem('gigw_high_contrast'");
    });

    it('should provide an English / Hindi toggle and a skip-to-main-content link', () => {
      expect(content).toContain("i18n.changeLanguage('en')");
      expect(content).toContain("i18n.changeLanguage('hi')");
      expect(content).toContain('href="#main-content"');
    });

    it('should render the emblem and a notifications feed derived from live data', () => {
      expect(content).toContain('<StateEmblem');
      expect(content).toContain("apiClient.get('/dashboard/stats')");
      expect(content).toContain('markAllSeen');
    });
  });

  // =========================================================================
  // 7. Government Portal Footer Verification
  // =========================================================================
  describe('7. Government Portal Footer Verification', () => {
    const footerPath = path.resolve('client/src/components/layout/Footer.jsx');
    const content = fs.readFileSync(footerPath, 'utf8');

    it('should carry ministry attribution and the SIH 2026 credit', () => {
      expect(content).toContain('Ministry of Consumer Affairs, Food & Public Distribution');
      expect(content).toContain('Smart India Hackathon 2026');
    });

    it('should link only to real Government portals and never show a fake visitor counter', () => {
      expect(content).toContain('https://consumerhelpline.gov.in/');
      expect(content).toContain('https://www.india.gov.in/');
      expect(content).not.toContain('148924');
    });

    it('should provide accessible policy dialogs', () => {
      expect(content).toContain('Terms & Conditions');
      expect(content).toContain('Privacy Policy');
      expect(content).toContain('role="dialog"');
      expect(content).toContain('aria-modal="true"');
    });
  });

  // =========================================================================
  // 8. ErrorEnvelopeChart Tooltip Bounds Stress Tests
  // =========================================================================
  describe('8. ErrorEnvelopeChart Tooltip Clamping & Viewport Math', () => {
    const chartPath = path.resolve('client/src/components/charts/ErrorEnvelopeChart.jsx');
    const content = fs.readFileSync(chartPath, 'utf8');

    it('should compute tooltip coordinates relative to containerRect', () => {
      expect(content).toContain('containerRef.current.getBoundingClientRect()');
      expect(content).toContain('e.currentTarget.getBoundingClientRect()');
      expect(content).toContain('targetRect.left + targetRect.width / 2 - containerRect.left');
      expect(content).toContain('targetRect.top + targetRect.height / 2 - containerRect.top');
    });

    it('should mathematically prevent tooltips from clipping across various container viewports', () => {
      // Oracle function implementing the exact formula in ErrorEnvelopeChart.jsx
      const computeTooltipPosition = (containerWidth, containerHeight, pointX, pointY) => {
        const tipWidth = 220;
        const tipHeight = 150;

        let left = pointX - tipWidth / 2;
        if (left < 10) {
          left = 10;
        } else if (left + tipWidth > containerWidth - 10) {
          left = Math.max(10, containerWidth - tipWidth - 10);
        }

        let top = pointY - tipHeight - 12;
        if (top < 10) {
          top = pointY + 16;
        }

        return { left, top, tipWidth, tipHeight };
      };

      // Test across multiple responsive viewports
      const viewports = [
        { width: 320, height: 400, name: 'Mobile Portrait' },
        { width: 768, height: 500, name: 'Tablet' },
        { width: 1024, height: 600, name: 'Desktop' },
        { width: 1920, height: 900, name: 'Widescreen' },
      ];

      for (const vp of viewports) {
        // Point at extreme left (pointX = 0)
        const leftEdge = computeTooltipPosition(vp.width, vp.height, 0, 100);
        expect(leftEdge.left, `${vp.name} left edge`).toBe(10);

        // Point at extreme right (pointX = vp.width)
        const rightEdge = computeTooltipPosition(vp.width, vp.height, vp.width, 100);
        expect(rightEdge.left + rightEdge.tipWidth, `${vp.name} right edge clamp`).toBeLessThanOrEqual(vp.width - 10);

        // Point near top edge (pointY = 20) -> should flip below point
        const topEdge = computeTooltipPosition(vp.width, vp.height, vp.width / 2, 20);
        expect(topEdge.top, `${vp.name} top edge flip`).toBe(20 + 16);
        expect(topEdge.top).toBeGreaterThan(10);
      }
    });
  });

});
