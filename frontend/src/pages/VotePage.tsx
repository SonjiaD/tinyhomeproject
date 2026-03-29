import { useEffect, useMemo, useState } from 'react'
import axios from 'axios'
import { VoteMap } from '../components/VoteMap'
import { SitePanel } from '../components/SitePanel'
import { computeAllBounds, computeSiteScore } from '../lib/normalization'
import type { VoteSite, VoteTally, VoteCountsMap, ColorMode } from '../lib/types'

export default function VotePage() {
  const [sites, setSites] = useState<VoteSite[]>([])
  const [voteCounts, setVoteCounts] = useState<VoteCountsMap>({})
  const [colorMode, setColorMode] = useState<ColorMode>('neutral')
  const [selectedSite, setSelectedSite] = useState<VoteSite | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)

  useEffect(() => {
    Promise.all([
      axios.get(`${import.meta.env.VITE_API_URL}/api/default_map`),
      axios.get(`${import.meta.env.VITE_API_URL}/api/votes`),
    ])
      .then(([mapRes, votesRes]) => {
        setSites(mapRes.data.sites)
        setVoteCounts(votesRes.data)
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false))
  }, [])

  const allBounds = useMemo(() => computeAllBounds(sites), [sites])

  const siteScores = useMemo(() => {
    const raw: Record<string, number> = {}
    for (const site of sites) {
      raw[site.id] = computeSiteScore(site, allBounds)
    }
    // Convert to percentile ranks (0 = worst, 1 = best) so color tiers
    // are always evenly distributed regardless of how scores cluster
    const sorted = Object.entries(raw).sort((a, b) => a[1] - b[1])
    const ranks: Record<string, number> = {}
    sorted.forEach(([id], i) => {
      ranks[id] = sorted.length > 1 ? i / (sorted.length - 1) : 1
    })
    return ranks
  }, [sites, allBounds])

  function handleToggle(mode: ColorMode) {
    setColorMode(prev => (prev === mode ? 'neutral' : mode))
  }

  function handleVoteSubmitted(siteId: string, newTally: VoteTally) {
    setVoteCounts(prev => ({ ...prev, [siteId]: newTally }))
  }

  const selectedTally: VoteTally = selectedSite
    ? (voteCounts[selectedSite.id] ?? { yes: 0, no: 0, total: 0 })
    : { yes: 0, no: 0, total: 0 }

  return (
    <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
      {/* Page header */}
      <div className="px-6 py-4 border-b border-border bg-white">
        <h1 className="text-xl font-semibold text-gray-900">Community Vote</h1>
        <p className="text-sm text-gray-500 mt-0.5">
          Click any site to see nearby amenities and vote on whether it would make a good tiny home location.
        </p>
      </div>

      {/* Map area — explicit height so Leaflet renders correctly */}
      <div className="relative" style={{ height: 'calc(100vh - 140px)' }}>
        {/* Layer toggles */}
        <div className="absolute top-3 left-14 z-[1000] flex gap-2">
          <button
            onClick={() => handleToggle('score')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors shadow-sm
              ${colorMode === 'score'
                ? 'bg-primary-700 text-white border-primary-700'
                : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'
              }`}
          >
            Score Layer
          </button>
          <button
            onClick={() => handleToggle('votes')}
            className={`px-3 py-1.5 rounded-md text-sm font-medium border transition-colors shadow-sm
              ${colorMode === 'votes'
                ? 'bg-primary-700 text-white border-primary-700'
                : 'bg-white text-gray-700 border-gray-200 hover:border-primary-400'
              }`}
          >
            Community Votes
          </button>
        </div>

        {/* Loading */}
        {loading && (
          <div className="absolute inset-0 z-[3000] flex items-center justify-center bg-white/90">
            <div className="flex flex-col items-center gap-4 text-center px-6">
              <svg
                className="w-10 h-10 text-primary-700 animate-spin"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
              </svg>
              <div>
                <p className="text-sm font-semibold text-gray-800">Loading Oakland sites…</p>
                <p className="text-xs text-gray-500 mt-1 max-w-xs">
                  The server may be waking up — this can take up to 30 seconds. Thanks for your patience!
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Error */}
        {error && (
          <div className="absolute inset-0 z-[3000] flex items-center justify-center bg-white/80">
            <div className="rounded-md bg-accent-100 border border-accent-500 px-4 py-3 text-sm text-accent-700">
              Failed to load map data. Please refresh and try again.
            </div>
          </div>
        )}

        {!loading && !error && (
          <VoteMap
            sites={sites}
            colorMode={colorMode}
            siteScores={siteScores}
            voteCounts={voteCounts}
            selectedSiteId={selectedSite?.id ?? null}
            onSiteClick={setSelectedSite}
            height="calc(100vh - 140px)"
          />
        )}
      </div>

      {/* Side panel — rendered outside map so it overlays everything */}
      <SitePanel
        site={selectedSite}
        allBounds={allBounds}
        voteTally={selectedTally}
        onClose={() => setSelectedSite(null)}
        onVoteSubmitted={handleVoteSubmitted}
      />
    </div>
  )
}
