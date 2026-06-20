import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, basename, dirname } from 'node:path'
import type { Briefing, AccomplishedItem, WorkflowChange } from '../../shared/types'
import { VAULT, BRIEFING_WATERMARK } from './paths'

// M4 — briefing compiler with watermark diffing (DERISK PROBE 6). The watermark records the
// newest handoff "seen" at the last compile; the briefing shows the delta newer than it.
// Ordering is by session-date with a filename tiebreak (handoffs share calendar days), so
// HANDOFF_2026-05-28-session4 ranks above -session3 on the same day.

const ACCOMPLISHED_LIMIT = 6
const SKILL_LIMIT = 5
const ERROR_LIMIT = 3
const SKIP_PATTERNS = ['smoke test', 'delete me', 'fabricated']

function shouldSkip(text: string): boolean {
  const lower = text.toLowerCase()
  return SKIP_PATTERNS.some((p) => lower.includes(p))
}

function subdirsIn(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(dir, e.name))
  } catch {
    return []
  }
}

function filesIn(dir: string, pred: (name: string) => boolean): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isFile() && pred(e.name))
      .map((e) => join(dir, e.name))
  } catch {
    return []
  }
}

function readUtf8(path: string): string | null {
  try {
    return readFileSync(path, 'utf-8')
  } catch {
    return null
  }
}

function splitFrontmatter(raw: string): { fm: string; body: string } {
  const text = raw.replace(/^﻿/, '')
  if (!/^---\r?\n/.test(text)) return { fm: '', body: text }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { fm: '', body: text }
  const afterClose = text.indexOf('\n', end + 1)
  const fm = text.slice(0, end)
  const body = afterClose === -1 ? '' : text.slice(afterClose + 1)
  return { fm, body }
}

function fmValue(fm: string, key: string): string {
  const m = fm.match(new RegExp(`^${key}:\\s*(.+)$`, 'm'))
  return m ? m[1].trim() : ''
}

function leadingDate(text: string): string {
  const m = text.match(/\d{4}-\d{2}-\d{2}/)
  return m ? m[0] : ''
}

interface HandoffMeta {
  file: string
  slug: string
  supersedes: string // leading filename token of the handoff this one replaces (forms the chain)
  sessionDate: string
  body: string
}

function collectHandoffs(vaultDir: string): HandoffMeta[] {
  const out: HandoffMeta[] = []
  for (const projDir of subdirsIn(join(vaultDir, 'Projects'))) {
    const slug = basename(projDir)
    // Handoffs live either in a `sessions/` subdir OR at the project root (both conventions
    // are in use — e.g. agentic-os-2 writes HANDOFF_*.md at the project root). Scan both.
    const isHandoff = (n: string): boolean => n.startsWith('HANDOFF_') && n.endsWith('.md')
    for (const handoffPath of [
      ...filesIn(projDir, isHandoff),
      ...filesIn(join(projDir, 'sessions'), isHandoff)
    ]) {
      const raw = readUtf8(handoffPath)
      if (raw === null) continue
      const { fm, body } = splitFrontmatter(raw)
      out.push({
        file: basename(handoffPath),
        slug,
        supersedes: (fmValue(fm, 'supersedes').split(/\s+/)[0] ?? '').trim(),
        sessionDate: leadingDate(fmValue(fm, 'session-date')) || leadingDate(basename(handoffPath)),
        body
      })
    }
  }
  return out
}

// Order newest-first by the supersedes-chain (DERISK PROBE 6: NOT by filename/date — multiple
// handoffs share a calendar day, and the base "HANDOFF_<date>.md" sorts wrong lexically).
// Head = the handoff no other supersedes; follow `supersedes` links down. Off-chain handoffs
// (other projects / orphans) are appended after, by date desc.
function orderedNewestFirst(handoffs: HandoffMeta[]): HandoffMeta[] {
  if (handoffs.length === 0) return []
  const byFile = new Map(handoffs.map((h) => [h.file, h]))
  const superseded = new Set(handoffs.map((h) => h.supersedes).filter(Boolean))
  const heads = handoffs.filter((h) => !superseded.has(h.file))
  const head = heads.length
    ? heads.reduce((b, c) => (c.sessionDate > b.sessionDate ? c : b))
    : handoffs[0]
  const out: HandoffMeta[] = []
  const seen = new Set<string>()
  let cur: HandoffMeta | undefined = head
  while (cur && !seen.has(cur.file)) {
    out.push(cur)
    seen.add(cur.file)
    cur = cur.supersedes ? byFile.get(cur.supersedes) : undefined
  }
  const rest = handoffs
    .filter((h) => !seen.has(h.file))
    .sort((a, b) =>
      a.sessionDate !== b.sessionDate ? (a.sessionDate < b.sessionDate ? 1 : -1) : a.file < b.file ? 1 : -1
    )
  return [...out, ...rest]
}

