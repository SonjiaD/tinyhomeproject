export interface VoteSite {
  id: string
  lat: number
  lon: number
  address: string
  transit_dist: number
  water_infrastructure_dist: number
  city_facility_dist: number
  homeless_service_dist: number
  grocery_dist: number
  water_fountain_dist: number
  streams_oakland_dist: number
}

export interface VoteTally {
  yes: number
  no: number
  total: number
}

export type VoteCountsMap = Record<string, VoteTally>

export type ColorMode = 'neutral' | 'score' | 'votes'

export interface ParkingPolygon {
  id: string
  parent_id: string
  address: string
  coordinates: [number, number][]  // [lat, lon][] — Leaflet format
  transit_dist: number
  water_infrastructure_dist: number
  city_facility_dist: number
  homeless_service_dist: number
  grocery_dist: number
  water_fountain_dist: number
  streams_oakland_dist: number
}