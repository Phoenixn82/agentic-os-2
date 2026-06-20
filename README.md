# Agentic OS 2.0

Agentic OS 2.0 is a local-first workflow cockpit built with Electron, React, and TypeScript.
It gives one desktop window for:

- a morning briefing from markdown handoff notes
- a fixed-port local project launcher
- a read-only markdown vault browser
- a video-curator surface for notes produced by your own pipeline

This public version is sanitized and configurable. It does not include private notes, project
names, logs, local paths, credentials, build output, or personal workflow history.

## Configure

By default the app reads from `~/AgenticOS`. Override paths with environment variables:

```bash
AGENTIC_ROOT=C:\path\to\your\workspace
EDITOR_EXE=C:\path\to\your\editor.exe
CLAUDE_CMD=claude
CODEX_CMD=codex
FREELLM_CMD=C:\path\to\freellmapi-chat.ps1
VIDEO_CURATOR_SCRIPT=C:\path\to\curate.py
VIDEO_IMPORT_SCRIPT=C:\path\to\import_saved.py
```

The sample project catalog lives in `src/main/lib/projects.ts`. Replace those entries with
your own local projects and ports.

## Install

```bash
pnpm install
```

## Development

```bash
pnpm dev
```

## Verify

```bash
pnpm typecheck
pnpm build
```
