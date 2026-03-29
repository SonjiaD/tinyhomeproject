import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet'
import { getRankColor } from '../lib/colors'

export type RankedSite = {
  lat: number
  lon: number
  rank: number
  final_score: number
}

type UnrankedSite = {
  lat: number
  lon: number
}

interface SiteMapProps {
  sites: RankedSite[] | UnrankedSite[]
  height?: string
  ranked?: boolean
}

function isRankedSite(site: RankedSite | UnrankedSite): site is RankedSite {
  return 'rank' in site
}

const LEGEND_ITEMS = [
  { color: '#1a3a3a', label: 'Top 100' },
  { color: '#2d6363', label: '101–200' },
  { color: '#5a9e9e', label: '201–300' },
  { color: '#a8cec9', label: '301–400' },
  { color: '#dceeed', label: '401–500' },
]

export function SiteMap({ sites, height = '600px', ranked = false }: SiteMapProps) {
  const center: [number, number] = sites.length > 0
    ? [sites[0].lat, sites[0].lon]
    : [37.8044, -122.2712]

  return (
    <div className="relative rounded-xl overflow-hidden border border-border shadow-sm">
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height, width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sites.map((site, idx) => {
          if (ranked && isRankedSite(site)) {
            const color = getRankColor(site.rank)
            return (
              <CircleMarker
                key={site.rank}
                center={[site.lat, site.lon]}
                radius={6}
                pathOptions={{
                  color,
                  fillColor: color,
                  fillOpacity: 0.85,
                  weight: 1.5,
                }}
              >
                <LeafletTooltip direction="top" offset={[0, -8]} opacity={1}>
                  <div className="text-xs">
                    <div className="font-semibold">Rank #{site.rank}</div>
                    <div className="text-gray-600">Score: {site.final_score.toFixed(4)}</div>
                  </div>
                </LeafletTooltip>
              </CircleMarker>
            )
          }
          return (
            <CircleMarker
              key={idx}
              center={[site.lat, site.lon]}
              radius={3.5}
              pathOptions={{
                color: '#2d6363',
                fillColor: '#3d8888',
                fillOpacity: 0.6,
                weight: 1,
              }}
            />
          )
        })}
      </MapContainer>

      {ranked && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg border border-border p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-800 mb-2">Site Ranking</p>
          <div className="space-y-1">
            {LEGEND_ITEMS.map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
