import type { IdeaCard, ApprovalState } from '@shared/types'

/** Human headline: the enriched real title, else the derived displayTitle, else the opaque id. */
export function cardHeadline(card: IdeaCard): string {
  if (card.title && !/^(yt|ig):/i.test(card.title)) return card.title
  return card.displayTitle || card.title
}

function compareByRelevance(a: IdeaCard, b: IdeaCard): number {
  const ra = a.relevanceScore ?? -1
  const rb = b.relevanceScore ?? -1
  if (rb !== ra) return rb - ra
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0
}

/**
 * The deck = valid (non-corrupted) cards with no decision yet, ordered by
 * relevance desc (nulls last), ties broken by id ascending. Pure; never mutates.
 */
export function orderDeck(
  cards: IdeaCard[],
  approvals: Record<string, ApprovalState>
): IdeaCard[] {
  return cards
    .filter((c) => !c.corrupted && !approvals[c.id])
    .slice()
    .sort(compareByRelevance)
}

export function orderCuratorHome(
  cards: IdeaCard[],
  approvals: Record<string, ApprovalState>
): IdeaCard[] {
  return cards
    .filter((c) => !c.corrupted)
    .slice()
    .sort((a, b) => {
      const aDecided = Boolean(approvals[a.id])
      const bDecided = Boolean(approvals[b.id])
      if (aDecided !== bDecided) return aDecided ? 1 : -1
      return compareByRelevance(a, b)
    })
}

export function buildCuratorFeed(
  cards: IdeaCard[],
  approvals: Record<string, ApprovalState>
): { videos: IdeaCard[]; corrupted: IdeaCard[]; total: number; decided: number } {
  return {
    videos: orderDeck(cards, approvals),
    corrupted: cards.filter((c) => c.corrupted),
    total: cards.length,
    decided: cards.filter((c) => Boolean(approvals[c.id])).length
  }
}

export function curatorDescription(card: IdeaCard): string {
  const summary = card.summary || '(no ingest summary yet - re-curate this video)'
  const proposed = card.proposedChange || '(no proposed change captured)'
  const impact = card.whyThisMatters || '(no impact notes captured)'

  return [
    'AI summary',
    summary,
    '',
    'Proposed workflow update',
    proposed,
    '',
    'AI read on impact',
    impact
  ].join('\n')
}
