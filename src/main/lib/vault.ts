import { readdirSync, statSync, readFileSync } from 'node:fs'
import type { Dirent } from 'node:fs'
import { join, relative, resolve, isAbsolute } from 'node:path'
import type { VaultStats, VaultNode } from '../../shared/types'
import { VAULT, INDEX_MD } from './paths'

/** List immediate *.md files in a directory (flat). Returns absolute paths. Missing dir → []. */
function mdFilesIn(dir: string): string[] {
  let entries: Dirent[]
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((e) => e.isFile() && e.name.endsWith('.md'))
    .map((e) => join(dir, e.name))
}

/** List immediate subdirectories of a directory. Returns absolute paths. Missing dir → []. */
function subdirsIn(dir: string): string[] {
  try {
    return readdirSync(dir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => join(dir, e.name))
  } catch {
    return []
  }
}

/** Strip a leading YAML frontmatter block (--- ... ---) if present. */
function stripFrontmatter(raw: string): string {
  // Normalize to handle CRLF; only strip when the very first line is exactly '---'.
  const text = raw.replace(/^﻿/, '')
  if (!/^---\r?\n/.test(text)) return text
  const end = text.indexOf('\n---', 3)
  if (end === -1) return text
  // Advance past the closing '---' line.
  const afterClose = text.indexOf('\n', end + 1)
  return afterClose === -1 ? '' : text.slice(afterClose + 1)
}

export function getVaultStats(vaultDir: string = VAULT, indexMd: string = INDEX_MD): VaultStats {
  // --- Enumerate the four axes narrowly (no recursive glob over the tree). ---
  const actionFiles = mdFilesIn(join(vaultDir, 'Actions'))
  const mechanicsSubdirs = subdirsIn(join(vaultDir, 'Mechanics'))
  const devRegistryFiles = mdFilesIn(join(vaultDir, 'dev-registry'))

  // Projects: bounded walk (depth ~2) — immediate subfolders + their *.md files.
  const projectFiles: string[] = []
  for (const sub of subdirsIn(join(vaultDir, 'Projects'))) {
    projectFiles.push(...mdFilesIn(sub))
  }

  const counts = {
    Actions: actionFiles.length,
    Mechanics: mechanicsSubdirs.length,
    Projects: projectFiles.length,
    'dev-registry': devRegistryFiles.length,
  }

  // --- Recent: stat every enumerated *.md, top 8 by mtimeMs desc. ---
  const allMd = [...actionFiles, ...devRegistryFiles, ...projectFiles]
  const recent = allMd
    .map((abs) => {
      try {
        return { path: relative(vaultDir, abs), mtimeMs: statSync(abs).mtimeMs }
      } catch {
        return null
      }
    })
    .filter((r): r is { path: string; mtimeMs: number } => r !== null)
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .slice(0, 8)

  // --- indexLead: read index.md, strip frontmatter, take first ~400 chars. ---
  let indexLead = ''
  try {
    indexLead = stripFrontmatter(readFileSync(indexMd, 'utf-8')).trimStart().slice(0, 400)
  } catch {
    indexLead = ''
  }

  return { counts, recent, indexLead }
}

// --- Vault wiki (Track C) -------------------------------------------------------------------

// Bounded so a stray deep/recursive structure can never hang the walk. The real vault tops out
// around Projects/<slug>/sessions/<file> (depth 3); 6 is generous headroom.
const TREE_MAX_DEPTH = 6
// Noise never worth showing in a knowledge wiki.
const SKIP_DIRS = new Set(['.git', '.obsidian', 'node_modules', '.trash'])

/** Recursive dir+`.md` listing, directories first then files, each level alpha-sorted. */
function walk(absDir: string, relDir: string, depth: number): VaultNode[] {
  if (depth > TREE_MAX_DEPTH) return []
  let entries: Dirent[]
  try {
    entries = readdirSync(absDir, { withFileTypes: true })
  } catch {
    return []
  }
  const dirs: VaultNode[] = []
  const files: VaultNode[] = []
  for (const e of entries) {
    if (e.name.startsWith('.')) continue
    const relPath = relDir ? `${relDir}/${e.name}` : e.name
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      const children = walk(join(absDir, e.name), relPath, depth + 1)
      // Prune directories with no markdown anywhere beneath them — keeps the tree signal-dense.
      if (children.length > 0) dirs.push({ name: e.name, relPath, type: 'dir', children })
    } else if (e.isFile() && e.name.toLowerCase().endsWith('.md')) {
      files.push({ name: e.name, relPath, type: 'file' })
    }
  }
  dirs.sort((a, b) => a.name.localeCompare(b.name))
  files.sort((a, b) => a.name.localeCompare(b.name))
  return [...dirs, ...files]
}

/** Browsable tree of the vault (dirs + `.md` files). Root node has relPath '' and type 'dir'. */
export function vaultTree(vaultDir: string = VAULT): VaultNode {
  return { name: 'second-brain', relPath: '', type: 'dir', children: walk(vaultDir, '', 1) }
}

/**
 * Read one vault markdown file by its POSIX relPath. Path-contained: the resolved target must
 * stay inside the vault root and be a `.md` file — `..`, absolute paths, and anything escaping
 * the root are rejected. Throws on violation or read failure.
 */
export function vaultRead(relPath: string, vaultDir: string = VAULT): string {
  if (typeof relPath !== 'string' || relPath.length === 0) throw new Error('empty vault path')
  if (isAbsolute(relPath) || /^[A-Za-z]:[\\/]/.test(relPath)) throw new Error('absolute vault path rejected')
  const root = resolve(vaultDir)
  const target = resolve(root, relPath)
  const rel = relative(root, target)
  if (rel === '' || rel.startsWith('..') || isAbsolute(rel)) throw new Error('vault path escapes root')
  if (!target.toLowerCase().endsWith('.md')) throw new Error('not a markdown file')
  return readFileSync(target, 'utf-8')
}
