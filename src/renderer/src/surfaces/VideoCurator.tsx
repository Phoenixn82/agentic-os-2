import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ApprovalState, Engine, IdeaCard } from '@shared/types'
import { LogViewer } from '../components/LogViewer'
import { api } from '../lib/api'
import { buildCuratorFeed, cardHeadline, curatorDescription, orderCuratorHome } from '../lib/deck'
import { useApp } from '../state'

type FeedFilter = 'all' | 'youtube' | 'instagram' | 'high'

const FILTERS: { key: FeedFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'youtube', label: 'YouTube' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'high', label: 'High relevance' }
]

const SOURCE_NAME: Record<IdeaCard['sourceLabel'], string> = {
  youtube: 'YouTube',
  instagram: 'Instagram'
}

const APPROVAL_LABEL: Record<ApprovalState, string> = {
  accepted: 'accepted',
  skipped: 'skipped',
  'off-base': 'off base'
}

function formatScore(score: number | null): string {
  return score == null ? 'unscored' : `${Math.round(score * 100)}% match`
}

function sourceInitial(card: IdeaCard): string {
  return card.sourceLabel === 'youtube' ? 'Y' : 'I'
}

function avatarClass(card: IdeaCard, big = false): string {
  return `yt-avatar ${card.sourceLabel}${big ? ' big' : ''}`
}

function cardSubtitle(card: IdeaCard): string {
  const bits = [SOURCE_NAME[card.sourceLabel]]
  if (card.routingDecision) bits.push(card.routingDecision)
  bits.push(formatScore(card.relevanceScore))
  return bits.join(' · ')
}

function filterVideos(cards: IdeaCard[], filter: FeedFilter): IdeaCard[] {
  if (filter === 'youtube') return cards.filter((c) => c.sourceLabel === 'youtube')
  if (filter === 'instagram') return cards.filter((c) => c.sourceLabel === 'instagram')
  if (filter === 'high') return cards.filter((c) => (c.relevanceScore ?? 0) >= 0.6)
  return cards
}

function resetPageScroll(): void {
  window.scrollTo(0, 0)
  document.scrollingElement?.scrollTo(0, 0)
  document.documentElement.scrollTop = 0
  document.body.scrollTop = 0
}

function VideoThumb({ card, compact = false }: { card: IdeaCard; compact?: boolean }): React.JSX.Element {
  return (
    <div className={compact ? 'yt-thumb compact' : 'yt-thumb'}>
      {card.thumbnail ? <img src={card.thumbnail} alt="" /> : <div className="yt-thumb-empty">{SOURCE_NAME[card.sourceLabel]}</div>}
      <span className="yt-duration">AI</span>
    </div>
  )
}

function VideoCard({
  card,
  state,
  onOpen
}: {
  card: IdeaCard
  state?: ApprovalState
  onOpen: (card: IdeaCard) => void
}): React.JSX.Element {
  return (
    <article
      className="yt-video-card"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(card)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen(card)
        }
      }}
    >
      <VideoThumb card={card} />
      <div className="yt-video-meta">
        <div className={avatarClass(card)}>{sourceInitial(card)}</div>
        <div className="yt-video-copy">
          <h2>{cardHeadline(card)}</h2>
          <div>{cardSubtitle(card)}</div>
          <div>{(card.summary || card.proposedChange || 'No summary captured').slice(0, 96)}</div>
        </div>
        <button className="yt-more" aria-label="More actions" onClick={(e) => e.stopPropagation()}>
          ...
        </button>
      </div>
      {state && <span className={`yt-status ${state}`}>{APPROVAL_LABEL[state]}</span>}
    </article>
  )
}

