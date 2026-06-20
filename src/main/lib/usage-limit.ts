// Detect a usage/rate/quota-limit message in a headless session log and surface it
// (DERISK PROBE 3c — v1 failed silently on "monthly usage limit"). The exact provider
// string is an open item ("capture on first real exhaustion"), so match likely shapes.
const PATTERNS: RegExp[] = [
  /usage limit/i,
  /rate limit/i,
  /quota (exceeded|reached|limit)/i,
  /monthly (usage )?limit/i,
  /too many requests/i,
  /\b429\b/,
  /you('| ?ha)ve reached your/i,
  /limit reached/i,
  /resets? at/i,
  /insufficient.*credit/i
]

export function detectUsageLimit(logText: string): { hit: boolean; line?: string } {
  for (const raw of logText.split(/\r?\n/)) {
    const line = raw.trim()
    if (line && PATTERNS.some((p) => p.test(line))) return { hit: true, line }
  }
  return { hit: false }
}
