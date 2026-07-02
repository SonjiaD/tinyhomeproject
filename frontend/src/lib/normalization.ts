import type { VoteSite } from './types'

export interface DistanceBounds {
  min: number
  max: number
}

export const DIST_FIELDS = [
  'transit_dist',
  'water_infrastructure_dist',
  'city_facility_dist',
  'homeless_service_dist',
] as const

// Fields with no OSM equivalent that drive computeSiteScore stay on DIST_FIELDS only, so
// VotePage's composite score is unaffected. These 3 power the SitePanel amenity bars only.
export const DISPLAY_ONLY_FIELDS = [
  'water_fountain_dist',
  'streams_oakland_dist',
  'grocery_dist',
] as const

type DistField = typeof DIST_FIELDS[number]

export function computeAllBounds(
  sites: VoteSite[],
  fields: readonly string[] = DIST_FIELDS,
): Record<string, DistanceBounds> {
  const result: Record<string, DistanceBounds> = {}
  for (const field of fields) {
    const vals = sites
      .map(s => (s as unknown as Record<string, number>)[field])
      .filter(v => v != null && isFinite(v))
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