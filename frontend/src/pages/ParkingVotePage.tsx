import { useState, useEffect, useRef, useCallback } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents, Circle, Rectangle } from 'react-leaflet'
import L, { LatLngBounds, LatLng } from 'leaflet'
import axios from 'axios'
import type { VoteSite, VoteTally, VoteCountsMap } from '../lib/types'
import { useParkingCount } from '../lib/useParkingCount'
import { computeAllBounds, type DistanceBounds } from '../lib/normalization'
import { getVoteColor } from '../lib/voteColors'
import { SitePanel } from '../components/SitePanel'
import { useAuth } from '../contexts/AuthContext'

const API = import.meta.env.VITE_API_URL || ''
const MIN_ZOOM = 14

type DrawMode = 'none' | 'rectangle' | 'circle'

// ── GeoJSON feature → VoteSite (for SitePanel) ───────────────────────────────
function featureToVoteSite(props: any, coords: number[][]): VoteSite {
  const [lon, lat] = coords[0]  // GeoJSON is [lon, lat]
  return {
    id: props.id,
    lat,
    lon,
    address: props.address,
    transit_dist: props.transit_dist ?? 0,
    water_infrastructure_dist: props.water_infrastructure_dist ?? 0,
    city_facility_dist: props.city_facility_dist ?? 0,
    homeless_service_dist: props.homeless_service_dist ?? 0,
  }
}

// ── Haversine distance (metres) ───────────────────────────────────────────────
function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

// ── Canvas-rendered GeoJSON layer — created ONCE, styled imperatively ─────────
interface ParkingLayerProps {
  geojson: any
  visible: boolean
  voteCounts: VoteCountsMap
  userVotes: Record<string, boolean>
  selectedId: string | null
  selectedIds: Set<string>
  drawModeRef: React.MutableRefObject<DrawMode>
  onSelectId: (id: string) => void
}

function ParkingLayer({
  geojson, visible, voteCounts, userVotes, selectedId, selectedIds, drawModeRef, onSelectId,
}: ParkingLayerProps) {
  const map = useMap()
  const layerRef = useRef<L.GeoJSON | null>(null)
  const canvasRenderer = useRef(L.canvas({ padding: 0.5 }))
  const onSelectRef = useRef(onSelectId)
  useEffect(() => { onSelectRef.current = onSelectId }, [onSelectId])

  const computeStyle = useCallback((feature: any): L.PathOptions => {
    const id = feature?.properties?.id
    const isSel = id === selectedId || selectedIds.has(id)
    const myVote = userVotes[id]
    const tally = voteCounts[id]
    let fillColor = '#3d8888'
    if      (myVote === true)           fillColor = '#16a34a'
    else if (myVote === false)          fillColor = '#dc2626'
    else if (tally && tally.total > 0) fillColor = getVoteColor(tally)
    if (isSel) fillColor = '#f97316'
    return {
      renderer: canvasRenderer.current,
      color: isSel ? '#ea580c' : myVote === true ? '#15803d' : myVote === false ? '#b91c1c' : '#1a3a3a',
      weight: isSel ? 2 : myVote !== undefined ? 1.5 : 0.5,
      fillColor,
      fillOpacity: 0.82,
    }
  }, [voteCounts, userVotes, selectedId, selectedIds])

  // Create the layer exactly once, populate in chunks to keep UI responsive
  useEffect(() => {
    if (!geojson) return
    let cancelled = false

    const layer = L.geoJSON(undefined, { style: computeStyle })

    // One click handler on the parent layer instead of one per feature
    layer.on('click', (e: L.LeafletMouseEvent) => {
      if (drawModeRef.current !== 'none') return
      L.DomEvent.stopPropagation(e)
      const id = (e as any).sourceTarget?.feature?.properties?.id
      if (id) onSelectRef.current(id)
    })

    layerRef.current = layer

    const features = geojson.features
    const CHUNK = 3000
    let i = 0
    function addChunk() {
      if (cancelled || !layerRef.current) return
      layer.addData({ type: 'FeatureCollection', features: features.slice(i, i + CHUNK) } as any)
      i += CHUNK
      if (i < features.length) setTimeout(addChunk, 0)
    }
    addChunk()

    return () => {
      cancelled = true
      map.removeLayer(layer)
      layerRef.current = null
    }
  }, [geojson, map]) // eslint-disable-line react-hooks/exhaustive-deps

  // Show / hide based on zoom without recreating
  useEffect(() => {
    const layer = layerRef.current
    if (!layer) return
    if (visible) { if (!map.hasLayer(layer)) layer.addTo(map) }
    else { if (map.hasLayer(layer)) map.removeLayer(layer) }
  }, [visible, map])

  // Restyle imperatively — no layer recreation
  useEffect(() => {
    layerRef.current?.setStyle(computeStyle)
  }, [computeStyle])

  return null
}