function HomeFeed({
  cards,
  approvals,
  filter,
  onFilter,
  onOpen
}: {
  cards: IdeaCard[]
  approvals: Record<string, ApprovalState>
  filter: FeedFilter
  onFilter: (filter: FeedFilter) => void
  onOpen: (card: IdeaCard) => void
}): React.JSX.Element {
  const visible = filterVideos(cards, filter)
  return (
    <>
      <div className="yt-chips">
        {FILTERS.map((item) => (
          <button
            key={item.key}
            className={filter === item.key ? 'active' : ''}
            onClick={() => onFilter(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {visible.length === 0 ? (
        <div className="yt-empty">No videos in this filter</div>
      ) : (
        <div className="yt-grid">
          {visible.map((card) => (
            <VideoCard key={card.id} card={card} state={approvals[card.id]} onOpen={onOpen} />
          ))}
        </div>
      )}
    </>
  )
}

function WatchPage({
  card,
  related,
  state,
  onBack,
  onSelect,
  onDecide,
  onOpenOriginal,
  onTeach
}: {
  card: IdeaCard
  related: IdeaCard[]
  state?: ApprovalState
  onBack: () => void
  onSelect: (card: IdeaCard) => void
  onDecide: (id: string, state: ApprovalState) => void
  onOpenOriginal: (card: IdeaCard) => void
  onTeach: (card: IdeaCard) => void
}): React.JSX.Element {
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  return (
    <div className="yt-watch">
      <div className="yt-watch-layout">
        <section className="yt-watch-main">
          <div className="yt-player">
            {card.thumbnail ? <img src={card.thumbnail} alt="" /> : <div className="yt-player-empty">{SOURCE_NAME[card.sourceLabel]}</div>}
            <button className="yt-play" onClick={() => onOpenOriginal(card)} aria-label="Open original video">
              <span />
            </button>
          </div>

          <h1>{cardHeadline(card)}</h1>

          <div className="yt-watch-actions-row">
            <div className="yt-channel">
              <div className={avatarClass(card, true)}>{sourceInitial(card)}</div>
              <div>
                <div className="yt-channel-name">{SOURCE_NAME[card.sourceLabel]} curator</div>
                <div className="yt-channel-sub">{card.routingDecision ?? 'unrouted'} · {formatScore(card.relevanceScore)}</div>
              </div>
              <button
                className={state === 'accepted' ? 'yt-subscribe on' : 'yt-subscribe'}
                onClick={() => onDecide(card.id, 'accepted')}
              >
                Accept + session
              </button>
            </div>

            <div className="yt-actions-row">
              <div className="yt-segment">
                <button
                  className={state === 'skipped' ? 'on' : ''}
                  onClick={() => onDecide(card.id, 'skipped')}
                >
                  Skip
                </button>
                <button
                  className={state === 'off-base' ? 'on' : ''}
                  onClick={() => onDecide(card.id, 'off-base')}
                >
                  Off base
                </button>
              </div>
              <button className="yt-pill-btn" disabled={!card.url} onClick={() => onOpenOriginal(card)}>Open original</button>
              <button className="yt-pill-btn" onClick={() => onTeach(card)}>Teach</button>
              <button className="yt-pill-btn more" aria-label="More curator actions">...</button>
            </div>
          </div>

          <div className="yt-description">
            <div className="yt-description-stats">
              <b>{formatScore(card.relevanceScore)}</b>
              <span>{card.id}</span>
              {state && <span>{APPROVAL_LABEL[state]}</span>}
            </div>
            <pre>{curatorDescription(card)}</pre>
          </div>

          {card.transcript && (
            <div className="yt-transcript">
              <button onClick={() => setTranscriptOpen((v) => !v)}>
                {transcriptOpen ? 'Hide transcript' : 'Show transcript'}
              </button>
              {transcriptOpen && <pre>{card.transcript}</pre>}
            </div>
          )}

          <section className="yt-comments">
            <div className="yt-comments-head">
              <h2>1 Curator note</h2>
              <button>Sort by</button>
            </div>
            <div className="yt-comment-compose">
              <div className={avatarClass(card)}>{sourceInitial(card)}</div>
              <div>AI summary and proposed workflow update are shown above for review.</div>
            </div>
          </section>
        </section>

        <aside className="yt-related" aria-label="Up next">
          <div className="yt-related-ad">
            <div>
              <b>Curator queue</b>
              <span>{related.length} more videos ready for review</span>
            </div>
            <button onClick={onBack}>View all</button>
          </div>
          {related.map((item) => (
            <button key={item.id} className="yt-related-row" onClick={() => onSelect(item)}>
              <VideoThumb card={item} compact />
              <span>
                <b>{cardHeadline(item)}</b>
                <small>{cardSubtitle(item)}</small>
              </span>
            </button>
          ))}
        </aside>
      </div>
    </div>
  )
}

export function VideoCurator(): React.JSX.Element {
  const { showToast } = useApp()
  const searchRef = useRef<HTMLInputElement>(null)
  const [cards, setCards] = useState<IdeaCard[]>([])
  const [approvals, setApprovals] = useState<Record<string, ApprovalState>>({})
  const [selected, setSelected] = useState<IdeaCard | null>(null)
  const [url, setUrl] = useState('')
  const [engine, setEngine] = useState<Engine>('claude')
  const [filter, setFilter] = useState<FeedFilter>('all')
  const [log, setLog] = useState<{ path: string; title: string } | null>(null)

  const loadCards = useCallback(() => {
    api.curator().then(setCards).catch(() => setCards([]))
  }, [])

  const load = useCallback(() => {
    loadCards()
    api.approvals.get().then(setApprovals).catch(() => setApprovals({}))
  }, [loadCards])
  useEffect(load, [load])
  useEffect(() => {
    if (!selected) return
    resetPageScroll()
    requestAnimationFrame(resetPageScroll)
    window.setTimeout(resetPageScroll, 0)
  }, [selected])

  const feed = useMemo(() => buildCuratorFeed(cards, approvals), [cards, approvals])
  const homeVideos = useMemo(() => orderCuratorHome(cards, approvals), [cards, approvals])
  const related = useMemo(
    () => homeVideos.filter((card) => card.id !== selected?.id).slice(0, 10),
    [homeVideos, selected?.id]
  )

  async function setApproval(id: string, state: ApprovalState): Promise<void> {
    await api.approvals.set(id, state)
    setApprovals((map) => ({ ...map, [id]: state }))
    if (state === 'accepted') {
      const r = await api.openSession(id)
      if (r.ok) {
        showToast(`opening "${id}" as a build session${r.pid ? ` · pid ${r.pid}` : ''}`, true)
      } else {
        showToast(`couldn't open session - ${r.error ?? 'unknown error'}`, false)
      }
    }
  }

  async function curate(): Promise<void> {
    if (!url.trim()) return
    const r = await api.curateUrl(url.trim(), engine)
    if (r.ok) {
      showToast(`${r.stub ? 'would run' : 'launched'}${r.pid ? ` · pid ${r.pid}` : ''} - ${r.cmd ?? ''}`, true)
      if (r.logPath) setLog({ path: r.logPath, title: `curate · ${engine}` })
    } else {
      showToast(`failed - ${r.error ?? 'unknown error'}`, false)
    }
    setUrl('')
  }

  async function importSaved(): Promise<void> {
    const r = await api.importSaved()
    if (r.ok) {
      showToast(`searching saved videos${r.pid ? ` · pid ${r.pid}` : ''}`, true)
      if (r.logPath) setLog({ path: r.logPath, title: 'import · saved videos' })
    } else {
      showToast(`import failed - ${r.error ?? 'unknown error'}`, false)
    }
  }

  async function teach(card: IdeaCard): Promise<void> {
    const r = await api.teachVideo(card.id)
    if (r.ok) {
      showToast(`opening teach loop for "${card.id}"${r.pid ? ` · pid ${r.pid}` : ''}`, true)
      if (r.logPath) setLog({ path: r.logPath, title: `teach · ${card.id}` })
    } else {
      showToast(`teach failed - ${r.error ?? 'unknown error'}`, false)
    }
  }

  return (
    <>
      <main className="yt-curator">
        <div className="yt-appbar">
          <button className="yt-menu" aria-label="Menu"><span /></button>
          <button className="yt-wordmark" onClick={() => { setSelected(null); setFilter('all'); resetPageScroll() }}>
            <span className="yt-logo"><span /></span>
            <span>Video Curator</span>
          </button>
          <div className="yt-search-wrap">
            <div className="yt-search">
              <input
                ref={searchRef}
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') curate() }}
                placeholder="Paste a YouTube or Instagram URL"
              />
              <select value={engine} onChange={(e) => setEngine(e.target.value as Engine)}>
                <option value="claude">claude</option>
                <option value="codex">codex</option>
                <option value="freellm">freellm</option>
              </select>
              <button onClick={curate}>Curate</button>
            </div>
            <button className="yt-mic" aria-label="Voice search" />
          </div>
          <div className="yt-top-actions">
            <button className="yt-top-more" aria-label="More">...</button>
            <button className="yt-import" onClick={importSaved}>Import saved</button>
          </div>
        </div>

        {selected ? (
          <WatchPage
            card={selected}
            related={related}
            state={approvals[selected.id]}
            onBack={() => setSelected(null)}
            onSelect={setSelected}
            onDecide={setApproval}
            onOpenOriginal={(card) => card.url && api.openExternal(card.url)}
            onTeach={teach}
          />
        ) : (
          <div className="yt-home">
            <aside className="yt-rail">
              <button className="active" onClick={() => setFilter('all')}><span className="yt-navico home" />Home</button>
              <button onClick={() => setFilter('high')}><span className="yt-navico shorts" />High relevance</button>
              <button onClick={importSaved}><span className="yt-navico subs" />Import saved</button>
              <button onClick={() => searchRef.current?.focus()}><span className="yt-navico you" />Curate URL</button>
              <button><span className="yt-navico history" />Decided {feed.decided}</button>
              <hr />
              <h2>Explore</h2>
              <button onClick={() => setFilter('youtube')}><span className="yt-navico play" />YouTube</button>
              <button onClick={() => setFilter('instagram')}><span className="yt-navico music" />Instagram</button>
              <button onClick={() => setFilter('all')}><span className="yt-navico trend" />Queue {feed.videos.length}</button>
              <hr />
              <h2>More from Curator</h2>
              <button><span className="yt-navico report" />Broken {feed.corrupted.length}</button>
            </aside>
            <section className="yt-feed">
              <HomeFeed
                cards={homeVideos}
                approvals={approvals}
                filter={filter}
                onFilter={setFilter}
                onOpen={setSelected}
              />
              {feed.corrupted.length > 0 && (
                <div className="yt-corrupted">
                  <h2>Unparseable notes</h2>
                  {feed.corrupted.map((card) => (
                    <div key={card.id}>{card.id}</div>
                  ))}
                </div>
              )}
            </section>
          </div>
        )}
      </main>
      {log && (
        <LogViewer
          logPath={log.path}
          title={log.title}
          onClose={() => {
            setLog(null)
            loadCards()
          }}
        />
      )}
    </>
  )
}
