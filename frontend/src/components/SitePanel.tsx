import { useState } from 'react'
import axios from 'axios'
import { formatDistance, normalize } from '../lib/normalization'
import type { VoteSite, VoteTally } from '../lib/types'
import type { DistanceBounds } from '../lib/normalization'

interface AmenityBarProps {
  label: string
  rawMeters: number
  bounds: DistanceBounds
}

function AmenityBar({ label, rawMeters, bounds }: AmenityBarProps) {
  const fill = normalize(rawMeters, bounds)
  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-xs font-medium text-gray-700">{label}</span>
        <span className="text-xs text-gray-400">{formatDistance(rawMeters)}</span>
      </div>
      <div className="w-full bg-gray-100 rounded-full h-2">
        <div
          className="h-2 rounded-full bg-primary-700 transition-all duration-300"
          style={{ width: `${Math.round(fill * 100)}%` }}
        />
      </div>
    </div>
  )
}

interface SitePanelProps {
  site: VoteSite | null
  allBounds: Record<string, DistanceBounds>
  voteTally: VoteTally
  onClose: () => void
  onVoteSubmitted: (siteId: string, newTally: VoteTally) => void
}

export function SitePanel({ site, allBounds, voteTally, onClose, onVoteSubmitted }: SitePanelProps) {
  const [comment, setComment] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [voted, setVoted] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [svError, setSvError] = useState(false)

  const isOpen = site !== null

  async function handleVote(support: boolean) {
    if (!site) return
    setSubmitting(true)
    setError(null)

    // Optimistic update
    const newTally: VoteTally = {
      yes: voteTally.yes + (support ? 1 : 0),
      no: voteTally.no + (support ? 0 : 1),
      total: voteTally.total + 1,
    }
    onVoteSubmitted(site.id, newTally)

    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/votes`, {
        site_id: site.id,
        support,
        comment: comment.trim() || null,
      })
      setVoted(true)
    } catch {
      setError('Failed to save your vote. Please try again.')
      // Roll back optimistic update
      onVoteSubmitted(site.id, voteTally)
    } finally {
      setSubmitting(false)
    }
  }

  // Reset vote state when a new site is selected
  const [lastSiteId, setLastSiteId] = useState<string | null>(null)
  if (site && site.id !== lastSiteId) {
    setLastSiteId(site.id)
    setVoted(false)
    setComment('')
    setError(null)
    setSvError(false)
  }

  return (
    <div
      className={`fixed right-0 top-0 h-full w-80 bg-white z-[2000] flex flex-col
        border-l-2 border-primary-800 shadow-[-4px_0_16px_rgba(0,0,0,0.12)]
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {site && (
        <>
          {/* Header */}
          <div className="flex items-start justify-between p-4 border-b border-gray-200 bg-primary-900">
            <div>
              <p className="text-xs text-primary-100 uppercase tracking-wide font-medium mb-0.5">Proposed Site</p>
              <p className="text-sm font-semibold text-white leading-snug">{site.address || 'Unnamed site'}</p>
            </div>
            <button
              onClick={onClose}
              className="ml-3 mt-0.5 text-primary-200 hover:text-white transition-colors shrink-0"
              aria-label="Close panel"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Street view image — clicks open Google Maps */}
          <a
            href={`https://maps.google.com/?q=${site.lat},${site.lon}`}
            target="_blank"
            rel="noopener noreferrer"
            className="relative block w-full bg-gray-100 shrink-0 group"
            style={{ height: '160px' }}
          >
            {svError ? (
              <div className="w-full h-full flex items-center justify-center">
                <p className="text-xs text-gray-400 italic px-4 text-center">No street view available for this location</p>
              </div>
            ) : (
              <img
                src={`https://maps.googleapis.com/maps/api/streetview?size=320x160&location=${site.lat},${site.lon}&return_error_code=true&key=${import.meta.env.VITE_GOOGLE_SV_KEY}`}
                alt="Street view"
                className="w-full h-full object-cover"
                onError={() => setSvError(true)}
              />
            )}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-black/25 transition-colors flex items-center justify-center">
              <span className="opacity-0 group-hover:opacity-100 transition-opacity text-white text-xs font-semibold bg-black/50 px-2 py-1 rounded">
                Open in Google Maps ↗
              </span>
            </div>
          </a>

          <div className="flex-1 overflow-y-auto p-4 space-y-5">
            {/* Amenity bars */}
            <div>
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Nearby Amenities</p>
              <div className="space-y-3">
                <AmenityBar
                  label="Transit Access"
                  rawMeters={site.transit_dist}
                  bounds={allBounds['transit_dist']}
                />
                <AmenityBar
                  label="Water Infrastructure"
                  rawMeters={site.water_infrastructure_dist}
                  bounds={allBounds['water_infrastructure_dist']}
                />
                <AmenityBar
                  label="Parks & City Facilities"
                  rawMeters={site.city_facility_dist}
                  bounds={allBounds['city_facility_dist']}
                />
                <AmenityBar
                  label="Homeless Services"
                  rawMeters={site.homeless_service_dist}
                  bounds={allBounds['homeless_service_dist']}
                />
              </div>
            </div>

            {/* Vote tally */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Community Votes</p>
              <div className="flex gap-4">
                <div className="text-center">
                  <p className="text-2xl font-bold text-primary-700">{voteTally.yes}</p>
                  <p className="text-xs text-gray-500">Support</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-accent-600">{voteTally.no}</p>
                  <p className="text-xs text-gray-500">Oppose</p>
                </div>
              </div>
            </div>

            {/* Vote UI */}
            <div className="border-t border-gray-100 pt-4">
              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Your Vote</p>

              {voted ? (
                <div className="rounded-lg bg-primary-50 border border-primary-100 px-4 py-3 text-center">
                  <p className="text-sm font-semibold text-primary-800">Thanks for your vote!</p>
                  <p className="text-xs text-primary-600 mt-0.5">Your input helps shape the future of Oakland.</p>
                </div>
              ) : (
                <>
                  {error && (
                    <div className="rounded-md bg-accent-100 border border-accent-500 px-3 py-2 mb-3">
                      <p className="text-xs text-accent-700">{error}</p>
                    </div>
                  )}

                  <textarea
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Leave a comment (optional)"
                    rows={3}
                    maxLength={500}
                    className="w-full rounded-md border border-gray-200 px-3 py-2 text-sm text-gray-700
                      placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500
                      focus:border-transparent resize-none mb-3"
                  />

                  <div className="flex gap-2">
                    <button
                      onClick={() => handleVote(true)}
                      disabled={submitting}
                      className="flex-1 rounded-md bg-primary-700 text-white text-sm font-medium py-2
                        hover:bg-primary-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? '...' : 'Support'}
                    </button>
                    <button
                      onClick={() => handleVote(false)}
                      disabled={submitting}
                      className="flex-1 rounded-md bg-accent-600 text-white text-sm font-medium py-2
                        hover:bg-accent-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? '...' : 'Oppose'}
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}
