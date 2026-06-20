import { useRef, useState } from 'react'
import type { IdeaCard, ApprovalState } from '@shared/types'
import { IdeaCardView } from './IdeaCard'

export function CardDeck({
  cards,
  onDecide,
  onOpenDetail
}: {
  cards: IdeaCard[]
  onDecide: (id: string, s: ApprovalState) => void
  onOpenDetail: (c: IdeaCard) => void
}): React.JSX.Element {
  const [leaving, setLeaving] = useState<{ id: string; s: ApprovalState } | null>(null)
  const frontRef = useRef<HTMLDivElement>(null)

  if (cards.length === 0) {
    return <div className="empty">all caught up — curate a URL to add more</div>
  }

  const front = cards[0]
  const peeks = cards.slice(1, 3)

  return (
    <div className="deck">
      {peeks
        .map((c, i) => (
          <div className={`deck-peek p${i + 1}`} key={c.id} aria-hidden>
            <div className="idea ghost">
              <div className="src"><span>{c.sourceLabel}</span></div>
              <h3>{c.title}</h3>
            </div>
          </div>
        ))
        .reverse()}
      <div
        ref={frontRef}
        className={leaving ? 'deck-front leaving' : 'deck-front'}
        onTransitionEnd={(e) => {
          if (leaving && e.target === frontRef.current) {
            onDecide(leaving.id, leaving.s)
            setLeaving(null)
          }
        }}
      >
        <IdeaCardView
          card={front}
          onApprove={(s) => setLeaving({ id: front.id, s })}
          onOpenDetail={() => onOpenDetail(front)}
        />
      </div>
    </div>
  )
}
