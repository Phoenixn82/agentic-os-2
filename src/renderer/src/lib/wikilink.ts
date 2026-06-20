import type { VaultNode } from '@shared/types'

// Pure link-resolution logic for the Vault wiki (Track C). No React — unit-tested in node.

/** Flatten the vault tree to the list of file relPaths (POSIX). */
export function fileList(node: VaultNode, out: string[] = []): string[] {
  if (node.type === 'file') out.push(node.relPath)
  for (const c of node.children ?? []) fileList(c, out)
  return out
}

/** Normalize a POSIX path, resolving '.'/'..' segments. Returns null if it escapes above root. */
export function normalizePosix(path: string): string | null {
  const parts = path.split('/')
  const stack: string[] = []
  for (const p of parts) {
    if (p === '' || p === '.') continue
    if (p === '..') {
      if (stack.length === 0) return null
      stack.pop()
    } else stack.push(p)
  }
  return stack.join('/')
}

export interface LinkIndex {
  byPath: Map<string, string> // lower(relPath, with + without .md) -> actual relPath
  byBase: Map<string, string> // lower(basename without .md) -> actual relPath (first wins)
}

export function buildIndex(files: string[]): LinkIndex {
  const byPath = new Map<string, string>()
  const byBase = new Map<string, string>()
  for (const rel of files) {
    const lower = rel.toLowerCase()
    byPath.set(lower, rel)
    byPath.set(lower.replace(/\.md$/, ''), rel)
    const base = (rel.split('/').pop() ?? '').replace(/\.md$/i, '').toLowerCase()
    if (base && !byBase.has(base)) byBase.set(base, rel)
  }
  return { byPath, byBase }
}

/** Resolve an Obsidian-style [[wikilink]] target (note name OR path, possibly with #anchor). */
export function resolveWiki(target: string, idx: LinkIndex): string | null {
  const t = target.split('#')[0].trim().replace(/\\/g, '/').replace(/^\/+/, '')
  if (!t) return null
  const lower = t.toLowerCase()
  return (
    idx.byPath.get(lower) ?? idx.byPath.get(lower.replace(/\.md$/, '')) ?? idx.byBase.get(lower) ?? null
  )
}

/** Resolve a relative markdown link from the directory of the current file. */
export function resolveRelative(href: string, currentDir: string, idx: LinkIndex): string | null {
  const clean = href.split('#')[0].split('?')[0].trim()
  if (!clean || !/\.md$/i.test(clean)) return null
  const joined = normalizePosix(currentDir ? `${currentDir}/${clean}` : clean)
  if (joined === null) return null
  return idx.byPath.get(joined.toLowerCase()) ?? null
}

/**
 * Rewrite [[Target]] / [[Target|Alias]] / [[Target#anchor]] into markdown links with a wiki:
 * scheme (URL-encoded so spaces/slashes survive the markdown parser). The renderer's `a`
 * component resolves the wiki: href back to a vault path.
 */
export function preprocessWikilinks(md: string): string {
  return md.replace(/\[\[([^\]|]+?)(?:\|([^\]]+?))?\]\]/g, (_m, target: string, alias?: string) => {
    const label = (alias ?? target).trim()
    return `[${label}](wiki:${encodeURIComponent(target.trim())})`
  })
}

/** Strip a leading YAML frontmatter block (--- ... ---) so it isn't rendered as body text. */
export function stripFrontmatter(raw: string): string {
  const text = raw.replace(/^﻿/, '')
  if (!/^---\r?\n/.test(text)) return text
  const end = text.indexOf('\n---', 3)
  if (end === -1) return text
  const afterClose = text.indexOf('\n', end + 1)
  return afterClose === -1 ? '' : text.slice(afterClose + 1)
}

/** Only let through schemes we actually handle (every click is intercepted regardless). */
export function transformUrl(url: string): string {
  if (/^(wiki:|https?:|\.|\/|[^:]+\.md)/i.test(url) || !url.includes(':')) return url
  return ''
}
