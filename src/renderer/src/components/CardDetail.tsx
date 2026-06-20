import { useEffect, useState } from 'react'
import type { IdeaCard, ApprovalState } from '@shared/types'
import { api } from '../lib/api'
import { cardHeadline } from '../lib/deck'

export function CardDetail({
  card,
  state,
  onDecide,
  onClose
}: {
  card: IdeaCard
  state?: ApprovalState
  onDecide: (id: string, s: ApprovalState) => void
  onClose: () => void
}): React.JSX.Element {
  const [transcriptOpen, setTranscriptOpen] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal carddetail" onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <span className="label">{card.sourceLabel}</span>
          {card.routingDecision && <span className="mono faint">· {card.routingDecision}</span>}
          {card.relevanceScore != null && (
            <span className="score mono" style={{ marginLeft: 'auto' }}>
              relevance {card.relevanceScore.toFixed(2)}
            </span>
          )}
          <button className="mini" style={{ marginLeft: 12 }} onClick={onClose}>close</button>
        </div>
        {card.thumbnail && <img className="thumb" src={card.thumbnail} alt="" />}
        <h2 className="serif" style={{ fontSize: 26, margin: '4px 0 2px' }}>{cardHeadline(card)}</h2>
        {/^(yt|ig):/i.test(card.title) && (
          <div className="mono faint" style={{ fontSize: 11, marginBottom: 10 }}>{card.title}</div>
        )}
        <div className="detail-body">
          <h3 className="label">what this video is about</h3>
          <p className="dim" style={{ whiteSpace: 'pre-wrap' }}>{card.summary || '(no ingest summary — re-curate with the new pipeline)'}</p>
          <h3 className="label">actionable extract</h3>
          <p className="dim" style={{ whiteSpace: 'pre-wrap' }}>{card.proposedChange || '(none)'}</p>
          <h3 className="label">why this matters · confidence + cost</h3>
          <p className="dim" style={{ whiteSpace: 'pre-wrap' }}>{card.whyThisMatters || '(none)'}</p>
          {card.transcript && (
            <>
              <h3
                className="label"
                style={{ cursor: 'pointer', userSelect: 'none' }}
                onClick={() => setTranscriptOpen((v) => !v)}
              >
                {transcriptOpen ? '▾' : '▸'} transcript
              </h3>
              {transcriptOpen && (
                <div
                  className="dim"
                  style={{
                    whiteSpace: 'pre-wrap',
                    maxHeight: 320,
                    overflowY: 'auto',
                    fontSize: 12,
                    lineHeight: 1.5,
                    background: 'rgba(0,0,0,0.15)',
                    padding: '8px 10px',
                    borderRadius: 4
                  }}
                >
                  {card.transcript}
                </div>
              )}
            </>
          )}
        </div>
        <div className="acts" style={{ marginTop: 14 }}>
          <button
            className={`mini go ${state === 'accepted' ? 'on' : ''}`}
            onClick={() => { onDecide(card.id, 'accepted'); onClose() }}
          >
            ✓ accept → open as session
          </button>
          <button
            className={`mini ${state === 'skipped' ? 'on' : ''}`}
            onClick={() => { onDecide(card.id, 'skipped'); onClose() }}
          >
            skip
          </button>
          <button
            className={`mini ${state === 'off-base' ? 'on' : ''}`}
            onClick={() => { onDecide(card.id, 'off-base'); onClose() }}
          >
            way off base
          </button>
        </div>
        <div className="modal-foot">
          <button
            className="btn ghost"
            disabled={!card.url}
            onClick={() => card.url && api.openExternal(card.url)}
          >
            open original ▶
          </button>
          <button
            className="btn ghost"
            style={{ marginLeft: 8 }}
            onClick={() => api.teachVideo(card.id)}
          >
            ✎ teach
          </button>
        </div>
      </div>
    </div>
  )
}
