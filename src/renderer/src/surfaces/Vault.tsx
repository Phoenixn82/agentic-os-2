import { useEffect, useMemo, useState, useCallback } from 'react'
import Markdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { VaultNode } from '@shared/types'
import { api } from '../lib/api'
import {
  fileList,
  buildIndex,
  resolveWiki,
  resolveRelative,
  preprocessWikilinks,
  stripFrontmatter,
  transformUrl
} from '../lib/wikilink'

// --- tree --------------------------------------------------------------------------------------

function TreeNode({
  node,
  selected,
  onSelect,
  depth
}: {
  node: VaultNode
  selected: string
  onSelect: (relPath: string) => void
  depth: number
}): React.JSX.Element {
  const isAncestor = selected === node.relPath || selected.startsWith(node.relPath + '/')
  const [open, setOpen] = useState(depth === 0 || isAncestor)
  useEffect(() => {
    if (isAncestor) setOpen(true)
  }, [isAncestor])

  if (node.type === 'file') {
    return (
      <div
        className={`vfile ${selected === node.relPath ? 'on' : ''}`}
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => onSelect(node.relPath)}
        title={node.relPath}
      >
        {node.name.replace(/\.md$/i, '')}
      </div>
    )
  }
  return (
    <>
      <div
        className="vdir"
        style={{ paddingLeft: 10 + depth * 14 }}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="caret">{open ? '▾' : '▸'}</span> {node.name}
      </div>
      {open &&
        (node.children ?? []).map((c) => (
          <TreeNode key={c.relPath} node={c} selected={selected} onSelect={onSelect} depth={depth + 1} />
        ))}
    </>
  )
}

// --- surface -----------------------------------------------------------------------------------

const DEFAULT_FILE = 'index.md'

export function Vault(): React.JSX.Element {
  const [tree, setTree] = useState<VaultNode | null>(null)
  const [selected, setSelected] = useState<string>(DEFAULT_FILE)
  const [content, setContent] = useState<string>('')
  const [prev, setPrev] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    api.vault
      .tree()
      .then(setTree)
      .catch(() => setTree(null))
  }, [])

  const loadFile = useCallback((relPath: string) => {
    setLoading(true)
    api.vault
      .read(relPath)
      .then((raw) => setContent(raw))
      .catch(() => setContent(`> **Could not open** \`${relPath}\` — it may have been moved or renamed.`))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    loadFile(selected)
  }, [selected, loadFile])

  // Navigate from a link click (records one-step back history).
  const navigate = useCallback(
    (relPath: string) => {
      setPrev(selected)
      setSelected(relPath)
    },
    [selected]
  )

  const index = useMemo(() => buildIndex(tree ? fileList(tree) : []), [tree])
  const currentDir = selected.includes('/') ? selected.slice(0, selected.lastIndexOf('/')) : ''
  const rendered = useMemo(() => preprocessWikilinks(stripFrontmatter(content)), [content])

  const components = useMemo(
    () => ({
      a: ({ href, children }: { href?: string; children?: React.ReactNode }) => {
        if (!href) return <span>{children}</span>
        if (href.startsWith('wiki:')) {
          const target = decodeURIComponent(href.slice(5))
          const hit = resolveWiki(target, index)
          if (hit)
            return (
              <a className="wikilink" onClick={() => navigate(hit)}>
                {children}
              </a>
            )
          return (
            <span className="wikilink dead" title={`unresolved: ${target}`}>
              {children}
            </span>
          )
        }
        if (/^https?:/i.test(href))
          return (
            <a className="exlink" onClick={() => api.openExternal(href)}>
              {children}
            </a>
          )
        const hit = resolveRelative(href, currentDir, index)
        if (hit)
          return (
            <a className="wikilink" onClick={() => navigate(hit)}>
              {children}
            </a>
          )
        return (
          <span className="wikilink dead" title={`unresolved: ${href}`}>
            {children}
          </span>
        )
      }
    }),
    [index, currentDir, navigate]
  )

  return (
    <main>
      <div className="head">
        <h1>Vault</h1>
        <span className="mono faint" style={{ paddingBottom: 6 }}>
          second-brain · read-only
        </span>
      </div>

      <div className="grid wiki">
        <div className="panel wiki-tree">
          {!tree ? (
            <div className="empty">loading vault…</div>
          ) : (
            (tree.children ?? []).map((c) => (
              <TreeNode key={c.relPath} node={c} selected={selected} onSelect={navigate} depth={0} />
            ))
          )}
        </div>

        <div className="panel wiki-body">
          <div className="wiki-crumb">
            {prev && (
              <button
                className="mini"
                onClick={() => {
                  const back = prev
                  setPrev(null)
                  setSelected(back)
                }}
              >
                ← back
              </button>
            )}
            <span className="mono faint">{selected}</span>
          </div>
          {loading ? (
            <div className="empty">loading…</div>
          ) : (
            <div className="md-body">
              <Markdown remarkPlugins={[remarkGfm]} urlTransform={transformUrl} components={components}>
                {rendered}
              </Markdown>
            </div>
          )}
        </div>
      </div>
    </main>
  )
}
