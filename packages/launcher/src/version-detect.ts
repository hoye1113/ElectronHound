import { execFile } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import {
  parseElectronVersion,
  isVersionSupported,
  checkCompatibility,
  type ElectronVersion,
  SUPPORTED_ELECTRON_VERSIONS,
  ELECTRON_VERSION_RANGE,
} from '@eata/shared-types';

/**
 * Options for version detection.
 */
export interface VersionDetectOptions {
  /** Path to the electron binary. If not provided, uses default resolution. */
  electronPath?: string;
  /** Path to the app's node_modules directory. Defaults to process.cwd()/node_modules */
  nodeModulesPath?: string;
}

/**
 * Result of version detection.
 */
export interface VersionDetectResult {
  /** Full version string (e.g., "32.1.2") */
  version: string;
  /** Major version number */
  major: number;
  /** Minor version number */
  minor: number;
  /** Patch version number */
  patch: number;
  /** Where the version was detected from */
  source: 'binary' | 'package-json';
  /** Whether this version is in the supported range */
  isSupported: boolean;
  /** Whether this is a known/supported major version */
  isKnownMajor: boolean;
  /** Warnings about the version */
  warnings: string[];
  /** Errors about the version */
  errors: string[];
}

/**
 * Detect Electron version by running `electron --version`.
 *
 * @param electronPath - Path to the electron binary
 * @returns Parsed version info or null if detection fails
 */
export async function detectElectronVersionFromBinary(
  electronPath: string = 'electron',
): Promise<VersionDetectResult | null> {
  return new Promise((resolve) => {
    execFile(electronPath, ['--version'], { timeout: 5000 }, (error, stdout) => {
      if (error || !stdout.trim()) {
        resolve(null);
        return;
      }

      try {
        const parsed = parseElectronVersion(stdout.trim());
        const compat = checkCompatibility(parsed.full);

        resolve({
          version: parsed.full,
          major: parsed.major,
          minor: parsed.minor,
          patch: parsed.patch,
          source: 'binary',
          isSupported: parsed.isSupported,
          isKnownMajor: parsed.isKnownMajor,
          warnings: compat.warnings,
          errors: compat.errors,
        });
      } catch {
        resolve(null);
      }
    });
  });
}

/**
 * Detect Electron version by reading node_modules/electron/package.json.
 *
 * @param nodeModulesPath - Path to node_modules/electron directory
 * @returns Parsed version info or null if detection fails
 */
export async function detectElectronVersionFromPackageJson(
  nodeModulesPath: string = join(process.cwd(), 'node_modules', 'electron'),
): Promise<VersionDetectResult | null> {
  try {
    const pkgPath = join(nodeModulesPath, 'package.json');
    const content = await readFile(pkgPath, 'utf-8');
    const pkg = JSON.parse(content) as { version?: string };

    if (!pkg.version) {
      return null;
    }

    const parsed = parseElectronVersion(pkg.version);
    const compat = checkCompatibility(parsed.full);

    return {
      version: parsed.full,
      major: parsed.major,
      minor: parsed.minor,
      patch: parsed.patch,
      source: 'package-json',
      isSupported: parsed.isSupported,
      isKnownMajor: parsed.isKnownMajor,
      warnings: compat.warnings,
      errors: compat.errors,
    };
  } catch {
    return null;
  }
}

/**
 * Detect Electron version using multiple strategies.
 * Tries package.json first (faster, no process spawn), then falls back to binary.
 *
 * @param options - Detection options
 * @returns Parsed version info or null if all methods fail
 */
export async function detectElectronVersion(
  options: VersionDetectOptions = {},
): Promise<VersionDetectResult | null> {
  const { electronPath, nodeModulesPath } = options;

  // Try package.json first (faster, doesn't spawn a process)
  const fromPkg = await detectElectronVersionFromPackageJson(nodeModulesPath);
  if (fromPkg) {
    logVersionInfo(fromPkg);
    return fromPkg;
  }

  // Fall back to binary
  const fromBinary = await detectElectronVersionFromBinary(electronPath);
  if (fromBinary) {
    logVersionInfo(fromBinary);
    return fromBinary;
  }

  return null;
}

/**
 * Log version information for debugging.
 * Warns if version is outside supported range.
 */
function logVersionInfo(result: VersionDetectResult): void {
  const prefix = '[launcher][version-detect]';

  if (!result.isSupported) {
    if (result.major < ELECTRON_VERSION_RANGE.min) {
      process.stderr.write(
        `${prefix} WARNING: Electron v${result.major} is below minimum supported version (v${ELECTRON_VERSION_RANGE.min}). ` +
        `Supported versions: ${SUPPORTED_ELECTRON_VERSIONS.join(', ')}\n`,
      );
    } else if (result.major > ELECTRON_VERSION_RANGE.max) {
      process.stderr.write(
        `${prefix} WARNING: Electron v${result.major} is newer than maximum tested version (v${ELECTRON_VERSION_RANGE.max}). ` +
        `Tested versions: ${SUPPORTED_ELECTRON_VERSIONS.join(', ')}\n`,
      );
    }
  } else {
    process.stderr.write(
      `${prefix} Detected Electron v${result.version} (source: ${result.source}) - supported\n`,
    );
  }

  for (const warning of result.warnings) {
    process.stderr.write(`${prefix} WARNING: ${warning}\n`);
  }

  for (const error of result.errors) {
    process.stderr.write(`${prefix} ERROR: ${error}\n`);
  }
}

// Re-export shared-types utilities for convenience
export {
  parseElectronVersion,
  isVersionSupported,
  checkCompatibility,
  type ElectronVersion,
  SUPPORTED_ELECTRON_VERSIONS,
  ELECTRON_VERSION_RANGE,
};
