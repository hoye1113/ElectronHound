import { describe, it, expect } from 'vitest';
import {
  SUPPORTED_ELECTRON_VERSIONS,
  ELECTRON_VERSION_RANGE,
  FEATURE_VERSION_MAP,
  ElectronVersionSchema,
  CompatibilityResultSchema,
  parseElectronVersion,
  isFeatureSupported,
  isVersionSupported,
  checkCompatibility,
  getAvailableFeatures,
} from '../electron-compat.js';

// ─── Constants ────────────────────────────────────────────

describe('SUPPORTED_ELECTRON_VERSIONS', () => {
  it('contains expected major versions', () => {
    expect(SUPPORTED_ELECTRON_VERSIONS).toEqual([28, 30, 32, 39]);
  });

  it('is a readonly tuple', () => {
    // Verify it's the expected length
    expect(SUPPORTED_ELECTRON_VERSIONS).toHaveLength(4);
  });
});

describe('ELECTRON_VERSION_RANGE', () => {
  it('has min 28 and max 39', () => {
    expect(ELECTRON_VERSION_RANGE.min).toBe(28);
    expect(ELECTRON_VERSION_RANGE.max).toBe(39);
  });
});

describe('FEATURE_VERSION_MAP', () => {
  it('maps cdp-basic to version 28', () => {
    expect(FEATURE_VERSION_MAP['cdp-basic']).toBe(28);
  });

  it('maps utility-process to version 30', () => {
    expect(FEATURE_VERSION_MAP['utility-process']).toBe(30);
  });

  it('maps web-security-enhanced to version 32', () => {
    expect(FEATURE_VERSION_MAP['web-security-enhanced']).toBe(32);
  });

  it('maps chrome-runtime to version 39', () => {
    expect(FEATURE_VERSION_MAP['chrome-runtime']).toBe(39);
  });

  it('has all expected feature keys', () => {
    const keys = Object.keys(FEATURE_VERSION_MAP);
    expect(keys).toContain('cdp-basic');
    expect(keys).toContain('cdp-target-discovery');
    expect(keys).toContain('browser-window-basics');
    expect(keys).toContain('browser-window-webcontents');
    expect(keys).toContain('process-versions');
    expect(keys).toContain('process-sandbox');
    expect(keys).toContain('protocol-interception');
    expect(keys).toContain('utility-process');
    expect(keys).toContain('web-contents-ip-filters');
    expect(keys).toContain('native-theme-source');
    expect(keys).toContain('web-security-enhanced');
    expect(keys).toContain('session-storage-isolation');
    expect(keys).toContain('chrome-runtime');
  });
});

// ─── parseElectronVersion ─────────────────────────────────

describe('parseElectronVersion', () => {
  it('parses standard version string "32.1.2"', () => {
    const result = parseElectronVersion('32.1.2');
    expect(result).toEqual({
      full: '32.1.2',
      major: 32,
      minor: 1,
      patch: 2,
      isSupported: true,
      isKnownMajor: true,
    });
  });

  it('parses version with v prefix "v30.0.0"', () => {
    const result = parseElectronVersion('v30.0.0');
    expect(result.major).toBe(30);
    expect(result.minor).toBe(0);
    expect(result.patch).toBe(0);
    expect(result.full).toBe('30.0.0');
  });

  it('parses version with pre-release suffix "32.1.0-beta.1"', () => {
    const result = parseElectronVersion('32.1.0-beta.1');
    expect(result.major).toBe(32);
    expect(result.minor).toBe(1);
    expect(result.patch).toBe(0);
    expect(result.full).toBe('32.1.0');
  });

  it('parses version with v prefix and pre-release "v39.0.0-alpha.3"', () => {
    const result = parseElectronVersion('v39.0.0-alpha.3');
    expect(result.major).toBe(39);
    expect(result.full).toBe('39.0.0');
  });

  it('parses single-part version "28"', () => {
    const result = parseElectronVersion('28');
    expect(result.major).toBe(28);
    expect(result.minor).toBe(0);
    expect(result.patch).toBe(0);
    expect(result.full).toBe('28.0.0');
  });

  it('parses two-part version "32.1"', () => {
    const result = parseElectronVersion('32.1');
    expect(result.major).toBe(32);
    expect(result.minor).toBe(1);
    expect(result.patch).toBe(0);
  });

  it('marks version below min as unsupported and not known', () => {
    const result = parseElectronVersion('10.0.0');
    expect(result.isSupported).toBe(false);
    expect(result.isKnownMajor).toBe(false);
  });

  it('marks version above max as unsupported', () => {
    const result = parseElectronVersion('50.0.0');
    expect(result.isSupported).toBe(false);
    expect(result.isKnownMajor).toBe(false);
  });

  it('marks known major version correctly', () => {
    for (const v of SUPPORTED_ELECTRON_VERSIONS) {
      const result = parseElectronVersion(`${v}.0.0`);
      expect(result.isKnownMajor).toBe(true);
      expect(result.isSupported).toBe(true);
    }
  });

  it('marks in-range but unknown major correctly', () => {
    // 29 is in range [28,39] but not in SUPPORTED_ELECTRON_VERSIONS
    const result = parseElectronVersion('29.0.0');
    expect(result.isSupported).toBe(true);
    expect(result.isKnownMajor).toBe(false);
  });

  it('throws on empty string', () => {
    expect(() => parseElectronVersion('')).toThrow('Invalid version string');
  });

  it('throws on version with too many parts', () => {
    expect(() => parseElectronVersion('1.2.3.4')).toThrow('Invalid version string');
  });

  it('throws on non-numeric version', () => {
    expect(() => parseElectronVersion('abc.def.ghi')).toThrow('Invalid version string');
  });
});

