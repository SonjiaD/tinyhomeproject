import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet'
import { getScoreColor, getVoteColor } from '../lib/voteColors'
import type { VoteSite, VoteCountsMap, ColorMode } from '../lib/types'

const SCORE_LEGEND = [
  { color: '#1a3a3a', label: 'Highest score' },
  { color: '#2d6363', label: 'High' },
  { color: '#5a9e9e', label: 'Medium' },
  { color: '#a8cec9', label: 'Low' },
  { color: '#dceeed', label: 'Lowest score' },
]

const VOTES_LEGEND = [
  { color: '#2d6363', label: 'Mostly supported' },
  { color: '#3d8888', label: 'Mixed support' },
  { color: '#c96d4f', label: 'Mixed opposition' },
  { color: '#9a4a2f', label: 'Mostly opposed' },
  { color: '#d1d5db', label: 'No votes yet' },
]

interface VoteMapProps {
  sites: VoteSite[]
  colorMode: ColorMode
  siteScores: Record<string, number>
  voteCounts: VoteCountsMap
  selectedSiteId: string | null
  onSiteClick: (site: VoteSite) => void
  height?: string
}

export function VoteMap({
  sites,
  colorMode,
  siteScores,
  voteCounts,
  selectedSiteId,
  onSiteClick,
  height = '100%',
}: VoteMapProps) {
  const center: [number, number] = [37.8044, -122.2712]

  function getDotColor(site: VoteSite): string {
    if (colorMode === 'score') return getScoreColor(siteScores[site.id] ?? 0)
    if (colorMode === 'votes') return getVoteColor(voteCounts[site.id])
    return '#3d8888'
  }

  return (
    <div className="relative w-full" style={{ height }}>
      <MapContainer
        center={center}
        zoom={13}
        scrollWheelZoom={true}
        style={{ height: '100%', width: '100%' }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        {sites.map((site) => {
          const isSelected = site.id === selectedSiteId
          const color = getDotColor(site)
          return (
            <CircleMarker
              key={site.id}
              center={[site.lat, site.lon]}
              radius={isSelected ? 8 : 5}
              pathOptions={{
                color: isSelected ? '#ffffff' : color,
                fillColor: color,
                fillOpacity: isSelected ? 1 : 0.7,
                weight: isSelected ? 2 : 1,
              }}
              eventHandlers={{ click: () => onSiteClick(site) }}
            >
              <LeafletTooltip direction="top" offset={[0, -8]} opacity={1}>
                <span className="text-xs">{site.address || 'Unnamed site'}</span>
              </LeafletTooltip>
            </CircleMarker>
          )
        })}
      </MapContainer>

      {colorMode === 'score' && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg border border-border p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-800 mb-2">Amenity Score</p>
          <div className="space-y-1">
            {SCORE_LEGEND.map(({ color, label }) => (
              <div key={label} className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: color }} />
                <span className="text-xs text-gray-500">{label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {colorMode === 'votes' && (
        <div className="absolute bottom-4 right-4 z-[1000] bg-white/95 backdrop-blur-sm rounded-lg border border-border p-3 shadow-sm">
          <p className="text-xs font-semibold text-gray-800 mb-2">Community Votes</p>
          <div className="space-y-1">
            {VOTES_LEGEND.map(({ color, label }) => (
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