// ── Zoom tracker ──────────────────────────────────────────────────────────────
function ZoomTracker({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) })
  useEffect(() => { onZoom(map.getZoom()) }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return null
}

// ── Rectangle draw tool ───────────────────────────────────────────────────────
function RectangleDrawTool({ active, onComplete }: { active: boolean; onComplete: (b: LatLngBounds) => void }) {
  const map = useMap()
  const start = useRef<LatLng | null>(null)
  const [preview, setPreview] = useState<LatLngBounds | null>(null)

  useEffect(() => {
    if (!active) { setPreview(null); return }
    map.getContainer().style.cursor = 'crosshair'
    map.dragging.disable()

    const pt = (e: MouseEvent) => map.mouseEventToLatLng(e as unknown as MouseEvent & { clientX: number; clientY: number })
    const down = (e: MouseEvent) => { start.current = pt(e) }
    const move = (e: MouseEvent) => { if (start.current) setPreview(new LatLngBounds(start.current, pt(e))) }
    const up = (e: MouseEvent) => {
      if (!start.current) return
      onComplete(new LatLngBounds(start.current, pt(e)))
      start.current = null; setPreview(null)
    }

    const c = map.getContainer()
    c.addEventListener('mousedown', down)
    c.addEventListener('mousemove', move)
    c.addEventListener('mouseup', up)
    return () => {
      c.removeEventListener('mousedown', down)
      c.removeEventListener('mousemove', move)
      c.removeEventListener('mouseup', up)
      map.getContainer().style.cursor = ''
      map.dragging.enable()
    }
  }, [active, map, onComplete])

  if (!preview) return null
  return <Rectangle bounds={preview} pathOptions={{ color: '#f97316', weight: 2, fillOpacity: 0.1 }} />
}

