import { useState } from 'react'
import type { IdeaCard, ApprovalState } from '@shared/types'
import { cardHeadline } from '../lib/deck'

const TAG: Record<ApprovalState, string> = {
  accepted: 'accepted', skipped: 'skipped', 'off-base': 'way off base'
}

export function ClipList({
  cards,
  approvals,
  onOpenDetail
}: {
  cards: IdeaCard[]
  approvals: Record<string, ApprovalState>
  onOpenDetail: (c: IdeaCard) => void
}): React.JSX.Element {
  const [open, setOpen] = useState(false)
  return (
    <div className="panel cliplist">
      <button className="cliplist-head" onClick={() => setOpen((v) => !v)}>
        {open ? '▾' : '▸'} view all {cards.length} clips
      </button>
      {open &&
        cards.map((c) =>
          c.corrupted ? (
            <div className="corrupt" key={c.id}>⚠ {c.id} — unparseable note</div>
          ) : (
            <div className="clip-row" key={c.id} onClick={() => onOpenDetail(c)} role="button">
              <div className="src mono faint">
                <span>{c.sourceLabel}</span>
                <span>· {c.routingDecision ?? 'unrouted'}</span>
                {c.relevanceScore != null && (
                  <span className="score" style={{ marginLeft: 'auto' }}>
                    {c.relevanceScore.toFixed(2)}
                  </span>
                )}
              </div>
              <div className="clip-title serif">{cardHeadline(c)}</div>
              <div className="clip-prev dim">{(c.summary || c.proposedChange).slice(0, 160)}</div>
              <span className={`clip-tag ${approvals[c.id] ?? 'undecided'}`}>
                {approvals[c.id] ? TAG[approvals[c.id]] : 'undecided'}
              </span>
            </div>
          )
        )}
    </div>
  )
}
