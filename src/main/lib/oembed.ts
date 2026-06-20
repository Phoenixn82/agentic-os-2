import { readFileSync } from 'node:fs'
import type { IdeaCard } from '../../shared/types'

// YouTube oEmbed title enrichment for curator idea cards.
// Cards carry an opaque H1-derived title (e.g. "yt:7xuWZ-3lyQE"); when online we
// swap in the real video title. All network work is best-effort and never throws.

const OEMBED_TIMEOUT_MS = 3000

// Session-scoped cache: video id -> resolved real title (or null if it failed/non-ok).
const titleCache = new Map<string, string | null>()
// Session-scoped cache: instagram post url -> { title, image } scraped from og: meta tags.
const igCache = new Map<string, { title: string | null; image: string | null }>()

function decodeEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&#x27;/gi, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
}

// Best-effort Instagram preview: scrape og:image (poster frame) + og:title (caption) from the
// public post page. Uses a crawler UA so IG serves the OpenGraph tags. Never throws.
async function fetchIgMeta(url: string): Promise<{ title: string | null; image: string | null }> {
  if (igCache.has(url)) return igCache.get(url) as { title: string | null; image: string | null }
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS)
  let out: { title: string | null; image: string | null } = { title: null, image: null }
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'User-Agent': 'facebookexternalhit/1.1', Accept: 'text/html' }
    })
    if (res.ok) {
      const html = await res.text()
      const imgM = html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
      const titM = html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
      const image = imgM ? decodeEntities(imgM[1]) : null
      let title = titM ? decodeEntities(titM[1]) : null
      if (title) {
        title = title
          .replace(/^.*?\bon Instagram:\s*/i, '') // drop "Username on Instagram:" prefix
          .replace(/^["'“”]+|["'“”]+$/g, '')
          .trim()
        if (title.length > 100) title = title.slice(0, 100).replace(/\s+\S*$/, '') + '…'
      }
      out = { title: title || null, image }
    }
  } catch {
    out = { title: null, image: null }
  } finally {
    clearTimeout(timer)
  }
  igCache.set(url, out)
  return out
}

export function thumbUrl(kind: 'youtube' | 'instagram', id: string): string | null {
  if (kind === 'youtube') return `https://img.youtube.com/vi/${id}/hqdefault.jpg`
  return null
}

export function oembedUrl(id: string): string {
  const watch = encodeURIComponent('https://www.youtube.com/watch?v=' + id)
  return `https://www.youtube.com/oembed?url=${watch}&format=json`
}

// Recover the CASE-CORRECT YouTube video id. YouTube ids are case-sensitive, but
// card.id is the lowercased filename stem — so prefer the source URL (case-preserved),
// then the thumbnail URL (curator built it from the case-correct H1 id), and only
// fall back to the lowercased filename as a last resort.
function videoIdFromCard(card: IdeaCard): string {
  const u = card.url || ''
  const fromUrl =
    u.match(/[?&]v=([^&]+)/) || u.match(/youtu\.be\/([^?&/]+)/) || u.match(/\/embed\/([^?&/]+)/)
  if (fromUrl) return fromUrl[1]
  if (card.thumbnail) {
    const fromThumb = card.thumbnail.match(/\/vi\/([^/]+)\/hqdefault/)
    if (fromThumb) return fromThumb[1]
  }
  return card.id.replace(/^(yt-|ig-)/, '')
}

// Best-effort single-card fetch. Returns the real title on success, or null on
// any failure (timeout, network error, non-ok status, missing title). Never throws.
async function fetchTitle(id: string): Promise<string | null> {
  if (titleCache.has(id)) return titleCache.get(id) ?? null

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), OEMBED_TIMEOUT_MS)
  let result: string | null = null
  try {
    const res = await fetch(oembedUrl(id), { signal: controller.signal })
    if (res.ok) {
      const data = (await res.json()) as { title?: unknown }
      if (typeof data.title === 'string' && data.title.length > 0) result = data.title
    }
  } catch {
    result = null
  } finally {
    clearTimeout(timer)
  }

  titleCache.set(id, result)
  return result
}

// Pipeline notes set `thumbnail` to a local frame file path. The renderer can't load
// file:// under CSP, so inline the bytes as a data: URL (CSP already allows data:).
// Returns null if the file is missing/unreadable (card falls back to the placeholder).
function localThumbToDataUrl(p: string): string | null {
  try {
    const buf = readFileSync(p)
    const ext = /\.png$/i.test(p) ? 'png' : 'jpeg'
    return `data:image/${ext};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

export async function enrichCards(cards: IdeaCard[]): Promise<IdeaCard[]> {
  return Promise.all(
    cards.map(async (card) => {
      let out = card
      if (!card.corrupted && card.sourceLabel === 'youtube') {
        const title = await fetchTitle(videoIdFromCard(card))
        if (title) out = { ...out, title }
      } else if (!card.corrupted && card.sourceLabel === 'instagram' && card.url) {
        const meta = await fetchIgMeta(card.url)
        if (meta.image && !out.thumbnail) out = { ...out, thumbnail: meta.image }
        if (meta.title) out = { ...out, title: meta.title } // real caption → human headline
      }
      // Inline a local frame-path thumbnail (from the curate pipeline) as a data: URL.
      if (out.thumbnail && !/^(https?:|data:)/i.test(out.thumbnail)) {
        out = { ...out, thumbnail: localThumbToDataUrl(out.thumbnail) }
      }
      return out
    })
  )
}

// Test hook: reset the session caches between cases.
export function _clearOembedCache(): void {
  titleCache.clear()
  igCache.clear()
}
