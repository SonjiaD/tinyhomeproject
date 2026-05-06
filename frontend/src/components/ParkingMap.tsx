import { useState, useCallback } from 'react'
import { MapContainer, TileLayer, Polygon, Tooltip as LeafletTooltip, useMapEvents } from 'react-leaflet'
import type { LatLngBounds } from 'leaflet'
import type { ParkingPolygon } from '../lib/types'

const MIN_ZOOM_FOR_POLYGONS = 14  // only render rectangles when zoomed in enough

interface ParkingMapProps {
  polygons: ParkingPolygon[]
  totalSpots: number
  height?: string
}

function BoundsTracker({
  onUpdate,
}: {
  onUpdate: (bounds: LatLngBounds, zoom: number) => void
}) {
  const map = useMapEvents({
    moveend: () => onUpdate(map.getBounds(), map.getZoom()),
    zoomend: () => onUpdate(map.getBounds(), map.getZoom()),
  })
  return null
}

export function ParkingMap({ polygons, totalSpots, height = '600px' }: ParkingMapProps) {
  const [bounds, setBounds] = useState<LatLngBounds | null>(null)
  const [zoom, setZoom] = useState(13)

  const handleUpdate = useCallback((b: LatLngBounds, z: number) => {
    setBounds(b)
    setZoom(z)
  }, [])

  // Only render polygons that are visible in the current map view and zoom level
  const visible = zoom >= MIN_ZOOM_FOR_POLYGONS && bounds
    ? polygons.filter(p => {
        const [lat, lon] = p.coordinates[0]
        return bounds.contains([lat, lon])
      })
    : []

  return (
    <div className="relative rounded-xl overflow-hidden border border-border shadow-sm">
      <MapContainer
        center={[37.8044, -122.2712]}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height, width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <BoundsTracker onUpdate={handleUpdate} />
        {visible.map(poly => (
          <Polygon
            key={poly.id}
            positions={poly.coordinates}
            pathOptions={{
              color: '#2d6363',
              fillColor: '#3d8888',
              fillOpacity: 0.65,
              weight: 1,
            }}
          >
            <LeafletTooltip direction="top" opacity={1}>
              <span className="text-xs">{poly.address}</span>
            </LeafletTooltip>
          </Polygon>
        ))}
      </MapContainer>

      {/* Legend */}
      <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg border border-border p-3 shadow-sm">
        <p className="text-xs font-semibold text-gray-800">Total capacity</p>
        <p className="text-lg font-bold text-primary-700">{totalSpots.toLocaleString()}</p>
        <p className="text-xs text-gray-500">30 ft × 10 ft spots</p>
      </div>

      {/* Zoom hint */}
      {zoom < MIN_ZOOM_FOR_POLYGONS && (
        <div className="absolute top-4 left-1/2 -translate-x-1/2 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg border border-border px-4 py-2 shadow-sm">
          <p className="text-xs text-gray-600">Zoom in to see individual parking spots</p>
        </div>
      )}
    </div>
  )
}
