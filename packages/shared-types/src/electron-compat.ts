import { z } from 'zod/v4';

// ============================================================================
// Electron Version Compatibility Matrix (PR-16)
// ============================================================================

/**
 * Supported Electron major versions.
 * Each entry defines the major version and its support status.
 */
export const SUPPORTED_ELECTRON_VERSIONS = [28, 30, 32, 39] as const;

/**
 * Minimum and maximum supported Electron versions.
 */
export const ELECTRON_VERSION_RANGE = {
  min: 28,
  max: 39,
} as const;

/**
 * Feature-to-minimum-version mapping.
 * Each feature requires at least the specified Electron major version.
 */
export const FEATURE_VERSION_MAP: Record<string, number> = {
  // Core CDP features
  'cdp-basic': 28,
  'cdp-target-discovery': 28,

  // BrowserWindow features
  'browser-window-basics': 28,
  'browser-window-webcontents': 28,

  // Process features
  'process-versions': 28,
  'process-sandbox': 28,

  // Protocol features
  'protocol-interception': 28,

  // Advanced features (require newer Electron)
  'utility-process': 30,
  'web-contents-ip-filters': 30,
  'native-theme-source': 30,

  // Security features
  'web-security-enhanced': 32,
  'session-storage-isolation': 32,

  // Latest features (v39+)
  'chrome-runtime': 39,
} as const;

/**
 * Schema for a parsed Electron version.
 */
export const ElectronVersionSchema = z.object({
  /** Full version string (e.g., "32.1.2") */
  full: z.string(),
  /** Major version number */
  major: z.number().int().min(0),
  /** Minor version number */
  minor: z.number().int().min(0),
  /** Patch version number */
  patch: z.number().int().min(0),
  /** Whether this version is in the supported range */
  isSupported: z.boolean(),
  /** Whether this is a known/supported major version */
  isKnownMajor: z.boolean(),
});
export type ElectronVersion = z.infer<typeof ElectronVersionSchema>;

/**
 * Result of a compatibility check.
 */
export const CompatibilityResultSchema = z.object({
  /** Whether the version is compatible */
  compatible: z.boolean(),
  /** The parsed version info */
  version: ElectronVersionSchema,
  /** List of warnings (non-blocking issues) */
  warnings: z.array(z.string()),
  /** List of errors (blocking issues) */
  errors: z.array(z.string()),
});
export type CompatibilityResult = z.infer<typeof CompatibilityResultSchema>;

/**
 * Parse a version string into its components.
 * Accepts formats: "32.1.2", "v32.1.2", "32.1.2-beta.1"
 *
 * @param version - Version string to parse
 * @returns Parsed ElectronVersion object
 * @throws Error if version string is invalid
 */
export function parseElectronVersion(version: string): ElectronVersion {
  // Strip leading 'v' and pre-release suffix
  const cleaned = version.replace(/^v/, '').split('-')[0];
  const parts = cleaned.split('.');

  if (parts.length < 1 || parts.length > 3) {
    throw new Error(`Invalid version string: "${version}"`);
  }

  const major = parseInt(parts[0] ?? '0', 10);
  const minor = parseInt(parts[1] ?? '0', 10);
  const patch = parseInt(parts[2] ?? '0', 10);

  if (isNaN(major) || isNaN(minor) || isNaN(patch)) {
    throw new Error(`Invalid version string: "${version}"`);
  }

  const isSupported = major >= ELECTRON_VERSION_RANGE.min && major <= ELECTRON_VERSION_RANGE.max;
  const isKnownMajor = (SUPPORTED_ELECTRON_VERSIONS as readonly number[]).includes(major);

  return {
    full: `${major}.${minor}.${patch}`,
    major,
    minor,
    patch,
    isSupported,
    isKnownMajor,
  };
}

/**
 * Check if a specific feature is supported by the given Electron version.
 *
 * @param feature - Feature name from FEATURE_VERSION_MAP
 * @param version - Electron version string or major version number
 * @returns true if the feature is supported
 */
export function isFeatureSupported(feature: string, version: string | number): boolean {
  const minVersion = FEATURE_VERSION_MAP[feature];
  if (minVersion === undefined) {
    return false;
  }

  const major = typeof version === 'number'
    ? version
    : parseElectronVersion(version).major;

  return major >= minVersion;
}

/**
 * Check if an Electron version string is within the supported range.
 *
 * @param version - Electron version string (e.g., "32.1.2")
 * @returns true if the version is supported
 */
export function isVersionSupported(version: string): boolean {
  const parsed = parseElectronVersion(version);
  return parsed.isSupported;
}

/**
 * Perform a full compatibility check on an Electron version.
 * Returns warnings for non-supported majors and errors for out-of-range versions.
 *
 * @param version - Electron version string
 * @returns Detailed compatibility result
 */
export function checkCompatibility(version: string): CompatibilityResult {
  const parsed = parseElectronVersion(version);
  const warnings: string[] = [];
  const errors: string[] = [];

  if (!parsed.isSupported) {
    if (parsed.major < ELECTRON_VERSION_RANGE.min) {
      errors.push(
        `Electron v${parsed.major} is below the minimum supported version (v${ELECTRON_VERSION_RANGE.min}). ` +
        'Please upgrade to a supported version.',
      );
    } else if (parsed.major > ELECTRON_VERSION_RANGE.max) {
      warnings.push(
        `Electron v${parsed.major} is newer than the maximum tested version (v${ELECTRON_VERSION_RANGE.max}). ` +
        'Some features may not work as expected.',
      );
    }
  }

  if (parsed.isSupported && !parsed.isKnownMajor) {
    warnings.push(
      `Electron v${parsed.major} is within the supported range but is not a known LTS/stable version. ` +
      `Known versions: ${SUPPORTED_ELECTRON_VERSIONS.join(', ')}.`,
    );
  }

  return {
    compatible: errors.length === 0,
    version: parsed,
    warnings,
    errors,
  };
}

/**
 * Get the list of features available for a given Electron version.
 *
 * @param version - Electron version string or major version number
 * @returns Array of supported feature names
 */
export function getAvailableFeatures(version: string | number): string[] {
  const major = typeof version === 'number'
    ? version
    : parseElectronVersion(version).major;

  return Object.entries(FEATURE_VERSION_MAP)
    .filter(([, minVersion]) => major >= minVersion)
    .map(([feature]) => feature);
}