// ── Circle draw tool ──────────────────────────────────────────────────────────
function CircleDrawTool({ active, onComplete }: { active: boolean; onComplete: (c: LatLng, r: number) => void }) {
  const map = useMap()
  const center = useRef<LatLng | null>(null)
  const [preview, setPreview] = useState<{ center: LatLng; radius: number } | null>(null)

  useEffect(() => {
    if (!active) { setPreview(null); return }
    map.getContainer().style.cursor = 'crosshair'
    map.dragging.disable()

    const pt = (e: MouseEvent) => map.mouseEventToLatLng(e as unknown as MouseEvent & { clientX: number; clientY: number })
    const down = (e: MouseEvent) => { center.current = pt(e) }
    const move = (e: MouseEvent) => {
      if (!center.current) return
      const edge = pt(e)
      setPreview({ center: center.current, radius: haversine(center.current.lat, center.current.lng, edge.lat, edge.lng) })
    }
    const up = (e: MouseEvent) => {
      if (!center.current) return
      const edge = pt(e)
      onComplete(center.current, haversine(center.current.lat, center.current.lng, edge.lat, edge.lng))
      center.current = null; setPreview(null)
    }

    const c = map.getContainer()
    c.addEventListener('mousedown', down)
    c.addEventListener('mousemove', move)
    c.addEventListener('mouseup', up)
    return () => {
      c.removeEventListener('mousedown', down)
      c.removeEventListener('mousemove', move)
      c.removeEventListener('mouseup', up)
      map.getContainer().style.cursor = ''
      map.dragging.enable()
    }
  }, [active, map, onComplete])

  if (!preview) return null
  return <Circle center={preview.center} radius={preview.radius} pathOptions={{ color: '#f97316', weight: 2, fillOpacity: 0.1 }} />
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function ParkingVotePage() {
  const { user } = useAuth()
  const parkingCount = useParkingCount()
  const [rawGeojson, setRawGeojson] = useState<any>(null)
  const [voteCounts, setVoteCounts] = useState<VoteCountsMap>({})
  const [allBounds, setAllBounds] = useState<Record<string, DistanceBounds>>({})
  const [userVotes, setUserVotes] = useState<Record<string, boolean>>({})
  const [loading, setLoading] = useState(true)
  const [zoom, setZoom] = useState(13)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const drawModeRef = useRef<DrawMode>('none')
  useEffect(() => { drawModeRef.current = drawMode }, [drawMode])

  const [batchComment, setBatchComment] = useState('')
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)

  // Load this user's prior votes from localStorage
  useEffect(() => {
    if (!user?.id) return
    const stored = localStorage.getItem('parkingVotes_v1')
    if (!stored) return
    const all = JSON.parse(stored) as Record<string, Record<string, boolean>>
    setUserVotes(all[user.id] ?? {})
  }, [user?.id])

  function persistVote(siteId: string, support: boolean) {
    if (!user?.id) return
    const stored = localStorage.getItem('parkingVotes_v1')
    const all = stored ? JSON.parse(stored) as Record<string, Record<string, boolean>> : {}
    all[user.id] = { ...(all[user.id] ?? {}), [siteId]: support }
    localStorage.setItem('parkingVotes_v1', JSON.stringify(all))
  }

  // Prevent body scroll — this page is fully self-contained
  useEffect(() => {
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [])

  useEffect(() => {
    async function load() {
      const [geoRes, voteRes] = await Promise.all([
        fetch(`${API}/api/polygon_map`),
        axios.get(`${API}/api/votes`).catch(() => ({ data: {} })),
      ])
      const geojson = await geoRes.json()
      const sitesForBounds = geojson.features.map((f: any) => ({
        id: f.properties.id, lat: 0, lon: 0, address: '',
        transit_dist: f.properties.transit_dist ?? 0,
        water_infrastructure_dist: f.properties.water_infrastructure_dist ?? 0,
        city_facility_dist: f.properties.city_facility_dist ?? 0,
        homeless_service_dist: f.properties.homeless_service_dist ?? 0,
      }))
      setRawGeojson(geojson)
      setAllBounds(computeAllBounds(sitesForBounds))
      setVoteCounts(voteRes.data || {})
      setLoading(false)
    }
    load()
  }, [])

  const handleRectComplete = useCallback((bounds: LatLngBounds) => {
    if (!rawGeojson) return
    const ids = new Set<string>(
      rawGeojson.features
        .filter((f: any) => { const [lon, lat] = f.geometry.coordinates[0][0]; return bounds.contains([lat, lon]) })
        .map((f: any) => f.properties.id)
    )
    setSelectedIds(ids); setSelectedId(null); setDrawMode('none')
  }, [rawGeojson])

  const handleCircleComplete = useCallback((center: LatLng, radiusM: number) => {
    if (!rawGeojson) return
    const ids = new Set<string>(
      rawGeojson.features
        .filter((f: any) => { const [lon, lat] = f.geometry.coordinates[0][0]; return haversine(center.lat, center.lng, lat, lon) <= radiusM })
        .map((f: any) => f.properties.id)
    )
    setSelectedIds(ids); setSelectedId(null); setDrawMode('none')
  }, [rawGeojson])

  const handleSelectId = useCallback((id: string) => {
    setSelectedId(id); setSelectedIds(new Set())
  }, [])

  function unpersistVote(siteId: string) {
    if (!user?.id) return
    const stored = localStorage.getItem('parkingVotes_v1')
    if (!stored) return
    const all = JSON.parse(stored) as Record<string, Record<string, boolean>>
    if (all[user.id]) { delete all[user.id][siteId] }
    localStorage.setItem('parkingVotes_v1', JSON.stringify(all))
  }

  async function submitBatch(support: boolean) {
    setBatchSubmitting(true)
    setBatchError(null)
    const ids = Array.from(selectedIds)
    try {
      await axios.post(`${API}/api/votes/batch`, { site_ids: ids, support, comment: batchComment || null, user_id: user?.id })
      setVoteCounts(prev => {
        const next = { ...prev }
        for (const id of ids) {
          const cur = next[id] || { yes: 0, no: 0, total: 0 }
          const prev_vote = userVotes[id]
          if (prev_vote === undefined) {
            next[id] = { yes: cur.yes + (support ? 1 : 0), no: cur.no + (!support ? 1 : 0), total: cur.total + 1 }
          } else if (prev_vote !== support) {
            next[id] = { yes: cur.yes + (support ? 1 : -1), no: cur.no + (support ? -1 : 1), total: cur.total }
          }
        }
        return next
      })
      setUserVotes(prev => {
        const next = { ...prev }
        for (const id of ids) next[id] = support
        return next
      })
      for (const id of ids) persistVote(id, support)
      setSelectedIds(new Set()); setBatchComment('')
    } catch {
      setBatchError('Failed to save votes. Please try again.')
    } finally {
      setBatchSubmitting(false)
    }
  }

  async function submitBatchUndo() {
    const ids = Array.from(selectedIds)
    if (!ids.length || !user?.id) return
    setBatchSubmitting(true)
    // Capture current votes before clearing
    const prevVotes = { ...userVotes }
    setUserVotes(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n })
    ids.forEach(id => unpersistVote(id))
    setVoteCounts(prev => {
      const n = { ...prev }
      ids.forEach(id => {
        const old = n[id] ?? { yes: 0, no: 0, total: 0 }
        const was = prevVotes[id]
        if (was !== undefined) {
          n[id] = { yes: old.yes - (was ? 1 : 0), no: old.no - (was ? 0 : 1), total: Math.max(0, old.total - 1) }
        }
      })
      return n
    })
    try {
      await axios.delete(`${API}/api/votes/batch`, { data: { site_ids: ids, user_id: user.id } })
    } catch { /* local state already updated */ }
    setBatchSubmitting(false)
    setSelectedIds(new Set())
    setBatchComment('')
  }

  const selectedSite = selectedId && rawGeojson
    ? (() => {
        const f = rawGeojson.features.find((f: any) => f.properties.id === selectedId)
        return f ? featureToVoteSite(f.properties, f.geometry.coordinates[0]) : null
      })()
    : null
  const selectedTally = selectedId ? (voteCounts[selectedId] ?? { yes: 0, no: 0, total: 0 }) : { yes: 0, no: 0, total: 0 }

  return (
    <div className="flex flex-col flex-1 overflow-hidden">
      {/* Toolbar */}
      <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-3 shrink-0">
        <span className="text-sm font-semibold text-gray-700">Selection tools:</span>
        {(['rectangle', 'circle'] as DrawMode[]).map(mode => (
          <button
            key={mode}
            onClick={() => setDrawMode(m => m === mode ? 'none' : mode)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize ${
              drawMode === mode
                ? 'bg-orange-100 text-orange-700 border border-orange-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {mode === 'rectangle'
              ? <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="8" rx="1" /></svg>
              : <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5" /></svg>
            }
            {mode}
          </button>
        ))}
        {selectedIds.size > 0 && (
          <button onClick={() => setSelectedIds(new Set())} className="ml-1 text-xs text-gray-400 hover:text-gray-600">
            Clear selection
          </button>
        )}
        {drawMode !== 'none' && (
          <span className="ml-2 text-xs text-orange-600 font-medium animate-pulse">
            {drawMode === 'rectangle' ? 'Drag to select an area' : 'Drag to draw a circle'}
          </span>
        )}
        <div className="flex items-center gap-3 text-xs text-gray-500">
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#3d8888' }} /> Not voted
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#16a34a' }} /> You supported
          </span>
          <span className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ background: '#dc2626' }} /> You opposed
          </span>
        </div>
        <div className="ml-auto flex items-center gap-2 text-xs text-gray-400">
          <span>{(rawGeojson?.total_spots ?? parkingCount)?.toLocaleString() ?? '—'} total spaces</span>
          {zoom < MIN_ZOOM && <span className="text-orange-500 font-medium">· Zoom in to see spaces</span>}
        </div>
      </div>

      {/* Map + side panel */}
      <div className="flex flex-1 overflow-hidden relative">
        <MapContainer
          center={[37.8044, -122.2712]}
          zoom={13}
          style={{ flex: 1, height: '100%' }}
          zoomControl
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <ZoomTracker onZoom={setZoom} />

          {rawGeojson && (
            <ParkingLayer
              geojson={rawGeojson}
              visible={zoom >= MIN_ZOOM}
              voteCounts={voteCounts}
              userVotes={userVotes}
              selectedId={selectedId}
              selectedIds={selectedIds}
              drawModeRef={drawModeRef}
              onSelectId={handleSelectId}
            />
          )}

          <RectangleDrawTool active={drawMode === 'rectangle'} onComplete={handleRectComplete} />
          <CircleDrawTool active={drawMode === 'circle'} onComplete={handleCircleComplete} />
        </MapContainer>

        {selectedSite && (
          <SitePanel
            site={selectedSite}
            allBounds={allBounds}
            voteTally={selectedTally}
            myVote={selectedId ? userVotes[selectedId] : undefined}
            userId={user?.id}
            onClose={() => setSelectedId(null)}
            onVoteSubmitted={(id: string, tally: VoteTally, support: boolean) => {
              setUserVotes(prev => ({ ...prev, [id]: support }))
              persistVote(id, support)
              setVoteCounts(prev => ({ ...prev, [id]: tally }))
            }}
            onVoteUndone={(id: string, tally: VoteTally) => {
              setUserVotes(prev => { const n = { ...prev }; delete n[id]; return n })
              unpersistVote(id)
              setVoteCounts(prev => ({ ...prev, [id]: tally }))
            }}
          />
        )}
      </div>

      {/* Batch vote bar */}
      {selectedIds.size > 0 && (
        <div className="bg-primary-900 border-t border-primary-800 px-6 py-3 flex items-center gap-4 shrink-0 flex-wrap">
          {batchError && (
            <div className="w-full text-sm text-red-300 bg-red-900/50 border border-red-700 rounded px-3 py-1.5">
              {batchError}
            </div>
          )}
          <span className="text-white font-medium text-sm">
            {selectedIds.size.toLocaleString()} spaces selected
          </span>
          <input
            value={batchComment}
            onChange={e => setBatchComment(e.target.value)}
            placeholder="Optional comment…"
            maxLength={500}
            className="flex-1 bg-primary-800 border border-primary-700 rounded-lg px-3 py-1.5 text-sm text-white placeholder-primary-300 focus:outline-none focus:border-teal-400"
          />
          <button
            onClick={() => submitBatch(true)}
            disabled={batchSubmitting}
            className="bg-green-600 hover:bg-green-500 disabled:opacity-50 text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            Support All
          </button>
          <button
            onClick={() => submitBatch(false)}
            disabled={batchSubmitting}
            className="bg-red-600 hover:bg-red-500 disabled:opacity-50 text-white font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            Oppose All
          </button>
          <button
            onClick={submitBatchUndo}
            disabled={batchSubmitting}
            className="border border-primary-500 text-primary-200 hover:text-white hover:border-white disabled:opacity-50 font-semibold px-4 py-1.5 rounded-lg text-sm transition-colors"
          >
            Clear Votes
          </button>
          <button onClick={() => { setSelectedIds(new Set()); setBatchError(null) }} className="text-primary-400 hover:text-white text-sm transition-colors ml-1">
            Cancel
          </button>
        </div>
      )}

      {/* Loading overlay */}
      {loading && (
        <div className="absolute inset-0 bg-white/80 flex items-center justify-center z-[9999]">
          <div className="text-center">
            <div className="w-8 h-8 border-2 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
            <p className="text-sm text-gray-500">
              Loading {parkingCount ? `${parkingCount.toLocaleString()} ` : ''}parking spaces…
            </p>
          </div>
        </div>
      )}
    </div>
  )
}
