import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { IdeaCard } from '../../shared/types'
import { CURATOR_DIR } from './paths'

// DERISK PROBE 5 — video-curator parse contract.
// Everything a card shows is scraped from the note BODY (frontmatter has only
// source/source_url/captured). Prose-tolerant + corrupted-note guard: a single
// bad note must never break the batch, and notes with <3 H2 sections OR no
// `# yt:`/`# ig:` H1 render a safe "curator failed" card instead of crashing.

// Known routing labels, longest-first so e.g. `edit_existing_skill` is preferred
// over a bare substring. First label found in the routing body wins.
const ROUTING_LABELS = [
  'improvements_jsonl',
  'edit_existing_skill',
  'operational_fix',
  'obsidian_vault',
  'stack_edit',
  'no-op'
]

interface Frontmatter {
  source_url?: string
  // Optional human-readable fields the (reworked) Gemini-ingest pipeline can write.
  title?: string
  summary?: string
  thumbnail?: string
}

// Best-effort human title from the "Understand the video" summary: prefer the line that
// reads like the core claim/topic (matched on the RAW line, before its label is stripped),
// else the first substantive line. Returns '' if nothing usable.
function deriveTitle(text: string): string {
  const clean = (raw: string): string =>
    raw
      .trim()
      .replace(/^[-*>#•]+\s*/, '') // bullet / heading markers
      .replace(/^\d{1,2}:\d{2}(?:\s*-\s*\d{1,2}:\d{2})?:?\s*/, '') // leading timestamp(s)
      .replace(/^(?:core\s+(?:visible\s+)?claim|summary|topic|tl;?dr|the video|this video)\b\s*[:\-–]\s*/i, '')
      .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '') // wrapping quotes
      .trim()
  const raws = text.split(/\r?\n/).map((r) => r.trim()).filter(Boolean)
  const KW = /\b(claim|about|teach|demonstrat|shows? how|tutorial|walkthrough|how to|build)\b/i
  const ordered = [raws.find((r) => KW.test(r)), ...raws]
  for (const raw of ordered) {
    if (!raw) continue
    const c = clean(raw)
    if (c.length >= 12) return c.length > 100 ? c.slice(0, 100).replace(/\s+\S*$/, '') + '…' : c
  }
  return ''
}

function parseFrontmatter(text: string): { fm: Frontmatter; body: string } {
  const fm: Frontmatter = {}
  // Normalize CRLF → LF first. Notes written on Windows (e.g. the Python curate
  // pipeline) use \r\n; without this the block slice leaves a trailing \r on the
  // LAST frontmatter line and its `(.*)$` capture fails — silently dropping that
  // field (e.g. `thumbnail`, which is written last).
  text = text.replace(/\r\n/g, '\n')
  if (!text.startsWith('---')) return { fm, body: text }
  const end = text.indexOf('\n---', 3)
  if (end === -1) return { fm, body: text }
  const block = text.slice(3, end)
  const body = text.slice(end + 4) // past the closing '\n---'
  for (const line of block.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)\s*:\s*(.*)$/)
    if (m) fm[m[1] as keyof Frontmatter] = m[2].trim()
  }
  return { fm, body }
}

