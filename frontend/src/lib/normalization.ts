import type { VoteSite } from './types'

export interface DistanceBounds {
  min: number
  max: number
}

const DIST_FIELDS = [
  'transit_dist',
  'water_infrastructure_dist',
  'city_facility_dist',
  'homeless_service_dist',
] as const

type DistField = typeof DIST_FIELDS[number]

export function computeAllBounds(sites: VoteSite[]): Record<DistField, DistanceBounds> {
  const result = {} as Record<DistField, DistanceBounds>
  for (const field of DIST_FIELDS) {
    const vals = sites.map(s => s[field]).filter(v => v != null && isFinite(v))
    result[field] = {
      min: Math.min(...vals),
      max: Math.max(...vals),
    }
  }
  return result
}

export function normalize(value: number, bounds: DistanceBounds): number {
  if (bounds.max === bounds.min) return 1
  // closer = higher score, so invert
  return 1 - (value - bounds.min) / (bounds.max - bounds.min)
}

export function computeSiteScore(site: VoteSite, allBounds: Record<DistField, DistanceBounds>): number {
  const scores = DIST_FIELDS.map(f => normalize(site[f], allBounds[f]))
  return scores.reduce((a, b) => a + b, 0) / scores.length
}

export function formatDistance(meters: number): string {
  const feet = meters * 3.28084
  if (feet < 5280) return `${Math.round(feet)} ft away`
  return `${(feet / 5280).toFixed(1)} mi away`
}