import { colors } from './colors'
import type { VoteTally } from './types'

// Maps a 0–1 score to the existing 5-tier teal gradient
export function getScoreColor(score: number): string {
  if (score >= 0.8) return colors.rank[0]
  if (score >= 0.6) return colors.rank[1]
  if (score >= 0.4) return colors.rank[2]
  if (score >= 0.2) return colors.rank[3]
  return colors.rank[4]
}

// No votes → neutral gray; net positive → teal; net negative → muted red
export function getVoteColor(tally: VoteTally | undefined): string {
  if (!tally || tally.total === 0) return '#d1d5db'
  const ratio = tally.yes / tally.total
  if (ratio >= 0.6) return colors.primary[700]
  if (ratio >= 0.4) return colors.primary[500]
  if (ratio >= 0.2) return colors.accent[500]
  return colors.accent[700]
}
