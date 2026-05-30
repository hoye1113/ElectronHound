import {
  APP_CONTEXT_TRUST_CONFIG,
  TRUST_CONFIGS,
} from '@eata/shared-types';
import type { TrustConfig, TrustLevel } from '@eata/shared-types';

// ============================================================================
// AST Analyzer for execute_main Permission Grading (PR-15)
// ============================================================================
//
// This module performs regex-based static analysis of code strings before
// they are sent to the Electron main process for execution via execute_main.
//
// Design goals:
//   - Cover ~90% of common dangerous patterns with regex (fast, no deps)
//   - Dynamic code execution (eval/new Function) is flagged but documented
//     as fundamentally unblockable by static analysis
//   - Trust levels determine which patterns are blocked vs. merely flagged
//
// Pattern identifiers must match the denied/allowed list entries in the
// trust configs. For example:
//   - 'require'           matches require("fs"), require("child_process"), etc.
//   - 'fs.writeFileSync'  matches specific fs API calls
//   - 'child_process.*'   matches any child_process API (via glob)
//   - 'os.homedir'        matches os.homedir() (matched by 'os.*' glob)
// ============================================================================

/** A single security finding from code analysis */
export interface SecurityFinding {
  /** The pattern that was matched (e.g. 'require', 'child_process.exec') */
  pattern: string;
  /** Human-readable description of the finding */
  description: string;
  /** Whether this finding causes the code to be blocked */
  blocked: boolean;
  /** Optional: the matched text snippet */
  match?: string;
}

/** Result of analyzing a code string against a trust configuration */
export interface SecurityAnalysis {
  /** Whether the code is safe to execute under the given trust config */
  safe: boolean;
  /** List of security findings */
  findings: SecurityFinding[];
  /** The trust level used for this analysis */
  trustLevel: TrustLevel;
}

// ─── Dangerous pattern definitions ──────────────────────────────────────────

interface PatternDef {
  /** Regex to detect the pattern */
  regex: RegExp;
  /** Identifier for this pattern — must match entries in trust config denied/allowed lists */
  pattern: string;
  /** Human-readable description */
  description: string;
}

/**
 * Ordered list of dangerous patterns. Each pattern is checked against the
 * code string; matches that fall within a denied trust config cause the
 * code to be blocked.
 *
 * Pattern identifiers are designed to match the denied list entries in
 * trust configs using exact or glob matching.
 */
