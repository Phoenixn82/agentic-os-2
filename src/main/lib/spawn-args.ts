import type { Engine, RunMode } from '../../shared/types'

// Pure command/argv builders (NO electron / node-child_process import) so they're unit-testable.
// These encode the frozen DERISK PROBE 1/3 spawn shapes.

/** Base64(UTF-16LE) encoding for `powershell -EncodedCommand` — a single token with no spaces
 * or quotes, so it survives re-parsing through `cmd /c start` and wt.exe (the v1 quoting trap). */
export function encodePwsh(command: string): string {
  return Buffer.from(command, 'utf16le').toString('base64')
}

/**
 * Visible terminal: cmd /c start "" wt.exe -d <dir> powershell -NoExit [-EncodedCommand <b64>].
 * `cmd /c start` resolves the wt.exe MSIX alias even from a packaged app; -EncodedCommand
 * avoids all quoting issues with the inner command.
 */
export function visibleArgs(projectDir: string, commandToRun?: string): string[] {
  const base = ['/c', 'start', '', 'wt.exe', '-d', projectDir, 'powershell', '-NoExit']
  if (!commandToRun) return base
  return [...base, '-EncodedCommand', encodePwsh(commandToRun)]
}

/**
 * Headless agent CLI invocation per PROBE 3.
 * Returns { exe, args } for runHeadless. claudeCmd/codexCmd are absolute shim paths
 * (the Claude Desktop app shadows bare `claude` on PATH).
 */
export function sessionHeadlessSpec(
  engine: Engine,
  prompt: string,
  paths: { claudeCmd: string; codexCmd: string; freellmCmd?: string }
): { exe: string; args: string[]; env?: Record<string, string> } {
  if (engine === 'claude') {
    return {
      exe: paths.claudeCmd,
      args: [
        '-p',
        prompt,
        '--model',
        'opus',
        '--fallback-model',
        'sonnet',
        '--output-format',
        'text',
        '--permission-mode',
        'acceptEdits'
      ]
    }
  }
  if (engine === 'codex') {
    // codex exec is non-interactive: --ask-for-approval is a top-level flag only and is rejected
    // by `exec`, so it must be omitted. The workspace-write sandbox is preserved (exec runs
    // autonomously within it; escalations are returned to the model, never prompted).
    return {
      exe: paths.codexCmd,
      args: ['exec', '--skip-git-repo-check', '--sandbox', 'workspace-write', prompt]
    }
  }
  // freellm: the local PowerShell helper drives the router (FreeLLMAPI is OpenAI-compatible).
  return {
    exe: 'powershell.exe',
    args: [
      '-NoProfile',
      '-ExecutionPolicy',
      'Bypass',
      '-File',
      paths.freellmCmd ?? 'freellmapi-chat.ps1',
      '-Task',
      'auto',
      '-Prompt',
      prompt
    ]
  }
}

/** Visible interactive session: open wt.exe and run the engine's interactive CLI (keep-open). */
export function sessionVisibleCommand(
  engine: Engine,
  paths: { claudeCmd: string; codexCmd: string; freellmCmd?: string }
): string {
  if (engine === 'claude') return `& '${paths.claudeCmd}'`
  // --skip-git-repo-check is an exec-only flag; the interactive CLI rejects it. Bare invocation —
  // Use bare invocation only in a visible session the user is actively supervising.
  if (engine === 'codex') return `& '${paths.codexCmd}'`
  return `& '${paths.freellmCmd ?? 'freellmapi-chat.ps1'}' -Task auto`
}

/** A short, filesystem-safe log filename stem for a headless run. */
export function logStem(slug: string, engine: Engine, mode: RunMode, ymdHisLabel: string): string {
  return `${slug}__${engine}__${mode}__${ymdHisLabel}`.replace(/[^a-zA-Z0-9_.-]/g, '-')
}

/** Curation prompt for "Curate a URL" (writes a Video-Curator note in the PROBE 5 format). */
export function curationPrompt(url: string, outDir: string): string {
  return [
    `You are the video-curator. Curate this clip for the user's local workflow: ${url}`,
    `Watch/read it, then write ONE markdown note to "${outDir}" named "<yt|ig>-<id>.md".`,
    `Frontmatter: source: video-curator | source_url: ${url} | captured: <ISO-8601>.`,
    `H1 "# yt:<id>" or "# ig:<shortcode>". H2 sections in order: "## Understand the video",`,
    `"## Compare against the local workflow", "## Routing decision" (one of`,
    `improvements_jsonl|operational_fix|stack_edit|edit_existing_skill|obsidian_vault|no-op),`,
    `"## Actionable extract", "## Confidence + cost notes" (include a line "relevance score: 0.NN").`,
    `Write ONLY that one note file. Do not modify anything else.`
  ].join('\n')
}