// ─── isFeatureSupported ───────────────────────────────────

describe('isFeatureSupported', () => {
  it('returns true for cdp-basic on v28', () => {
    expect(isFeatureSupported('cdp-basic', 28)).toBe(true);
  });

  it('returns true for cdp-basic on v32', () => {
    expect(isFeatureSupported('cdp-basic', 32)).toBe(true);
  });

  it('returns false for cdp-basic on v20', () => {
    expect(isFeatureSupported('cdp-basic', 20)).toBe(false);
  });

  it('returns true for utility-process on v30', () => {
    expect(isFeatureSupported('utility-process', 30)).toBe(true);
  });

  it('returns false for utility-process on v28', () => {
    expect(isFeatureSupported('utility-process', 28)).toBe(false);
  });

  it('returns true for chrome-runtime on v39', () => {
    expect(isFeatureSupported('chrome-runtime', 39)).toBe(true);
  });

  it('returns false for chrome-runtime on v32', () => {
    expect(isFeatureSupported('chrome-runtime', 32)).toBe(false);
  });

  it('returns false for unknown feature', () => {
    expect(isFeatureSupported('nonexistent-feature', 39)).toBe(false);
  });

  it('accepts version string instead of number', () => {
    expect(isFeatureSupported('cdp-basic', '32.1.2')).toBe(true);
    expect(isFeatureSupported('utility-process', '28.0.0')).toBe(false);
  });

  it('accepts version string with v prefix', () => {
    expect(isFeatureSupported('cdp-basic', 'v30.0.0')).toBe(true);
  });

  it('handles boundary: web-security-enhanced requires exactly 32', () => {
    expect(isFeatureSupported('web-security-enhanced', 31)).toBe(false);
    expect(isFeatureSupported('web-security-enhanced', 32)).toBe(true);
    expect(isFeatureSupported('web-security-enhanced', 33)).toBe(true);
  });
});

// ─── isVersionSupported ───────────────────────────────────

describe('isVersionSupported', () => {
  it('returns true for version 28.0.0', () => {
    expect(isVersionSupported('28.0.0')).toBe(true);
  });

  it('returns true for version 39.0.0', () => {
    expect(isVersionSupported('39.0.0')).toBe(true);
  });

  it('returns true for version in range', () => {
    expect(isVersionSupported('35.0.0')).toBe(true);
  });

  it('returns false for version below range', () => {
    expect(isVersionSupported('27.0.0')).toBe(false);
  });

  it('returns false for version above range', () => {
    expect(isVersionSupported('40.0.0')).toBe(false);
  });

  it('handles v prefix', () => {
    expect(isVersionSupported('v32.0.0')).toBe(true);
  });

  it('handles pre-release suffix', () => {
    expect(isVersionSupported('32.0.0-beta.1')).toBe(true);
  });
});

// ─── checkCompatibility ───────────────────────────────────

describe('checkCompatibility', () => {
  it('returns compatible for known version', () => {
    const result = checkCompatibility('32.1.2');
    expect(result.compatible).toBe(true);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
    expect(result.version.major).toBe(32);
    expect(result.version.isKnownMajor).toBe(true);
  });

  it('returns error for version below minimum', () => {
    const result = checkCompatibility('20.0.0');
    expect(result.compatible).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0]).toContain('below the minimum supported version');
    expect(result.errors[0]).toContain('v28');
  });

  it('returns warning for version above maximum', () => {
    const result = checkCompatibility('50.0.0');
    expect(result.compatible).toBe(true); // No errors, just warnings
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('newer than the maximum tested version');
    expect(result.warnings[0]).toContain('v39');
  });

  it('returns warning for in-range but unknown major', () => {
    const result = checkCompatibility('29.0.0');
    expect(result.compatible).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0]).toContain('not a known LTS/stable version');
    expect(result.warnings[0]).toContain('28, 30, 32, 39');
  });

  it('returns no warnings for all known versions', () => {
    for (const v of SUPPORTED_ELECTRON_VERSIONS) {
      const result = checkCompatibility(`${v}.0.0`);
      expect(result.compatible).toBe(true);
      expect(result.warnings).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    }
  });

  it('parses version correctly in result', () => {
    const result = checkCompatibility('v30.5.1');
    expect(result.version.full).toBe('30.5.1');
    expect(result.version.major).toBe(30);
    expect(result.version.minor).toBe(5);
    expect(result.version.patch).toBe(1);
  });
});

