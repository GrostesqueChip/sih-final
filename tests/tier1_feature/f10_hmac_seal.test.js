import { describe, it, expect } from 'vitest';
import {
  generateVerificationSeal,
  verifySealSignature,
  canonicalizePayload,
  createTamperProofSeal,
} from '../../server/src/services/cryptoSeal';
import { SAMPLE_INSTRUMENTS, MOCK_OFFICER } from '../helpers/testUtils';

describe('Tier 1: Feature 10 - Cryptographic HMAC-SHA256 Digital Verification Seal Engine', () => {
  const wb = SAMPLE_INSTRUMENTS.WEIGHBRIDGE_60T_CLASS_III;
  const sampleData = {
    certificateNo: 'CERT-2026-WB-9901',
    instrumentId: wb.serialNumber,
    status: 'VERIFIED_LEGAL',
    verificationDate: '2026-08-30T10:00:00.000Z',
    officerId: MOCK_OFFICER.name,
    maxCapacity: wb.maxCapacity,
    verificationInterval: wb.verificationInterval,
  };

  it('F10-TC1: should generate deterministic 64-character SHA-256 hex signature from session metadata', () => {
    const seal = generateVerificationSeal(sampleData);
    expect(typeof seal).toBe('string');
    expect(seal).toHaveLength(64); // 256 bits = 64 hex characters
    expect(/^[0-9a-f]{64}$/.test(seal)).toBe(true);
  });

  it('F10-TC2: should verify authentic signature with constant-time buffer comparison', () => {
    const seal = generateVerificationSeal(sampleData);
    const isValid = verifySealSignature(sampleData, seal);
    expect(isValid).toBe(true);
  });

  it('F10-TC3: should fail verification when any single character of the signature is tampered', () => {
    const seal = generateVerificationSeal(sampleData);
    // Flip first character
    const tamperedSeal = (seal[0] === 'a' ? 'b' : 'a') + seal.substring(1);
    const isValid = verifySealSignature(sampleData, tamperedSeal);
    expect(isValid).toBe(false);
  });

  it('F10-TC4: should detect payload tampering (e.g. altered Max Capacity or Certificate No)', () => {
    const seal = generateVerificationSeal(sampleData);
    
    // Fraudulent payload attempting to alter max capacity or status
    const fraudulentData = {
      ...sampleData,
      maxCapacity: 100000, // Altered from 60,000 to 100,000 kg
    };

    const isValid = verifySealSignature(fraudulentData, seal);
    expect(isValid).toBe(false);
  });

  it('F10-TC5: should create complete tamper-proof certificate seal package with timestamp and standard header', () => {
    const sealPackage = createTamperProofSeal(sampleData);
    expect(sealPackage.algorithm).toBe('HMAC-SHA256');
    expect(sealPackage.sealSignature).toBeDefined();
    expect(sealPackage.canonicalPayload).toContain('CERT-2026-WB-9901');
    expect(sealPackage.standard).toContain('OIML R-76');
  });
});
