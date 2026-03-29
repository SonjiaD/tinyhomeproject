export interface VoteSite {
  id: string
  lat: number
  lon: number
  address: string
  transit_dist: number
  water_infrastructure_dist: number
  city_facility_dist: number
  homeless_service_dist: number
}

export interface VoteTally {
  yes: number
  no: number
  total: number
}

export type VoteCountsMap = Record<string, VoteTally>

export type ColorMode = 'neutral' | 'score' | 'votes'