// Handoffs strictly newer than the watermark file = everything before it in the ordered list.
function newerThanFile(ordered: HandoffMeta[], wmFile: string): HandoffMeta[] {
  if (!wmFile) return ordered
  const idx = ordered.findIndex((h) => h.file === wmFile)
  if (idx === -1) return ordered // watermark file gone → show all (safe default)
  return ordered.slice(0, idx)
}

// Accomplishment-section heading prefixes (matched case-insensitively via startsWith). Real
// handoffs use a wide vocabulary — keep this list aligned with what sessions actually write,
// but never include forward-looking/meta sections (Next, Watch-outs, How to resume, Process
// note, Audit findings, Files changed, Links, Branch state, What upset…).
const ACCOMPLISHED_HEADINGS = [
  'TL;DR',
  'What landed',
  'What was built',
  'What shipped',
  'What got done',
  'What this session settled',
  'What this session',
  'Shipped to prod',
  'Shipped this session',
  'Accomplished',
  'Accomplishments',
  'Highlights'
]

function accomplishedFromHandoff(head: HandoffMeta): AccomplishedItem[] {
  const lines = head.body.split(/\r?\n/)
  let capturing = false
  const items: AccomplishedItem[] = []
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      const title = heading[1].trim()
      const matches = ACCOMPLISHED_HEADINGS.some((h) =>
        title.toLowerCase().startsWith(h.toLowerCase())
      )
      if (matches) {
        if (items.length > 0) break
        capturing = true
        continue
      }
      if (capturing) break
      continue
    }
    if (!capturing) continue
    // Accept both unordered (-/*/+) and ordered (1. / 1)) list items — handoffs use either.
    const bullet = line.match(/^\s*(?:[-*+]|\d{1,3}[.)])\s+(?:\[[ xX]\]\s+)?(.+)$/)
    if (!bullet) continue
    // Drop leading bold/inline-emphasis markers so the briefing row reads as plain prose.
    const text = bullet[1].replace(/\*\*/g, '').trim()
    if (text.length === 0 || shouldSkip(text)) continue
    items.push({ text, tag: head.slug })
    if (items.length >= ACCOMPLISHED_LIMIT) break
  }
  return items
}

const RECENT_ADDITIONS_HEADINGS = ['Recent additions / changes', 'Recent additions']

