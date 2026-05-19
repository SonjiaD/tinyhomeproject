import { useEffect, useState } from 'react'
import { ParkingMap } from '../components/ParkingMap'
import { Footer } from '../components/Footer'
import type { ParkingPolygon } from '../lib/types'

export default function PolygonMapPage() {
  const [polygons, setPolygons] = useState<ParkingPolygon[]>([])
  const [totalSpots, setTotalSpots] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    fetch('/parking_polygons.geojson')
      .then(res => {
        if (!res.ok) throw new Error('fetch failed')
        return res.json()
      })
      .then(geojson => {
        const parsed: ParkingPolygon[] = geojson.features.map((f: any) => ({
          id: f.properties.id,
          parent_id: f.properties.parent_id,
          address: f.properties.address,
          transit_dist: f.properties.transit_dist ?? 0,
          water_infrastructure_dist: f.properties.water_infrastructure_dist ?? 0,
          city_facility_dist: f.properties.city_facility_dist ?? 0,
          homeless_service_dist: f.properties.homeless_service_dist ?? 0,
          // GeoJSON stores [lon, lat]; flip to [lat, lon] for Leaflet
          // Rings are now properly closed (last pt == first pt); Leaflet ignores the duplicate
          coordinates: f.geometry.coordinates[0].map(([lon, lat]: [number, number]) => [lat, lon] as [number, number]),
        }))
        setPolygons(parsed)
        setTotalSpots(geojson.total_spots ?? parsed.length)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  return (
    <div className="flex flex-col min-h-screen">
      <section className="bg-primary-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-12">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mb-3">
            Oakland, CA — Street Parking Capacity
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight leading-tight">
            Parking Spot Map
          </h1>
          <p className="mt-3 text-primary-100 max-w-2xl leading-relaxed">
            Each rectangle represents one 30 ft × 10 ft tiny home parking spot, oriented
            parallel to its street. Spots are packed along every eligible block with a 20 ft
            clearance at each end (California Daylighting Law, AB 413).
          </p>
          {!loading && !error && totalSpots > 0 && (
            <div className="mt-6 inline-block bg-primary-800 border border-primary-600 rounded-xl px-6 py-4">
              <p className="text-sm text-primary-200">Estimated capacity</p>
              <p className="text-4xl font-bold text-white">{totalSpots.toLocaleString()}</p>
              <p className="text-sm text-primary-300 mt-1">tiny home spots across Oakland streets</p>
            </div>
          )}
        </div>
      </section>

      <section className="bg-surface-muted py-10 flex-1">
        <div className="max-w-6xl mx-auto px-6">
          {loading && (
            <div className="flex items-center justify-center h-80 text-gray-500 text-sm">
              Loading parking spots…
            </div>
          )}
          {error && (
            <div className="mb-4 px-4 py-3 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium">
                Could not load parking_polygons.geojson from the public folder.
              </p>
            </div>
          )}
          {!loading && !error && polygons.length > 0 && (
            <ParkingMap polygons={polygons} totalSpots={totalSpots} height="620px" />
          )}
        </div>
      </section>

      <Footer />
    </div>
  )
}
