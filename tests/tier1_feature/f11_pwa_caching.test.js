import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

describe('Tier 1: Feature 11 - Offline PWA & Service Worker Caching Infrastructure', () => {
  const manifestPath = path.resolve(__dirname, '../../client/public/manifest.json');
  const swPath = path.resolve(__dirname, '../../client/public/sw.js');

  it('F11-TC1: should contain valid W3C Web App Manifest with standalone display and theme color', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

    expect(content.name).toContain('NAWI-ReportPro');
    expect(content.short_name).toBe('NAWI-ReportPro');
    expect(content.display).toBe('standalone');
    expect(content.start_url).toBe('/');
    expect(content.theme_color).toBe('#1e3a5f');
    expect(content.background_color).toBe('#ffffff');
  });

  it('F11-TC2: should specify high-resolution maskable icons in manifest for mobile installation', () => {
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(content.icons).toBeInstanceOf(Array);
    expect(content.icons.length).toBeGreaterThanOrEqual(2);
    
    const icon192 = content.icons.find(i => i.sizes === '192x192');
    const icon512 = content.icons.find(i => i.sizes === '512x512');
    expect(icon192).toBeDefined();
    expect(icon512).toBeDefined();
    expect(icon512.purpose).toContain('maskable');
  });

  it('F11-TC3: should include shortcut actions in manifest for quick test session creation', () => {
    const content = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    expect(content.shortcuts).toBeInstanceOf(Array);
    const newTestShortcut = content.shortcuts.find(s => s.url === '/tests/new');
    expect(newTestShortcut).toBeDefined();
    expect(newTestShortcut.name).toContain('New Test');
  });

  it('F11-TC4: should contain Service Worker with CacheFirst and NetworkFirst routing strategies', () => {
    expect(fs.existsSync(swPath)).toBe(true);
    const swContent = fs.readFileSync(swPath, 'utf8');

    expect(swContent).toContain('addEventListener(\'install\'');
    expect(swContent).toContain('addEventListener(\'activate\'');
    expect(swContent).toContain('addEventListener(\'fetch\'');
    expect(swContent).toContain('STATIC_CACHE');
    expect(swContent).toContain('RUNTIME_CACHE');
  });

  it('F11-TC5: should provide fallback handling in Service Worker when offline network fails', () => {
    const swContent = fs.readFileSync(swPath, 'utf8');
    expect(swContent).toContain('caches.match');
    expect(swContent).toContain('skipWaiting');
  });
});