// ─── getAvailableFeatures ─────────────────────────────────

describe('getAvailableFeatures', () => {
  it('returns all features for v39 (highest)', () => {
    const features = getAvailableFeatures(39);
    // All features should be available at v39
    expect(features).toContain('cdp-basic');
    expect(features).toContain('utility-process');
    expect(features).toContain('web-security-enhanced');
    expect(features).toContain('chrome-runtime');
    expect(features.length).toBe(Object.keys(FEATURE_VERSION_MAP).length);
  });

  it('returns only v28 features for v28', () => {
    const features = getAvailableFeatures(28);
    expect(features).toContain('cdp-basic');
    expect(features).toContain('browser-window-basics');
    expect(features).not.toContain('utility-process');
    expect(features).not.toContain('web-security-enhanced');
    expect(features).not.toContain('chrome-runtime');
  });

  it('returns v28+v30 features for v30', () => {
    const features = getAvailableFeatures(30);
    expect(features).toContain('cdp-basic');
    expect(features).toContain('utility-process');
    expect(features).toContain('native-theme-source');
    expect(features).not.toContain('web-security-enhanced');
    expect(features).not.toContain('chrome-runtime');
  });

  it('returns v28+v30+v32 features for v32', () => {
    const features = getAvailableFeatures(32);
    expect(features).toContain('cdp-basic');
    expect(features).toContain('utility-process');
    expect(features).toContain('web-security-enhanced');
    expect(features).not.toContain('chrome-runtime');
  });

  it('returns empty array for very old version', () => {
    const features = getAvailableFeatures(10);
    expect(features).toHaveLength(0);
  });

  it('accepts version string', () => {
    const features = getAvailableFeatures('32.1.2');
    expect(features).toContain('web-security-enhanced');
    expect(features).not.toContain('chrome-runtime');
  });

  it('accepts version string with v prefix', () => {
    const features = getAvailableFeatures('v30.0.0');
    expect(features).toContain('utility-process');
  });
});

// ─── Schema validation ────────────────────────────────────

describe('ElectronVersionSchema', () => {
  it('validates a correct version object', () => {
    const result = ElectronVersionSchema.safeParse({
      full: '32.1.2',
      major: 32,
      minor: 1,
      patch: 2,
      isSupported: true,
      isKnownMajor: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative major', () => {
    const result = ElectronVersionSchema.safeParse({
      full: '0.0.0',
      major: -1,
      minor: 0,
      patch: 0,
      isSupported: false,
      isKnownMajor: false,
    });
    expect(result.success).toBe(false);
  });

  it('rejects non-integer major', () => {
    const result = ElectronVersionSchema.safeParse({
      full: '32.1.2',
      major: 32.5,
      minor: 1,
      patch: 2,
      isSupported: true,
      isKnownMajor: true,
    });
    expect(result.success).toBe(false);
  });

  it('rejects missing fields', () => {
    const result = ElectronVersionSchema.safeParse({
      full: '32.1.2',
      major: 32,
    });
    expect(result.success).toBe(false);
  });
});

describe('CompatibilityResultSchema', () => {
  it('validates a correct compatibility result', () => {
    const result = CompatibilityResultSchema.safeParse({
      compatible: true,
      version: {
        full: '32.1.2',
        major: 32,
        minor: 1,
        patch: 2,
        isSupported: true,
        isKnownMajor: true,
      },
      warnings: [],
      errors: [],
    });
    expect(result.success).toBe(true);
  });

  it('validates result with warnings and errors', () => {
    const result = CompatibilityResultSchema.safeParse({
      compatible: false,
      version: {
        full: '20.0.0',
        major: 20,
        minor: 0,
        patch: 0,
        isSupported: false,
        isKnownMajor: false,
      },
      warnings: ['Some warning'],
      errors: ['Some error'],
    });
    expect(result.success).toBe(true);
  });

  it('rejects non-array warnings', () => {
    const result = CompatibilityResultSchema.safeParse({
      compatible: true,
      version: {
        full: '32.0.0',
        major: 32,
        minor: 0,
        patch: 0,
        isSupported: true,
        isKnownMajor: true,
      },
      warnings: 'not an array',
      errors: [],
    });
    expect(result.success).toBe(false);
  });
});
