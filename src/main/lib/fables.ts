import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Fable } from '../../shared/types'
import { FABLES_DIR } from './paths'

// Read-only daily fable. The pick is deterministic per day and keeps no state.

const QUOTES_DIR = join(FABLES_DIR, 'quotes')

/** Local calendar date in YYYY-MM-DD from the system clock. */
function todayLocal(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/** xfnv1a: small deterministic 32-bit string hash (unsigned). */
function xfnv1a(str: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i)
    // 32-bit FNV-1a prime multiply via shifts to stay in int range
    h += (h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24)
  }
  return h >>> 0
}

/** Strip [[wikilink]] brackets and any |alias from a theme token. */
function stripWikilink(s: string): string {
  let t = s.trim()
  if (t.startsWith('[[') && t.endsWith(']]')) t = t.slice(2, -2)
  const pipe = t.indexOf('|')
  if (pipe !== -1) t = t.slice(0, pipe)
  return t.trim()
}

/** Parse a YAML-ish frontmatter block into a flat key -> raw-value-string map. */
function parseFrontmatter(text: string): { fm: Record<string, string>; body: string } {
  const fm: Record<string, string> = {}
  if (!text.startsWith('---')) return { fm, body: text }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { fm, body: text }
  const block = text.slice(3, end)
  const body = text.slice(end + 4)
  for (const rawLine of block.split('\n')) {
    const line = rawLine.replace(/\r$/, '')
    const m = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/)
    if (!m) continue
    fm[m[1]] = m[2]
  }
  return { fm, body }
}

/** Unquote a scalar frontmatter value; '' / null / unquoted empty -> null. */
function scalar(raw: string | undefined): string | null {
  if (raw === undefined) return null
  let v = raw.trim()
  if (v === '' || v === 'null' || v === '~') return null
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
    v = v.slice(1, -1)
  }
  return v === '' ? null : v
}

/** Parse a YAML flow list  ["a", "b"]  into trimmed/unquoted tokens. */
function flowList(raw: string | undefined): string[] {
  if (raw === undefined) return []
  const v = raw.trim()
  if (!v.startsWith('[') || !v.endsWith(']')) return []
  const inner = v.slice(1, -1).trim()
  if (inner === '') return []
  return inner
    .split(',')
    .map((p) => p.trim().replace(/^["']|["']$/g, '').trim())
    .filter((p) => p.length > 0)
}

export function getDailyFable(today: string = todayLocal()): Fable {
  const files = readdirSync(QUOTES_DIR)
    .filter((f) => f.endsWith('.md'))
    .sort()
  if (files.length === 0) throw new Error(`No fables found in ${QUOTES_DIR}`)

  const idx = xfnv1a(today) % files.length
  const picked = files[idx]
  const text = readFileSync(join(QUOTES_DIR, picked), 'utf-8')
  const { fm, body } = parseFrontmatter(text)

  const title = scalar(fm.fable_title) ?? ''

  // memorable_line: frontmatter first, else the body blockquote  > *...*
  let memorableLine = scalar(fm.memorable_line)
  if (!memorableLine) {
    const bq = body.match(/^>\s*\*(.+?)\*\s*$/m)
    if (bq) memorableLine = bq[1].trim()
  }

  // moral: frontmatter first, else the text under a '## Moral' heading
  let moral = scalar(fm.fable_moral)
  if (!moral) {
    const sec = body.match(/^##\s+Moral\s*\n([\s\S]*?)(?:\n##\s|\n*$)/m)
    if (sec) moral = sec[1].trim()
  }

  // theme: combine primary 'theme' + 'secondary_themes', strip wikilinks.
  const themes: string[] = []
  const primary = scalar(fm.theme)
  if (primary) themes.push(stripWikilink(primary))
  for (const t of flowList(fm.secondary_themes)) themes.push(stripWikilink(t))
  const theme = themes.filter((t) => t.length > 0)

  const videoUrl = scalar(fm.video_url)

  return {
    title,
    memorableLine: memorableLine ?? '',
    moral: moral ?? '',
    theme,
    videoUrl
  }
}
