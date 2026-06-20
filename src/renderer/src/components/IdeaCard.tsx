import { useState } from 'react'
import type { IdeaCard as Idea, ApprovalState } from '@shared/types'
import { api } from '../lib/api'
import { cardHeadline } from '../lib/deck'

export function IdeaCardView({
  card,
  state,
  onApprove,
  onOpenDetail
}: {
  card: Idea
  state?: ApprovalState
  onApprove: (s: ApprovalState) => void
  onOpenDetail: () => void
}): React.JSX.Element {
  const [showWhy, setShowWhy] = useState(false)

  if (card.corrupted) {
    return (
      <div className="corrupt">
        ⚠ curator note failed to parse · {card.id} — skipped (raw note unreadable)
      </div>
    )
  }

  const cls =
    state === 'accepted'
      ? 'idea accepted'
      : state === 'skipped' || state === 'off-base'
        ? 'idea skipped'
        : 'idea'

  const isIdTitle = /^(yt|ig):/i.test(card.title)
  const desc = card.summary || card.proposedChange
  const blurb = desc.length > 260 ? desc.slice(0, 260).replace(/\s+\S*$/, '') + '…' : desc

  return (
    <div className={cls} onClick={onOpenDetail} role="button">
      {card.thumbnail ? (
        <img
          className="thumb watchable"
          src={card.thumbnail}
          alt=""
          title={`watch on ${card.sourceLabel}`}
          onClick={(e) => { e.stopPropagation(); if (card.url) api.openExternal(card.url) }}
        />
      ) : (
        <div
          className="thumb placeholder watchable"
          onClick={(e) => { e.stopPropagation(); if (card.url) api.openExternal(card.url) }}
        >
          ▶ watch on {card.sourceLabel}
        </div>
      )}
      <div className="src">
        <span>{card.sourceLabel}</span>
        {card.routingDecision && <span>· {card.routingDecision}</span>}
        {isIdTitle && <span className="idtag mono">{card.title}</span>}
        {card.relevanceScore != null && (
          <span className="score">relevance {card.relevanceScore.toFixed(2)}</span>
        )}
      </div>
      <h3>{cardHeadline(card)}</h3>
      {blurb && <p>{blurb}</p>}
      <div className="acts">
        <button
          className={`mini go ${state === 'accepted' ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onApprove('accepted') }}
        >
          ✓ accept → open as session
        </button>
        <button
          className={`mini ${state === 'skipped' ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onApprove('skipped') }}
        >
          skip
        </button>
        <button
          className={`mini ${state === 'off-base' ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); onApprove('off-base') }}
        >
          way off base
        </button>
        {card.url && (
          <button
            className="mini watch"
            onClick={(e) => { e.stopPropagation(); api.openExternal(card.url) }}
          >
            ↗ watch
          </button>
        )}
        <button
          className="mini teach"
          onClick={(e) => { e.stopPropagation(); api.teachVideo(card.id) }}
        >
          ✎ teach
        </button>
        <button
          className={`mini ${showWhy ? 'on' : ''}`}
          onClick={(e) => { e.stopPropagation(); setShowWhy((v) => !v) }}
        >
          {showWhy ? '▾ why this matters' : '▸ why this matters'}
        </button>
      </div>
      {showWhy && (
        <div className="why-body">
          {card.whyThisMatters || '(no context provided)'}
        </div>
      )}
    </div>
  )
}