const DANGEROUS_PATTERNS: PatternDef[] = [
  // ── Module loading ────────────────────────────────────────────────────────
  {
    regex: /\brequire\s*\(\s*['"]fs['"]\s*\)/g,
    pattern: 'require',
    description: 'Direct require("fs") — filesystem access',
  },
  {
    regex: /\brequire\s*\(\s*['"]child_process['"]\s*\)/g,
    pattern: 'require',
    description: 'require("child_process") — arbitrary command execution',
  },
  {
    regex: /\brequire\s*\(\s*['"]net['"]\s*\)/g,
    pattern: 'require',
    description: 'require("net") — raw TCP socket access',
  },
  {
    regex: /\brequire\s*\(\s*['"]http['"]\s*\)/g,
    pattern: 'require',
    description: 'require("http") — HTTP client/server',
  },
  {
    regex: /\brequire\s*\(\s*['"]https['"]\s*\)/g,
    pattern: 'require',
    description: 'require("https") — HTTPS client/server',
  },
  {
    regex: /\brequire\s*\(\s*['"]dgram['"]\s*\)/g,
    pattern: 'require',
    description: 'require("dgram") — UDP socket access',
  },
  {
    regex: /\brequire\s*\(\s*['"]dns['"]\s*\)/g,
    pattern: 'require',
    description: 'require("dns") — DNS resolution',
  },
  {
    regex: /\brequire\s*\(\s*['"]os['"]\s*\)/g,
    pattern: 'require',
    description: 'require("os") — OS information access',
  },
  {
    regex: /\brequire\s*\(\s*['"]vm['"]\s*\)/g,
    pattern: 'require',
    description: 'require("vm") — V8 virtual machine access',
  },
  {
    regex: /\brequire\s*\(\s*['"]cluster['"]\s*\)/g,
    pattern: 'require',
    description: 'require("cluster") — multi-process forking',
  },

  // ── Filesystem (specific API calls) ───────────────────────────────────────
  {
    regex: /\bfs\.readFileSync\b/g,
    pattern: 'fs.readFileSync',
    description: 'fs.readFileSync — synchronous file read',
  },
  {
    regex: /\bfs\.writeFileSync\b/g,
    pattern: 'fs.writeFileSync',
    description: 'fs.writeFileSync — synchronous file write',
  },
  {
    regex: /\bfs\.unlinkSync\b/g,
    pattern: 'fs.unlinkSync',
    description: 'fs.unlinkSync — synchronous file deletion',
  },
  {
    regex: /\bfs\.rmSync\b/g,
    pattern: 'fs.rmSync',
    description: 'fs.rmSync — synchronous recursive removal',
  },
  {
    regex: /\bfs\.rmdirSync\b/g,
    pattern: 'fs.rmdirSync',
    description: 'fs.rmdirSync — synchronous directory removal',
  },
  {
    regex: /\bfs\.mkdirSync\b/g,
    pattern: 'fs.mkdirSync',
    description: 'fs.mkdirSync — synchronous directory creation',
  },
  {
    regex: /\bfs\.chmodSync\b/g,
    pattern: 'fs.chmodSync',
    description: 'fs.chmodSync — synchronous permission change',
  },
  {
    regex: /\bfs\.renameSync\b/g,
    pattern: 'fs.renameSync',
    description: 'fs.renameSync — synchronous file rename',
  },
  {
    regex: /\bfs\.copyFileSync\b/g,
    pattern: 'fs.copyFileSync',
    description: 'fs.copyFileSync — synchronous file copy',
  },
  {
    regex: /\bfs\.readFile\b/g,
    pattern: 'fs.readFile',
    description: 'fs.readFile — asynchronous file read',
  },
  {
    regex: /\bfs\.writeFile\b/g,
    pattern: 'fs.writeFile',
    description: 'fs.writeFile — asynchronous file write',
  },
  {
    regex: /\bfs\.access\b/g,
    pattern: 'fs.access',
    description: 'fs.access — file existence check',
  },
  {
    regex: /\bfs\.stat\b/g,
    pattern: 'fs.stat',
    description: 'fs.stat — file metadata access',
  },

  // ── Child process ─────────────────────────────────────────────────────────
  {
    regex: /\bchild_process\.exec\b/g,
    pattern: 'child_process.exec',
    description: 'child_process.exec — shell command execution',
  },
  {
    regex: /\bchild_process\.execSync\b/g,
    pattern: 'child_process.execSync',
    description: 'child_process.execSync — synchronous shell execution',
  },
  {
    regex: /\bchild_process\.spawn\b/g,
    pattern: 'child_process.spawn',
    description: 'child_process.spawn — process spawning',
  },
  {
    regex: /\bchild_process\.spawnSync\b/g,
    pattern: 'child_process.spawnSync',
    description: 'child_process.spawnSync — synchronous process spawning',
  },
  {
    regex: /\bchild_process\.fork\b/g,
    pattern: 'child_process.fork',
    description: 'child_process.fork — Node.js process forking',
  },

  // ── Process control ───────────────────────────────────────────────────────
  {
    regex: /\bprocess\.exit\s*\(/g,
    pattern: 'process.exit',
    description: 'process.exit() — terminates the application',
  },
  {
    regex: /\bprocess\.kill\s*\(/g,
    pattern: 'process.kill',
    description: 'process.kill() — sends signals to processes',
  },
  {
    regex: /\bprocess\.env\b/g,
    pattern: 'process.env',
    description: 'process.env access — environment variable leakage',
  },

  // ── Network ───────────────────────────────────────────────────────────────
  {
    regex: /\bnet\.connect\b/g,
    pattern: 'net.connect',
    description: 'net.connect() — outbound TCP connection',
  },
  {
    regex: /\bnet\.createServer\b/g,
    pattern: 'net.createServer',
    description: 'net.createServer() — TCP server creation',
  },
  {
    regex: /\bhttp\.\w+/g,
    pattern: 'http',
    description: 'HTTP API usage (get, request, etc.)',
  },
  {
    regex: /\bhttps\.\w+/g,
    pattern: 'https',
    description: 'HTTPS API usage (get, request, etc.)',
  },

  // ── OS ────────────────────────────────────────────────────────────────────
  {
    regex: /\bos\.homedir\s*\(/g,
    pattern: 'os.homedir',
    description: 'os.homedir() — user home directory disclosure',
  },
  {
    regex: /\bos\.hostname\s*\(/g,
    pattern: 'os.hostname',
    description: 'os.hostname() — machine hostname disclosure',
  },
  {
    regex: /\bos\.userInfo\s*\(/g,
    pattern: 'os.userInfo',
    description: 'os.userInfo() — user account information disclosure',
  },
  {
    regex: /\bos\.networkInterfaces\s*\(/g,
    pattern: 'os.networkInterfaces',
    description: 'os.networkInterfaces() — network interface disclosure',
  },

  // ── VM ────────────────────────────────────────────────────────────────────
  {
    regex: /\bvm\.runInThisContext\b/g,
    pattern: 'vm.runInThisContext',
    description: 'vm.runInThisContext() — executes code in current V8 context',
  },
  {
    regex: /\bvm\.runInNewContext\b/g,
    pattern: 'vm.runInNewContext',
    description: 'vm.runInNewContext() — executes code in a new V8 context',
  },
  {
    regex: /\bvm\.Script\b/g,
    pattern: 'vm.Script',
    description: 'vm.Script — compiles and runs code in V8 virtual machine',
  },

  // ── Dynamic code execution ────────────────────────────────────────────────
  {
    regex: /\beval\s*\(/g,
    pattern: 'eval',
    description: 'eval() — dynamic code execution (fundamentally unblockable by static analysis)',
  },
  {
    regex: /\bnew\s+Function\s*\(/g,
    pattern: 'new Function',
    description: 'new Function() — dynamic function construction',
  },
  {
    regex: /\bimport\s*\(\s*['"][^'"]+['"]\s*\)/g,
    pattern: 'import',
    description: 'Dynamic import() — can load arbitrary modules at runtime',
  },
];

// ─── Core analysis logic ────────────────────────────────────────────────────

/**
 * Check if a pattern name matches any entry in a glob-style list.
 * Supports wildcards like 'fs.*' matching 'fs.readFile', and exact
 * matches like 'process.exit' matching 'process.exit'.
 */
function matchesGlobList(pattern: string, list: string[]): boolean {
  return list.some((glob) => {
    if (glob.endsWith('.*')) {
      const prefix = glob.slice(0, -2);
      return pattern === prefix || pattern.startsWith(prefix + '.');
    }
    return pattern === glob;
  });
}

/**
 * Analyze a code string for dangerous patterns and evaluate it against
 * a trust configuration.
 *
 * @param code - The code string to analyze
 * @param trustConfig - The trust configuration to evaluate against.
 *                      Defaults to `app-context` level if not provided.
 * @returns SecurityAnalysis with safe flag, findings, and trust level
 */
export function analyzeCode(
  code: string,
  trustConfig?: TrustConfig,
): SecurityAnalysis {
  const config = trustConfig ?? APP_CONTEXT_TRUST_CONFIG;
  const level = config.level;
  const defaultsForLevel = TRUST_CONFIGS[level];

  // If a custom denied list is provided, it replaces the defaults.
  // Otherwise, use the defaults for the trust level.
  const effectiveDenied =
    config.denied && config.denied.length > 0
      ? config.denied
      : defaultsForLevel.denied;

  // Allowed list is always additive (user-provided only, no defaults)
  const effectiveAllowed = config.allowed ?? [];

  const findings: SecurityFinding[] = [];
  const seenPatterns = new Set<string>();

  for (const def of DANGEROUS_PATTERNS) {
    // Reset regex lastIndex (we use global flag)
    def.regex.lastIndex = 0;

    const match = def.regex.exec(code);
    if (!match) continue;

    // Deduplicate by pattern to avoid noise from overlapping regexes
    if (seenPatterns.has(def.pattern)) continue;
    seenPatterns.add(def.pattern);

    // Determine if this pattern is blocked at the current trust level
    const isDenied = matchesGlobList(def.pattern, effectiveDenied);
    const isAllowed =
      effectiveAllowed.length > 0 &&
      matchesGlobList(def.pattern, effectiveAllowed);

    // Denied takes precedence over allowed.
    // If allowed list is non-empty, patterns not in it are also blocked.
    const blocked = isDenied || (effectiveAllowed.length > 0 && !isAllowed);

    findings.push({
      pattern: def.pattern,
      description: def.description,
      blocked,
      match: match[0],
    });
  }

  const safe = findings.every((f) => !f.blocked);

  return {
    safe,
    findings,
    trustLevel: level,
  };
}