// Skill bullets '- <date>: <text>' under a Recent-additions heading, dated AFTER the watermark.
function skillsFromState(stateRaw: string, sinceDate: string): WorkflowChange[] {
  const lines = stateRaw.split(/\r?\n/)
  let capturing = false
  const out: WorkflowChange[] = []
  for (const line of lines) {
    const heading = line.match(/^#{1,6}\s+(.*)$/)
    if (heading) {
      capturing = RECENT_ADDITIONS_HEADINGS.some((h) => heading[1].trim().toLowerCase() === h.toLowerCase())
      continue
    }
    if (!capturing) continue
    const dated = line.match(/^\s*[-*+]\s+(\d{4}-\d{2}-\d{2})[^:]*:\s*(.+)$/)
    if (!dated) continue
    const date = dated[1]
    const text = dated[2].trim()
    if (text.length === 0 || shouldSkip(text)) continue
    if (sinceDate && date <= sinceDate) continue
    out.push({ kind: 'skill', text })
  }
  return out
}

// Error entries '## <date> — <title>', dated AFTER the watermark.
function errorsFromFile(errorsRaw: string, sinceDate: string): WorkflowChange[] {
  const out: WorkflowChange[] = []
  for (const line of errorsRaw.split(/\r?\n/)) {
    const m = line.match(/^##\s+(\d{4}-\d{2}-\d{2})\s*[—–-]+\s*(.+)$/)
    if (!m) continue
    const date = m[1]
    const title = m[2].trim()
    if (title.length === 0 || shouldSkip(title)) continue
    if (sinceDate && date <= sinceDate) continue
    out.push({ kind: 'error', text: title })
  }
  return out
}

interface Watermark {
  last_handoff_file: string
  last_handoff_session_date: string
  compiled_at_utc: string
}

function readWatermark(path: string): Watermark | null {
  const raw = readUtf8(path)
  if (raw === null) return null
  try {
    const o = JSON.parse(raw)
    if (o && typeof o === 'object') return o as Watermark
  } catch {
    /* ignore */
  }
  return null
}

function writeWatermark(path: string, wm: Watermark): void {
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, JSON.stringify(wm, null, 2), 'utf-8')
}

// Core: compute the briefing delta given a watermark (file@date). Returns the Briefing plus the
// effective watermark used and the newest handoff (so a compile can advance to it).
function assemble(
  vaultDir: string,
  wmFile: string,
  wmDate: string
): { briefing: Briefing; newest: HandoffMeta | null } {
  const ordered = orderedNewestFirst(collectHandoffs(vaultDir))
  const newest = ordered[0] ?? null

  const sinceHandoffs = newerThanFile(ordered, wmFile)
  const accomplished: AccomplishedItem[] = []
  for (const h of sinceHandoffs) {
    for (const item of accomplishedFromHandoff(h)) {
      if (accomplished.length >= ACCOMPLISHED_LIMIT) break
      accomplished.push(item)
    }
    if (accomplished.length >= ACCOMPLISHED_LIMIT) break
  }

  // Nothing newer than the watermark (e.g. you already compiled and no new handoff has
  // landed since) → fall back to the most recent session that actually has accomplishment
  // bullets, so the panel reflects your latest work instead of going blank.
  if (accomplished.length === 0) {
    for (const h of ordered) {
      for (const item of accomplishedFromHandoff(h)) {
        if (accomplished.length >= ACCOMPLISHED_LIMIT) break
        accomplished.push(item)
      }
      if (accomplished.length > 0) break
    }
  }

  const skills: WorkflowChange[] = []
  for (const mechDir of subdirsIn(join(vaultDir, 'Mechanics'))) {
    const raw = readUtf8(join(mechDir, 'state.md'))
    if (raw) skills.push(...skillsFromState(raw, wmDate))
  }
  const errors: WorkflowChange[] = []
  for (const projDir of subdirsIn(join(vaultDir, 'Projects'))) {
    const raw = readUtf8(join(projDir, 'errors.md'))
    if (raw) errors.push(...errorsFromFile(raw, wmDate))
  }
  const workflow = [...skills.slice(0, SKILL_LIMIT), ...errors.slice(0, ERROR_LIMIT)]

  return {
    briefing: { accomplished, workflow, since: wmDate || null, compiledAt: null },
    newest
  }
}

/**
 * Read-only preview of the briefing delta since the last compile (the watermark).
 * First run (no watermark): seed conceptually to the 2nd-newest handoff so the preview
 * shows only the newest session — but do NOT write the watermark (compile does that).
 */
export function getBriefing(vaultDir: string = VAULT, watermarkPath: string = BRIEFING_WATERMARK): Briefing {
  const wm = readWatermark(watermarkPath)
  if (wm) {
    const { briefing } = assemble(vaultDir, wm.last_handoff_file, wm.last_handoff_session_date)
    briefing.compiledAt = wm.compiled_at_utc || null
    return briefing
  }
  // First run: seed to the 2nd-newest handoff so only the latest session shows.
  const ordered = orderedNewestFirst(collectHandoffs(vaultDir))
  const seed = ordered[1]
  const { briefing } = assemble(vaultDir, seed?.file ?? '', seed?.sessionDate ?? '')
  return briefing
}

/**
 * Compile: compute the delta (same as preview) then ADVANCE the watermark to the newest handoff
 * and stamp the compile time. `nowIso` is injected by the caller (main has the clock).
 */
export function compileBriefing(
  nowIso: string,
  vaultDir: string = VAULT,
  watermarkPath: string = BRIEFING_WATERMARK
): Briefing {
  const wm = readWatermark(watermarkPath)
  let wmFile = wm?.last_handoff_file ?? ''
  let wmDate = wm?.last_handoff_session_date ?? ''
  if (!wm) {
    // First compile: seed to 2nd-newest so this compile reports only the latest session.
    const ordered = orderedNewestFirst(collectHandoffs(vaultDir))
    wmFile = ordered[1]?.file ?? ''
    wmDate = ordered[1]?.sessionDate ?? ''
  }
  const { briefing, newest } = assemble(vaultDir, wmFile, wmDate)
  if (newest) {
    writeWatermark(watermarkPath, {
      last_handoff_file: newest.file,
      last_handoff_session_date: newest.sessionDate,
      compiled_at_utc: nowIso
    })
  }
  briefing.compiledAt = nowIso
  return briefing
}
