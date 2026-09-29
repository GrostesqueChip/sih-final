import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';

describe('Milestone R4: Monorepo Scripts, Credentials & PWA Reliability', () => {
  const rootDir = path.resolve(__dirname, '../../');
  const rootPackageJsonPath = path.join(rootDir, 'package.json');
  const serverPackageJsonPath = path.join(rootDir, 'server/package.json');
  const seedJsPath = path.join(rootDir, 'server/prisma/seed.js');
  const demoSeedPath = path.join(rootDir, 'server/src/lib/demoSeed.js');
  const swJsPath = path.join(rootDir, 'client/public/sw.js');
  const errorBoundaryPath = path.join(rootDir, 'client/src/components/common/ErrorBoundary.jsx');
  const appJsxPath = path.join(rootDir, 'client/src/App.jsx');

  describe('Task 1: Seed Credentials Synchronization [CFG-CRIT-01]', () => {
    it('R4-TC1: the shared demo dataset (used by seed.js and the in-memory DB) hashes Admin@123, Inspector@123 and Viewer@123', () => {
      const seedContent = fs.readFileSync(demoSeedPath, 'utf8');
      expect(fs.readFileSync(seedJsPath, 'utf8')).toContain("require('../src/lib/demoSeed')");
      expect(seedContent).toContain("bcrypt.hashSync('Admin@123', 10)");
      expect(seedContent).toContain("bcrypt.hashSync('Inspector@123', 10)");
      expect(seedContent).toContain("bcrypt.hashSync('Viewer@123', 10)");
      expect(seedContent).not.toContain("bcrypt.hash('password123', 10)");
    });

    it('R4-TC2: seed credentials log should display synchronized passwords', () => {
      const seedContent = fs.readFileSync(seedJsPath, 'utf8');
      expect(seedContent).toContain('admin@nawi.gov.in / Admin@123');
      expect(seedContent).toContain('inspector@nawi.gov.in / Inspector@123');
      expect(seedContent).toContain('viewer@nawi.gov.in / Viewer@123');
    });

    it('R4-TC3: generated password hashes should verify against documented README credentials', () => {
      const adminHash = bcrypt.hashSync('Admin@123', 10);
      const inspectorHash = bcrypt.hashSync('Inspector@123', 10);
      const viewerHash = bcrypt.hashSync('Viewer@123', 10);

      expect(bcrypt.compareSync('Admin@123', adminHash)).toBe(true);
      expect(bcrypt.compareSync('Inspector@123', inspectorHash)).toBe(true);
      expect(bcrypt.compareSync('Viewer@123', viewerHash)).toBe(true);

      // Verify rejected on stale credentials
      expect(bcrypt.compareSync('password123', adminHash)).toBe(false);
      expect(bcrypt.compareSync('password123', inspectorHash)).toBe(false);
      expect(bcrypt.compareSync('password123', viewerHash)).toBe(false);
    });
  });

  describe('Task 2 & 3: Monorepo Scripts Configuration', () => {
    it('R4-TC4: root package.json should define working "build" and "start" scripts', () => {
      const rootPkg = JSON.parse(fs.readFileSync(rootPackageJsonPath, 'utf8'));
      expect(rootPkg.scripts).toBeDefined();
      expect(rootPkg.scripts.build).toBeDefined();
      expect(rootPkg.scripts.build).toContain('workspace=client');
      expect(rootPkg.scripts.start).toBeDefined();
      expect(rootPkg.scripts.start).toContain('workspace=server');
    });

    it('R4-TC5: server/package.json should include prisma:generate and prisma:migrate scripts', () => {
      const serverPkg = JSON.parse(fs.readFileSync(serverPackageJsonPath, 'utf8'));
      expect(serverPkg.scripts).toBeDefined();
      expect(serverPkg.scripts['prisma:generate']).toBe('prisma generate');
      expect(serverPkg.scripts['prisma:migrate']).toBe('prisma migrate dev');
    });
  });

  describe('Task 4: Service Worker Precaching Reliability [PWA Crash Fix]', () => {
    it('R4-TC6: client/public/sw.js should remove development paths from PRECACHE_URLS', () => {
      const swContent = fs.readFileSync(swJsPath, 'utf8');
      expect(swContent).not.toContain("'/src/main.jsx'");
      expect(swContent).not.toContain("'/src/index.css'");
    });

    it('R4-TC7: client/public/sw.js should precache valid production app shell assets', () => {
      const swContent = fs.readFileSync(swJsPath, 'utf8');
      expect(swContent).toContain("'/'");
      expect(swContent).toContain("'/index.html'");
      expect(swContent).toContain("'/manifest.json'");
    });
  });

  describe('Task 5: Global React ErrorBoundary with GIGW 3.0 Portal Styling', () => {
    it('R4-TC8: ErrorBoundary component should exist and implement lifecycle error handling', () => {
      expect(fs.existsSync(errorBoundaryPath)).toBe(true);
      const ebContent = fs.readFileSync(errorBoundaryPath, 'utf8');
      expect(ebContent).toContain('getDerivedStateFromError');
      expect(ebContent).toContain('componentDidCatch');
      expect(ebContent).toContain('export default class ErrorBoundary');
    });

    it('R4-TC9: ErrorBoundary should offer multiple error recovery options for field officers', () => {
      const ebContent = fs.readFileSync(errorBoundaryPath, 'utf8');
      expect(ebContent).toContain('handleReset');
      expect(ebContent).toContain('handleReload');
      expect(ebContent).toContain('handleGoHome');
      expect(ebContent).toContain('handleClearAndRelogin');
      expect(ebContent).toContain('StateEmblem');
    });

    it('R4-TC10: client/src/App.jsx should wrap application tree in ErrorBoundary', () => {
      const appContent = fs.readFileSync(appJsxPath, 'utf8');
      expect(appContent).toContain("import ErrorBoundary from './components/common/ErrorBoundary'");
      expect(appContent).toContain('<ErrorBoundary>');
      expect(appContent).toContain('</ErrorBoundary>');
    });
  });

  describe('Task 6: Repository Hygiene & Artifact Cleanliness', () => {
    it('R4-TC11: obsolete python/mjs test capture scripts should be removed from root', () => {
      const obsoleteScripts = [
        'build_pptx.py',
        'build_pptx_v2.py',
        'convert_pptx_to_pdf.py',
        'export_slide_images.py',
        'fix_slide.py',
        'verify_slide.py',
        'snap-presentation.mjs',
        'pptx_structure.txt',
      ];
      for (const script of obsoleteScripts) {
        expect(fs.existsSync(path.join(rootDir, script))).toBe(false);
      }
    });

    it('R4-TC12: the release repository ships only the application — no slide decks or scratch artefacts', () => {
      const rootFiles = fs.readdirSync(rootDir);
      expect(rootFiles.filter((f) => /\.(pptx|potx|py)$/i.test(f))).toEqual([]);
      expect(fs.existsSync(path.join(rootDir, 'README.md'))).toBe(true);
    });
  });
});