// Pull the body text of an H2 section whose heading starts with `prefix`
// (case-insensitive). Stops at the next H2 or H1. Returns '' if absent.
function extractSection(body: string, prefix: string): string {
  const lines = body.split(/\r?\n/)
  const lower = prefix.toLowerCase()
  let capturing = false
  const out: string[] = []
  for (const line of lines) {
    const h2 = line.match(/^##\s+(.*)$/)
    if (h2) {
      if (capturing) break // next section -> stop
      if (h2[1].trim().toLowerCase().startsWith(lower)) {
        capturing = true
        continue
      }
    } else if (line.match(/^#\s+/) && capturing) {
      break // an H1 also closes the section
    }
    if (capturing) out.push(line)
  }
  return out.join('\n').trim()
}

function extractRouting(routingBody: string): string | null {
  if (!routingBody) return null
  const lower = routingBody.toLowerCase()
  // Prefer a known enum label, earliest in the text.
  let best: { label: string; idx: number } | null = null
  for (const label of ROUTING_LABELS) {
    const idx = lower.indexOf(label)
    if (idx !== -1 && (best === null || idx < best.idx)) best = { label, idx }
  }
  if (best) return best.label
  // Fallback: first label-like token (letters/digits/_/-), stripped of markdown.
  const cleaned = routingBody.replace(/[*`>#]/g, ' ')
  const tok = cleaned.match(/[A-Za-z][A-Za-z0-9_-]*/)
  return tok ? tok[0] : null
}

function parseOne(filename: string, raw: string): IdeaCard {
  const id = filename.replace(/\.md$/i, '')
  const { fm, body } = parseFrontmatter(raw)
  const url = fm.source_url ?? ''

  // H1 must be `# yt:<id>` or `# ig:<shortcode>` specifically (a note can have
  // other H1s like `# Diagnosis (deeper pass)` — ignore those).
  const h1 = body.match(/^#\s+(yt|ig):(\S+)\s*$/im)
  const h2Count = (body.match(/^##\s+/gim) ?? []).length
  const corrupted = !h1 || h2Count < 3

  const sourceLabel: 'youtube' | 'instagram' =
    h1 && h1[1].toLowerCase() === 'ig' ? 'instagram' : 'youtube'

  // title from H1 (opaque id) when present, else filename for corrupted notes.
  const title = h1 ? `${h1[1].toLowerCase()}:${h1[2]}` : id

  const thumbnail =
    fm.thumbnail ??
    (sourceLabel === 'youtube' && h1
      ? `https://img.youtube.com/vi/${h1[2]}/hqdefault.jpg`
      : null)

  if (corrupted) {
    return {
      id,
      sourceLabel,
      url,
      title,
      displayTitle: '',
      summary: '',
      thumbnail,
      relevanceScore: null,
      proposedChange: '',
      whyThisMatters: '',
      routingDecision: null,
      corrupted: true,
      transcript: ''
    }
  }

  const understand = extractSection(body, 'Understand the video')
  const summary = (fm.summary ?? understand) || ''
  const displayTitle = fm.title ?? deriveTitle(summary)
  const proposedChange = extractSection(body, 'Actionable extract')
  const confidence = extractSection(body, 'Confidence + cost')
  const routingBody = extractSection(body, 'Routing decision')
  const transcript = extractSection(body, 'Transcript')

  // Anchor on the words to avoid grabbing a quoted "Gemini 0.95".
  const scoreMatch = confidence.match(/relevance score[:*\s]+([01]?\.\d+)/i)
  const relevanceScore = scoreMatch ? Number(scoreMatch[1]) : null

  return {
    id,
    sourceLabel,
    url,
    title,
    displayTitle,
    summary,
    thumbnail,
    relevanceScore: relevanceScore != null && Number.isFinite(relevanceScore) ? relevanceScore : null,
    proposedChange,
    whyThisMatters: confidence,
    routingDecision: extractRouting(routingBody),
    corrupted: false,
    transcript
  }
}

export function parseCuratorNotes(dir: string = CURATOR_DIR): IdeaCard[] {
  let files: string[]
  try {
    files = readdirSync(dir).filter((f) => /\.md$/i.test(f))
  } catch {
    return []
  }
  files.sort()

  const cards: IdeaCard[] = []
  for (const filename of files) {
    try {
      const raw = readFileSync(join(dir, filename), 'utf-8')
      cards.push(parseOne(filename, raw))
    } catch {
      // One bad note must never break the batch — emit a safe corrupted card.
      const id = filename.replace(/\.md$/i, '')
      cards.push({
        id,
        sourceLabel: id.toLowerCase().startsWith('ig-') ? 'instagram' : 'youtube',
        url: '',
        title: id,
        displayTitle: '',
        summary: '',
        thumbnail: null,
        relevanceScore: null,
        proposedChange: '',
        whyThisMatters: '',
        routingDecision: null,
        corrupted: true,
        transcript: ''
      })
    }
  }
  return cards
}
