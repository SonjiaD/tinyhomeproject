import { useState, useEffect, useRef, useCallback, useMemo } from 'react'
import { MapContainer, TileLayer, useMap, useMapEvents, Circle, Rectangle, Polyline, Polygon, CircleMarker } from 'react-leaflet'
import L, { LatLngBounds, LatLng } from 'leaflet'
import axios from 'axios'
import confetti from 'canvas-confetti'
import type { VoteSite, VoteTally, VoteCountsMap } from '../lib/types'
import { useParkingCount } from '../lib/useParkingCount'
import { computeAllBounds, type DistanceBounds } from '../lib/normalization'
import { getVoteColor } from '../lib/voteColors'
import { SitePanel } from '../components/SitePanel'
import { ProgressToast } from '../components/ui'
import { useAuth } from '../contexts/AuthContext'

const API = import.meta.env.VITE_API_URL || ''
const MIN_ZOOM = 14

type DrawMode = 'none' | 'rectangle' | 'circle' | 'paint' | 'polygon'

type NeighborhoodGeometry =
  | { type: 'Polygon'; coordinates: number[][][] }
  | { type: 'MultiPolygon'; coordinates: number[][][][] }

interface NeighborhoodFeature {
  type: 'Feature'
  properties: { name: string; [key: string]: any }
  geometry: NeighborhoodGeometry
}

// ── Milestone config ──────────────────────────────────────────────────────────
const MILESTONES = [
  { key: 'first', pct: 0, label: 'Your first spot!', sub: 'Keep going. Every vote counts.' },
  { key: '10',    pct: 10, label: "10%! You're on your way.", sub: 'A solid start. The map is taking shape.' },
  { key: '25',    pct: 25, label: "Quarter of the way there!", sub: "You've committed to real change." },
  { key: '50',    pct: 50, label: "Halfway! You're making history.", sub: null }, // uses card overlay
  { key: '75',    pct: 75, label: "Almost there. The finish line is in sight.", sub: null },
]

const GOAL_COPY: Record<number, { heading: string; impact: string }> = {
  6000:  { heading: "You've proved the concept.", impact: "You've pledged 6,000 new homes for Oakland." },
  18000: { heading: "You've closed the housing gap.", impact: "You've pledged 18,000 new homes for Oakland." },
  30000: { heading: "You've ended the affordability crisis.", impact: "You've pledged 30,000 new homes for Oakland." },
}

function fireBurst(intensity: 'small' | 'medium' | 'center') {
  if (intensity === 'small') {
    confetti({ particleCount: 60, spread: 70, origin: { y: 0.3 }, colors: ['#2d9d8f','#f97316','#fbbf24','#34d399'] })
  } else if (intensity === 'medium') {
    confetti({ particleCount: 100, spread: 90, origin: { y: 0.3 }, colors: ['#2d9d8f','#f97316','#fbbf24','#34d399'] })
  } else {
    confetti({ particleCount: 150, spread: 120, origin: { y: 0.5 }, colors: ['#2d9d8f','#f97316','#fbbf24','#34d399'] })
  }
}

function fireSlowRain() {
  const duration = 4500
  const end = Date.now() + duration
  const colors = ['#2d9d8f','#f97316','#fbbf24','#34d399','#a78bfa']
  ;(function frame() {
    confetti({ particleCount: 3, angle: 60, spread: 55, origin: { x: 0 }, colors })
    confetti({ particleCount: 3, angle: 120, spread: 55, origin: { x: 1 }, colors })
    if (Date.now() < end) requestAnimationFrame(frame)
  })()
}

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

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────
function pointInPolygon(lat: number, lon: number, verts: LatLng[]): boolean {
  let inside = false
  for (let i = 0, j = verts.length - 1; i < verts.length; j = i++) {
    const xi = verts[i].lng, yi = verts[i].lat
    const xj = verts[j].lng, yj = verts[j].lat
    if (((yi > lat) !== (yj > lat)) && (lon < ((xj - xi) * (lat - yi)) / (yj - yi) + xi))
      inside = !inside
  }
  return inside
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
  layerMapRef?: React.MutableRefObject<Map<string, L.Path>>
  onReady?: () => void
}

function ParkingLayer({
  geojson, visible, voteCounts, userVotes, selectedId, selectedIds, drawModeRef, onSelectId, layerMapRef, onReady,
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

    // Build id → layer map for O(1) imperative styling during paint
    if (layerMapRef) layerMapRef.current = new Map()
    layer.on('layeradd', (e: any) => {
      const id = e.layer?.feature?.properties?.id
      if (id && layerMapRef) layerMapRef.current.set(id, e.layer as L.Path)
    })

    // One click handler on the parent layer instead of one per feature
    layer.on('click', (e: L.LeafletMouseEvent) => {
      if (drawModeRef.current !== 'none') return
      L.DomEvent.stopPropagation(e)
      const id = (e as any).sourceTarget?.feature?.properties?.id
      if (id) onSelectRef.current(id)
    })

    layerRef.current = layer
    // Visible effect only fires when `visible` changes; if visible is already true
    // when the layer is created (e.g. initial zoom >= MIN_ZOOM), add it directly.
    if (visible) layer.addTo(map)

    const features = geojson.features
    const CHUNK = 3000
    let i = 0
    function addChunk() {
      if (cancelled || !layerRef.current) return
      layer.addData({ type: 'FeatureCollection', features: features.slice(i, i + CHUNK) } as any)
      i += CHUNK
      if (i < features.length) setTimeout(addChunk, 0)
      else if (!cancelled) onReady?.()
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
      // Block the click event that the browser fires after mouseup — by the time it
      // arrives, React will have already reset drawModeRef.current to 'none', so the
      // layer click guard would be bypassed without this capture-phase block.
      map.getContainer().addEventListener('click', ev => ev.stopImmediatePropagation(), { capture: true, once: true })
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
      map.getContainer().addEventListener('click', ev => ev.stopImmediatePropagation(), { capture: true, once: true })
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

// ── Paint brush tool ──────────────────────────────────────────────────────────
interface PaintBrushToolProps {
  active: boolean
  brushRadius: number
  candidates: { id: string; lat: number; lon: number }[]
  onAddSpots: (ids: string[]) => void      // called every hit-test for imperative styling
  onComplete: (allPaintedIds: string[]) => void  // called on mouseup to commit to state
}

function PaintBrushTool({ active, brushRadius, candidates, onAddSpots, onComplete }: PaintBrushToolProps) {
  const map = useMap()
  const isPainting = useRef(false)
  const lastCheckRef = useRef(0)
  const paintedInStroke = useRef(new Set<string>())
  const [cursorPos, setCursorPos] = useState<LatLng | null>(null)

  useEffect(() => {
    if (!active) { setCursorPos(null); return }
    map.getContainer().style.cursor = 'none'
    map.dragging.disable()

    const pt = (e: MouseEvent) => map.mouseEventToLatLng(e as any)

    function spotHit(pos: LatLng): string[] {
      const latDelta = brushRadius / 111320
      const lonDelta = brushRadius / (111320 * Math.cos((pos.lat * Math.PI) / 180))
      return candidates
        .filter(c =>
          Math.abs(c.lat - pos.lat) <= latDelta &&
          Math.abs(c.lon - pos.lng) <= lonDelta &&
          haversine(pos.lat, pos.lng, c.lat, c.lon) <= brushRadius
        )
        .filter(c => !paintedInStroke.current.has(c.id))
        .map(c => c.id)
    }

    const down = (e: MouseEvent) => {
      isPainting.current = true
      paintedInStroke.current = new Set()
      const hit = spotHit(pt(e))
      hit.forEach(id => paintedInStroke.current.add(id))
      if (hit.length) onAddSpots(hit)
    }

    const move = (e: MouseEvent) => {
      const pos = pt(e)
      setCursorPos(pos)
      if (!isPainting.current) return
      const now = Date.now()
      if (now - lastCheckRef.current < 50) return
      lastCheckRef.current = now
      const hit = spotHit(pos)
      hit.forEach(id => paintedInStroke.current.add(id))
      if (hit.length) onAddSpots(hit)
    }

    const up = () => {
      if (!isPainting.current) return
      map.getContainer().addEventListener('click', ev => ev.stopImmediatePropagation(), { capture: true, once: true })
      isPainting.current = false
      onComplete(Array.from(paintedInStroke.current))
      paintedInStroke.current = new Set()
    }

    const leave = () => setCursorPos(null)

    const c = map.getContainer()
    c.addEventListener('mousedown', down)
    c.addEventListener('mousemove', move)
    c.addEventListener('mouseup', up)
    c.addEventListener('mouseleave', leave)
    return () => {
      c.removeEventListener('mousedown', down)
      c.removeEventListener('mousemove', move)
      c.removeEventListener('mouseup', up)
      c.removeEventListener('mouseleave', leave)
      map.getContainer().style.cursor = ''
      map.dragging.enable()
      isPainting.current = false
    }
  }, [active, map, brushRadius, candidates, onAddSpots, onComplete])

  if (!cursorPos) return null
  return (
    <Circle
      center={cursorPos}
      radius={brushRadius}
      pathOptions={{ color: '#f97316', weight: 2, fillColor: '#f97316', fillOpacity: 0.08, dashArray: '4 4' }}
    />
  )
}

// ── Polygon draw tool ─────────────────────────────────────────────────────────
function PolygonDrawTool({ active, onComplete }: { active: boolean; onComplete: (verts: LatLng[]) => void }) {
  const map = useMap()
  const [vertices, setVertices] = useState<LatLng[]>([])
  const [cursorPos, setCursorPos] = useState<LatLng | null>(null)
  const [nearFirst, setNearFirst] = useState(false)
  const verticesRef = useRef<LatLng[]>([])
  const lastClickTimeRef = useRef(0)

  useEffect(() => {
    if (!active) {
      verticesRef.current = []
      setVertices([]); setCursorPos(null); setNearFirst(false)
      return
    }
    map.getContainer().style.cursor = 'crosshair'
    map.dragging.disable()

    const pt = (e: MouseEvent) => map.mouseEventToLatLng(e as any)

    const click = (e: MouseEvent) => {
      const now = Date.now()
      const timeSinceLast = now - lastClickTimeRef.current
      lastClickTimeRef.current = now
      const pos = pt(e)
      const verts = verticesRef.current

      if (timeSinceLast < 300) {
        // Double-click: close if enough vertices placed
        if (verts.length >= 3) {
          const closeVerts = [...verts]
          verticesRef.current = []
          setVertices([]); setCursorPos(null); setNearFirst(false)
          onComplete(closeVerts)
        }
        return
      }

      // Snap-to-first: click near first vertex to close
      if (verts.length >= 3) {
        const firstPx = map.latLngToContainerPoint(verts[0])
        const posPx = map.latLngToContainerPoint(pos)
        if (Math.hypot(firstPx.x - posPx.x, firstPx.y - posPx.y) < 12) {
          const closeVerts = [...verts]
          verticesRef.current = []
          setVertices([]); setCursorPos(null); setNearFirst(false)
          onComplete(closeVerts)
          return
        }
      }

      const newVerts = [...verts, pos]
      verticesRef.current = newVerts
      setVertices(newVerts)
    }

    const move = (e: MouseEvent) => {
      const pos = pt(e)
      setCursorPos(pos)
      const verts = verticesRef.current
      if (verts.length >= 3) {
        const firstPx = map.latLngToContainerPoint(verts[0])
        const posPx = map.latLngToContainerPoint(pos)
        setNearFirst(Math.hypot(firstPx.x - posPx.x, firstPx.y - posPx.y) < 12)
      } else {
        setNearFirst(false)
      }
    }

    const contextmenu = (e: MouseEvent) => {
      e.preventDefault()
      const newVerts = verticesRef.current.slice(0, -1)
      verticesRef.current = newVerts
      setVertices(newVerts)
    }

    const keydown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        verticesRef.current = []
        setVertices([]); setCursorPos(null); setNearFirst(false)
        onComplete([])  // empty signals cancel to parent
      }
    }

    const c = map.getContainer()
    c.addEventListener('click', click)
    c.addEventListener('mousemove', move)
    c.addEventListener('contextmenu', contextmenu)
    document.addEventListener('keydown', keydown, { capture: true })
    return () => {
      c.removeEventListener('click', click)
      c.removeEventListener('mousemove', move)
      c.removeEventListener('contextmenu', contextmenu)
      document.removeEventListener('keydown', keydown, { capture: true })
      map.getContainer().style.cursor = ''
      map.dragging.enable()
    }
  }, [active, map, onComplete])

  if (!active || vertices.length === 0) return null

  return (
    <>
      {/* Committed polygon fill — shows enclosed area as you build */}
      {vertices.length >= 3 && (
        <Polygon
          positions={vertices}
          pathOptions={{ color: '#f97316', weight: 0, fillColor: '#f97316', fillOpacity: 0.12 }}
        />
      )}
      {/* Dashed outline through placed vertices */}
      {vertices.length >= 2 && (
        <Polyline
          positions={vertices}
          pathOptions={{ color: '#f97316', weight: 2, dashArray: '6 4' }}
        />
      )}
      {/* Rubber-band line: last vertex → cursor */}
      {cursorPos && (
        <Polyline
          positions={[vertices[vertices.length - 1], cursorPos]}
          pathOptions={{ color: '#f97316', weight: 2, dashArray: '4 4', opacity: 0.7 }}
        />
      )}
      {/* Vertex dots */}
      {vertices.map((v, i) => (
        <CircleMarker
          key={i}
          center={v}
          radius={i === 0 && nearFirst && vertices.length >= 3 ? 7 : 5}
          pathOptions={{ color: '#ea580c', fillColor: '#f97316', fillOpacity: 1, weight: 1.5 }}
        />
      ))}
      {/* Snap ring pulses on first vertex when cursor is close */}
      {nearFirst && vertices.length >= 3 && (
        <CircleMarker
          center={vertices[0]}
          radius={14}
          pathOptions={{ color: '#f97316', fillOpacity: 0, weight: 1.5, opacity: 0.55, dashArray: '3 3' }}
        />
      )}
    </>
  )
}

// Projects annual Oakland tax revenue per pledged unit of tiny home housing.
// Assumes $1,000/mo rent (affordable housing target).
//   BLT (Business License Tax): gross rent × Oakland BLT rate of 1.395%
//     → $1,000 × 12 × 0.01395 = $167.40 / unit / yr
//   RAP (Rent Adjustment Program fee): $101 / unit / yr (Oakland flat fee)
//   Total: $268.40 / unit / yr
// Sources: Oakland Municipal Code 5.04 (BLT), Oakland RAP annual fee schedule.
function formatTax(units: number): string {
  const annual = units * 268.40
  if (annual >= 1_000_000) return `$${(annual / 1_000_000).toFixed(1)}M`
  return `$${Math.round(annual / 1000)}k`
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
  const [zoom, setZoom] = useState(14)

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [drawMode, setDrawMode] = useState<DrawMode>('none')
  const drawModeRef = useRef<DrawMode>('none')
  // Keep drawModeRef.current updated synchronously — never via useEffect — so
  // Leaflet click guards always see the current mode even during React batching.
  function setDrawModeSync(mode: DrawMode) {
    drawModeRef.current = mode
    setDrawMode(mode)
  }

  const [brushRadius, setBrushRadius] = useState(30)
  const paintLayerMapRef = useRef<Map<string, L.Path>>(new Map())

  // ── Neighborhood quick-select ─────────────────────────────────────────────
  const [neighborhoods, setNeighborhoods] = useState<NeighborhoodFeature[]>([])
  const [neighborhoodPanelOpen, setNeighborhoodPanelOpen] = useState(false)
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('')
  const [activeNeighborhood, setActiveNeighborhood] = useState<NeighborhoodFeature | null>(null)
  const neighborhoodBtnRef = useRef<HTMLButtonElement>(null)
  const neighborhoodPanelRef = useRef<HTMLDivElement>(null)
  // Orange style matching computeStyle for a selected unvoted spot
  const PAINT_STYLE: L.PathOptions = { fillColor: '#f97316', color: '#ea580c', weight: 2, fillOpacity: 0.82 }

  const [batchComment, setBatchComment] = useState('')
  const [batchSubmitting, setBatchSubmitting] = useState(false)
  const [batchError, setBatchError] = useState<string | null>(null)
  const [batchProgress, setBatchProgress] = useState<{ done: number; total: number } | null>(null)
  const [batchLabel, setBatchLabel] = useState('Saving your votes…')

  // ── Progress / milestones / celebrations ─────────────────────────────────
  const userGoal: number = (user?.user_metadata?.goal as number) ?? 6000
  const [communityTotal, setCommunityTotal] = useState<number | null>(null)
  const [headerExpanded, setHeaderExpanded] = useState(false)
  const [toast, setToast] = useState<{ label: string; sub?: string | null } | null>(null)
  const [halfwayCard, setHalfwayCard] = useState(false)
  const [celebModal, setCelebModal] = useState(false)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const yesCount = Object.values(userVotes).filter(Boolean).length
  const progressPct = Math.min(100, Math.round((yesCount / userGoal) * 100))

  function showToast(label: string, sub?: string | null) {
    if (toastTimer.current) clearTimeout(toastTimer.current)
    setToast({ label, sub })
    toastTimer.current = setTimeout(() => setToast(null), 3500)
  }

  function getMilestonesKey() { return `celebrated_milestones_${userGoal}` }

  function getFiredMilestones(): string[] {
    try { return JSON.parse(localStorage.getItem(getMilestonesKey()) ?? '[]') } catch { return [] }
  }

  function markMilestoneFired(key: string) {
    const fired = getFiredMilestones()
    if (!fired.includes(key)) localStorage.setItem(getMilestonesKey(), JSON.stringify([...fired, key]))
  }

  function checkMilestones(newYesCount: number, prevYesCount: number) {
    const fired = getFiredMilestones()
    const toFire: typeof MILESTONES = []

    // First vote
    if (newYesCount >= 1 && prevYesCount === 0 && !fired.includes('first')) {
      toFire.push(MILESTONES[0])
    }
    // Percentage milestones
    for (const m of MILESTONES.slice(1)) {
      const threshold = Math.ceil(userGoal * m.pct / 100)
      if (newYesCount >= threshold && prevYesCount < threshold && !fired.includes(m.key)) {
        toFire.push(m)
      }
    }
    // 100% goal
    if (newYesCount >= userGoal && prevYesCount < userGoal && !fired.includes('100')) {
      toFire.push({ key: '100', pct: 100, label: '', sub: null })
    }

    // Fire sequentially with delay
    toFire.forEach((m, i) => {
      setTimeout(() => {
        markMilestoneFired(m.key)
        if (m.key === '100') {
          fireSlowRain()
          setTimeout(() => setCelebModal(true), 800)
        } else if (m.key === '50') {
          fireBurst('center')
          setHalfwayCard(true)
          setTimeout(() => setHalfwayCard(false), 3500)
        } else if (m.key === '25' || m.key === '75') {
          fireBurst('medium')
          showToast(m.label, m.sub)
        } else {
          fireBurst('small')
          showToast(m.label, m.sub)
        }
      }, i * 400)
    })
  }

  const fetchCommunityTotal = useCallback(async () => {
    try {
      const res = await axios.get(`${API}/api/votes/summary`)
      setCommunityTotal(res.data.total_yes ?? null)
    } catch { /* non-critical */ }
  }, [])

  // Poll community total every 30s
  useEffect(() => {
    fetchCommunityTotal()
    const interval = setInterval(fetchCommunityTotal, 30000)
    return () => clearInterval(interval)
  }, [fetchCommunityTotal])

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
    const prev = all[user.id] ?? {}
    const prevYes = Object.values(prev).filter(Boolean).length
    all[user.id] = { ...prev, [siteId]: support }
    localStorage.setItem('parkingVotes_v1', JSON.stringify(all))
    if (support) {
      const newYes = Object.values(all[user.id]).filter(Boolean).length
      checkMilestones(newYes, prevYes)
    }
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
    }
    load()
  }, [])

  useEffect(() => {
    fetch('/oakland_neighborhoods.geojson')
      .then(r => r.json())
      .then(data => {
        const features: NeighborhoodFeature[] = (data.features ?? [])
          .filter((f: any) => f.geometry?.type === 'Polygon' || f.geometry?.type === 'MultiPolygon')
          .sort((a: any, b: any) => (a.properties.name ?? '').localeCompare(b.properties.name ?? ''))
        setNeighborhoods(features)
      })
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!neighborhoodPanelOpen) return
    function handleOutside(e: MouseEvent) {
      if (
        neighborhoodPanelRef.current && !neighborhoodPanelRef.current.contains(e.target as Node) &&
        neighborhoodBtnRef.current && !neighborhoodBtnRef.current.contains(e.target as Node)
      ) { setNeighborhoodPanelOpen(false); setNeighborhoodSearch('') }
    }
    document.addEventListener('mousedown', handleOutside)
    return () => document.removeEventListener('mousedown', handleOutside)
  }, [neighborhoodPanelOpen])

  const handleRectComplete = useCallback((bounds: LatLngBounds) => {
    if (!rawGeojson) return
    const ids = new Set<string>(
      rawGeojson.features
        .filter((f: any) => { const [lon, lat] = f.geometry.coordinates[0][0]; return bounds.contains([lat, lon]) })
        .map((f: any) => f.properties.id)
    )
    setSelectedIds(ids); setSelectedId(null); setDrawModeSync('none'); setActiveNeighborhood(null)
  }, [rawGeojson])

  const handleCircleComplete = useCallback((center: LatLng, radiusM: number) => {
    if (!rawGeojson) return
    const ids = new Set<string>(
      rawGeojson.features
        .filter((f: any) => { const [lon, lat] = f.geometry.coordinates[0][0]; return haversine(center.lat, center.lng, lat, lon) <= radiusM })
        .map((f: any) => f.properties.id)
    )
    setSelectedIds(ids); setSelectedId(null); setDrawModeSync('none'); setActiveNeighborhood(null)
  }, [rawGeojson])

  const paintCandidates = useMemo<{ id: string; lat: number; lon: number }[]>(() =>
    rawGeojson?.features.map((f: any) => {
      const [lon, lat] = f.geometry.coordinates[0][0]
      return { id: f.properties.id as string, lat: lat as number, lon: lon as number }
    }) ?? []
  , [rawGeojson])

  // Imperatively style only the newly hit spots — O(painted) not O(65k), no React re-render
  const handlePaintAddSpots = useCallback((newIds: string[]) => {
    newIds.forEach(id => (paintLayerMapRef.current.get(id) as L.Path | undefined)?.setStyle(PAINT_STYLE))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  // Called once per stroke on mouseup — commits painted IDs to state (triggers one full setStyle)
  const handlePaintComplete = useCallback((allIds: string[]) => {
    if (allIds.length === 0) return
    setSelectedId(null)
    setActiveNeighborhood(null)
    setSelectedIds(prev => {
      const next = new Set(prev)
      allIds.forEach(id => next.add(id))
      return next
    })
  }, [])

  const handlePolygonComplete = useCallback((verts: LatLng[]) => {
    setSelectedId(null)
    setActiveNeighborhood(null)
    setDrawModeSync('none')
    if (verts.length < 3) return  // cancelled via Escape
    const ids = new Set<string>(
      paintCandidates
        .filter(c => pointInPolygon(c.lat, c.lon, verts))
        .map(c => c.id)
    )
    setSelectedIds(ids)
  }, [paintCandidates]) // eslint-disable-line react-hooks/exhaustive-deps

  const handleNeighborhoodSelect = useCallback((feature: NeighborhoodFeature) => {
    setNeighborhoodPanelOpen(false)
    const { geometry } = feature
    const rings: number[][][] = geometry.type === 'Polygon'
      ? [geometry.coordinates[0]]
      : geometry.coordinates.map(poly => poly[0])
    const ringVertexSets = rings.map(ring => ring.map(([lng, lat]) => ({ lat, lng })))
    const ids = new Set<string>(
      paintCandidates
        .filter(c => ringVertexSets.some(verts => pointInPolygon(c.lat, c.lon, verts as LatLng[])))
        .map(c => c.id)
    )
    setSelectedId(null)
    setSelectedIds(ids)
    setActiveNeighborhood(feature)
  }, [paintCandidates])

  const handleSelectId = useCallback((id: string) => {
    if (drawModeRef.current !== 'none') return
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
    if (!user?.id) return
    setBatchLabel('Saving your votes…')
    setBatchSubmitting(true)
    setBatchError(null)
    const ids = Array.from(selectedIds)
    // Optimistic community total update
    setCommunityTotal(prev => {
      if (prev === null) return prev
      if (support) {
        // Count spots not already yes-voted
        return prev + ids.filter(id => userVotes[id] !== true).length
      } else {
        // Count spots that were yes-voted (now being flipped to no)
        return prev - ids.filter(id => userVotes[id] === true).length
      }
    })
    const CHUNK = 500
    setBatchProgress({ done: 0, total: ids.length })
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        await axios.post(`${API}/api/votes/batch`, { site_ids: chunk, support, comment: batchComment || null, user_id: user.id }, { timeout: 15000 })
        setBatchProgress({ done: Math.min(i + CHUNK, ids.length), total: ids.length })
      }
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
      const prevYes = Object.values(userVotes).filter(Boolean).length
      const stored = localStorage.getItem('parkingVotes_v1')
      const all = stored ? JSON.parse(stored) as Record<string, Record<string, boolean>> : {}
      const userMap = { ...(all[user.id] ?? {}) }
      for (const id of ids) userMap[id] = support
      all[user.id] = userMap
      localStorage.setItem('parkingVotes_v1', JSON.stringify(all))
      if (support) {
        const newYes = Object.values(userMap).filter(Boolean).length
        checkMilestones(newYes, prevYes)
      }
      setSelectedIds(new Set()); setBatchComment('')
      fetchCommunityTotal()
    } catch {
      setBatchError('Failed to save votes. Please try again.')
    } finally {
      setBatchSubmitting(false)
      setBatchProgress(null)
    }
  }

  async function submitBatchUndo() {
    const ids = Array.from(selectedIds)
    if (!ids.length || !user?.id) return
    setBatchLabel('Clearing votes…')
    setBatchSubmitting(true)
    setBatchError(null)
    // Optimistic: subtract yes votes being cleared
    setCommunityTotal(prev => prev !== null ? prev - ids.filter(id => userVotes[id] === true).length : prev)
    const prevVotes = { ...userVotes }
    setUserVotes(prev => { const n = { ...prev }; ids.forEach(id => delete n[id]); return n })
    // Bulk localStorage clear — one read + one write instead of O(n) individual calls
    const stored = localStorage.getItem('parkingVotes_v1')
    if (stored) {
      const all = JSON.parse(stored) as Record<string, Record<string, boolean>>
      const userMap = { ...(all[user.id] ?? {}) }
      ids.forEach(id => delete userMap[id])
      all[user.id] = userMap
      localStorage.setItem('parkingVotes_v1', JSON.stringify(all))
    }
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
    const CHUNK = 500
    setBatchProgress({ done: 0, total: ids.length })
    try {
      for (let i = 0; i < ids.length; i += CHUNK) {
        const chunk = ids.slice(i, i + CHUNK)
        await axios.delete(`${API}/api/votes/batch`, { data: { site_ids: chunk, user_id: user.id }, timeout: 15000 })
        setBatchProgress({ done: Math.min(i + CHUNK, ids.length), total: ids.length })
      }
      fetchCommunityTotal()
    } catch {
      setBatchError('Failed to clear votes. Please try again.')
    } finally {
      setBatchSubmitting(false)
      setBatchProgress(null)
      setSelectedIds(new Set())
      setBatchComment('')
    }
  }

  const selectedSite = selectedId && rawGeojson
    ? (() => {
        const f = rawGeojson.features.find((f: any) => f.properties.id === selectedId)
        return f ? featureToVoteSite(f.properties, f.geometry.coordinates[0]) : null
      })()
    : null
  const selectedTally = selectedId ? (voteCounts[selectedId] ?? { yes: 0, no: 0, total: 0 }) : { yes: 0, no: 0, total: 0 }

  const goalCopy = GOAL_COPY[userGoal] ?? GOAL_COPY[6000]

  return (
    <div className="flex flex-col flex-1 overflow-hidden">

      {/* ── Progress header ─────────────────────────────────────────────── */}
      <div className="bg-primary-900 shrink-0 border-b border-primary-800">

        {/* Collapsed bar — always visible */}
        <button
          onClick={() => setHeaderExpanded(prev => !prev)}
          className="w-full px-5 py-2.5 flex items-center gap-3 focus:outline-none"
        >
          {/* YOUR PROGRESS label + numbers + mini bar + pct */}
          <span className="text-teal-400 text-xs font-semibold uppercase tracking-widest shrink-0">Your Progress</span>
          <span className="text-white text-xs font-bold shrink-0">{yesCount.toLocaleString()} / {userGoal.toLocaleString()}</span>
          <div className="relative w-16 h-1.5 bg-white/10 rounded-full shrink-0 overflow-hidden">
            <div className="h-full bg-teal-400 rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
          <span className="text-teal-400 text-xs font-semibold shrink-0">{progressPct}%</span>

          {/* Divider */}
          <span className="text-white/15 text-sm shrink-0">|</span>

          {/* COMMUNITY label + number */}
          {communityTotal !== null && (
            <>
              <span className="text-teal-400 text-xs font-semibold uppercase tracking-widest shrink-0">Community</span>
              <span className="text-white text-xs font-bold shrink-0">{communityTotal.toLocaleString()} spots supported</span>
            </>
          )}

          {/* Spacer + chevron */}
          <span className="ml-auto text-teal-400/50 text-xs shrink-0">
            {headerExpanded ? '▲' : '▼'}
          </span>
        </button>

        {/* Expanded panel */}
        {headerExpanded && (
          <div className="px-5 pb-4 flex gap-0 border-t border-white/5">
            {/* Your Progress */}
            <div className="flex-1 pt-3 pr-5">
              <p className="text-xs text-teal-400 font-semibold uppercase tracking-widest mb-1">Your Progress</p>
              <p className="text-white font-bold text-xl leading-none">{yesCount.toLocaleString()}</p>
              <p className="text-teal-300/70 text-xs mt-0.5">of {userGoal.toLocaleString()} spots goal</p>
              <div className="mt-2.5 relative w-full h-2 bg-white/10 rounded-full overflow-visible">
                <div
                  className="h-2 bg-teal-400 rounded-full transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
                {[10, 25, 50, 75].map(pct => (
                  <div key={pct} className="absolute top-0 w-0.5 h-2 bg-white/30" style={{ left: `${pct}%` }} />
                ))}
              </div>
              <p className="text-teal-400 text-xs font-semibold mt-1">{progressPct}% complete</p>
            </div>

            {/* Vertical divider */}
            <div className="w-px bg-white/10 mt-3 self-stretch" />

            {/* Community */}
            {communityTotal !== null && (
              <div className="flex-1 pt-3 pl-5">
                <p className="text-xs text-teal-400 font-semibold uppercase tracking-widest mb-1">Community</p>
                <p className="text-white font-bold text-xl leading-none">{communityTotal.toLocaleString()}</p>
                <p className="text-teal-300/70 text-xs mt-0.5">spots supported across Oakland</p>
                <p className="text-teal-300/50 text-xs mt-1">yes votes only · {formatTax(communityTotal)} projected annual tax</p>
              </div>
            )}
          </div>
        )}
      </div>

      {/* ── Batch save progress ─────────────────────────────────────────── */}
      <ProgressToast
        visible={batchSubmitting}
        label={batchLabel}
        done={batchProgress?.done}
        total={batchProgress?.total}
      />

      {/* ── Toast notification ──────────────────────────────────────────── */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-[9998] bg-primary-900 border border-teal-600 rounded-2xl px-5 py-3.5 shadow-xl max-w-xs animate-fade-in-up">
          <p className="text-white font-semibold text-sm">{toast.label}</p>
          {toast.sub && <p className="text-teal-300 text-xs mt-0.5">{toast.sub}</p>}
        </div>
      )}

      {/* ── Halfway card overlay ────────────────────────────────────────── */}
      {halfwayCard && (
        <div className="fixed inset-0 flex items-center justify-center z-[9997] pointer-events-none">
          <div className="bg-primary-900 border border-teal-500 rounded-3xl px-8 py-6 shadow-2xl text-center max-w-xs animate-fade-in-up">
            <p className="text-3xl mb-2">🎉</p>
            <p className="text-white font-bold text-xl">Halfway there!</p>
            <p className="text-teal-300 text-sm mt-1">
              You've pledged {Math.round(userGoal / 2).toLocaleString()} homes for Oakland.
            </p>
          </div>
        </div>
      )}

      {/* ── 100% Celebration modal ──────────────────────────────────────── */}
      {celebModal && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[9999] p-6">
          <div className="bg-primary-900 border border-teal-500 rounded-3xl px-8 py-8 shadow-2xl text-center max-w-sm w-full">
            <p className="text-4xl mb-4">🏠</p>
            <h2 className="text-white font-bold text-2xl mb-2">{goalCopy.heading}</h2>
            <p className="text-teal-300 text-base mb-6">{goalCopy.impact}</p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  if (navigator.share) {
                    navigator.share({ title: 'I helped solve Oakland\'s housing crisis', url: window.location.href })
                  } else {
                    navigator.clipboard.writeText(window.location.href)
                    showToast('Link copied!', 'Share it with friends.')
                  }
                }}
                className="bg-teal-500 hover:bg-teal-400 text-white font-bold py-3 rounded-full transition-all"
              >
                Share my map ↗
              </button>
              <button
                onClick={() => setCelebModal(false)}
                className="text-teal-300/60 hover:text-teal-300 text-sm transition-colors"
              >
                Keep going →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toolbar */}
      {(() => {
        const DESCRIPTIONS: Record<string, string> = {
          rectangle: 'Click and drag to draw a box. All spots inside get selected.',
          circle: 'Click to set the center, drag outward to set the radius. All spots inside get selected.',
          polygon: 'Click to place points. Double-click or click the first point to finish. Right-click to undo a point. Esc to cancel.',
          paint: 'Hold and drag to highlight spots. Every spot you pass over gets selected. Use the slider to adjust brush size.',
        }
        return (
          <div className="bg-white border-b border-gray-200 px-4 py-2 flex items-center gap-2 shrink-0">

            {/* LEFT: selection tools */}
            <span className="text-sm font-semibold text-gray-700 shrink-0 mr-1">Select:</span>

            {/* Neighborhood quick-select — first in list */}
            <div className="relative shrink-0">
              <button
                ref={neighborhoodBtnRef}
                onClick={() => { setNeighborhoodPanelOpen(prev => !prev); setNeighborhoodSearch('') }}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors border shrink-0 ${
                  neighborhoodPanelOpen
                    ? 'bg-teal-100 text-teal-700 border-teal-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-transparent'
                }`}
              >
                <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5">
                  <path d="M8 1.5C5.515 1.5 3.5 3.515 3.5 6c0 3.75 4.5 8.5 4.5 8.5s4.5-4.75 4.5-8.5C12.5 3.515 10.485 1.5 8 1.5z" />
                  <circle cx="8" cy="6" r="1.5" fill="currentColor" stroke="none" />
                </svg>
                Neighborhood ▾
              </button>

              {neighborhoodPanelOpen && (
                <div
                  ref={neighborhoodPanelRef}
                  className="absolute top-full left-0 mt-1 z-[500] bg-white border border-gray-200 rounded-xl shadow-lg p-3 w-96"
                >
                  <input
                    type="text"
                    placeholder="Search neighborhoods…"
                    value={neighborhoodSearch}
                    onChange={e => setNeighborhoodSearch(e.target.value)}
                    autoFocus
                    className="w-full mb-2 px-3 py-1.5 text-xs border border-gray-200 rounded-lg focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400"
                  />
                  {neighborhoods.length === 0 ? (
                    <p className="text-xs text-gray-400 text-center py-2">No neighborhoods loaded</p>
                  ) : (() => {
                    const filtered = neighborhoodSearch.trim()
                      ? neighborhoods.filter(f => f.properties.name.toLowerCase().includes(neighborhoodSearch.toLowerCase()))
                      : neighborhoods
                    return filtered.length === 0 ? (
                      <p className="text-xs text-gray-400 text-center py-2">No matches</p>
                    ) : (
                      <div className="flex flex-wrap gap-1.5 max-h-52 overflow-y-auto">
                        {filtered.map(feature => (
                          <button
                            key={feature.properties.name}
                            onClick={() => handleNeighborhoodSelect(feature)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors border ${
                              activeNeighborhood?.properties.name === feature.properties.name
                                ? 'bg-teal-100 text-teal-700 border-teal-300'
                                : 'bg-gray-100 text-gray-700 hover:bg-teal-100 hover:text-teal-700 border-transparent hover:border-teal-300'
                            }`}
                          >
                            {feature.properties.name}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                </div>
              )}
            </div>

            {(['rectangle', 'circle', 'polygon', 'paint'] as DrawMode[]).map(mode => (
              <button
                key={mode}
                onClick={() => setDrawModeSync(drawMode === mode ? 'none' : mode as DrawMode)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors capitalize border shrink-0 ${
                  drawMode === mode
                    ? 'bg-orange-100 text-orange-700 border-orange-300'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200 border-transparent'
                }`}
              >
                {mode === 'rectangle'
                  ? <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5"><rect x="2" y="4" width="12" height="8" rx="1" /></svg>
                  : mode === 'circle'
                  ? <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="8" cy="8" r="5" /></svg>
                  : mode === 'polygon'
                  ? <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="8,1.5 14.5,5.5 12,13.5 4,13.5 1.5,5.5" strokeLinejoin="round" /></svg>
                  : <svg viewBox="0 0 16 16" className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="1.5"><path d="M12.5 1.5l2 2-8.5 8.5-3 .5.5-3 9-8z" strokeLinejoin="round" strokeLinecap="round" /><path d="M2.5 13.5a1 1 0 101.5-1.3" strokeLinecap="round" /></svg>
                }
                {mode}
              </button>
            ))}

            {drawMode === 'paint' && (
              <label className="flex items-center gap-2 text-xs text-gray-600 ml-1 shrink-0">
                <span className="shrink-0">Brush: {brushRadius}m</span>
                <input
                  type="range"
                  min={10}
                  max={100}
                  value={brushRadius}
                  onChange={e => setBrushRadius(Number(e.target.value))}
                  className="w-20 accent-orange-500"
                />
              </label>
            )}
            {selectedIds.size > 0 && (
              <button onClick={() => { setSelectedIds(new Set()); setActiveNeighborhood(null) }} className="ml-1 text-xs text-gray-400 hover:text-gray-600 shrink-0">
                Clear selection
              </button>
            )}

            {/* Active tool description — only shows when a tool is clicked */}
            {(drawMode !== 'none' || neighborhoodPanelOpen || activeNeighborhood) && (
              <span className="ml-2 text-xs font-medium text-orange-600 whitespace-nowrap overflow-hidden">
                {drawMode !== 'none'
                  ? DESCRIPTIONS[drawMode]
                  : 'Click a neighborhood to instantly select all parking spots inside it.'}
              </span>
            )}

            {/* RIGHT: map legend + total count */}
            <div className="ml-auto flex items-center gap-4 shrink-0">
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
              <div className="flex items-center gap-2 text-xs text-gray-400 border-l border-gray-200 pl-4">
                <span>{(rawGeojson?.total_spots ?? parkingCount)?.toLocaleString() ?? '—'} total spaces</span>
                {zoom < MIN_ZOOM && <span className="text-orange-500 font-medium">· Zoom in to see spaces</span>}
              </div>
            </div>

          </div>
        )
      })()}

      {/* Map + side panel */}
      <div className="flex flex-1 overflow-hidden relative">
        <MapContainer
          center={[37.8044, -122.2712]}
          zoom={14}
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
              layerMapRef={paintLayerMapRef}
              onReady={() => setLoading(false)}
            />
          )}

          {activeNeighborhood && (
            <Polygon
              positions={
                activeNeighborhood.geometry.type === 'MultiPolygon'
                  ? activeNeighborhood.geometry.coordinates.map(poly =>
                      poly.map(ring => ring.map(([lon, lat]) => [lat, lon] as [number, number]))
                    )
                  : [activeNeighborhood.geometry.coordinates.map(ring =>
                      ring.map(([lon, lat]) => [lat, lon] as [number, number])
                    )]
              }
              pathOptions={{ color: '#f97316', weight: 2.5, fillColor: '#f97316', fillOpacity: 0.12, dashArray: '6 4' }}
            />
          )}

          <RectangleDrawTool active={drawMode === 'rectangle'} onComplete={handleRectComplete} />
          <CircleDrawTool active={drawMode === 'circle'} onComplete={handleCircleComplete} />
          <PolygonDrawTool active={drawMode === 'polygon'} onComplete={handlePolygonComplete} />
          <PaintBrushTool
            active={drawMode === 'paint'}
            brushRadius={brushRadius}
            candidates={paintCandidates}
            onAddSpots={handlePaintAddSpots}
            onComplete={handlePaintComplete}
          />
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
              const prevVote = userVotes[id]
              setUserVotes(prev => ({ ...prev, [id]: support }))
              persistVote(id, support)
              setVoteCounts(prev => ({ ...prev, [id]: tally }))
              // Optimistic: +1 if new yes or flipped from no→yes; -1 if flipped from yes→no
              setCommunityTotal(prev => {
                if (prev === null) return prev
                if (support && prevVote !== true) return prev + 1
                if (!support && prevVote === true) return prev - 1
                return prev
              })
              fetchCommunityTotal()
            }}
            onVoteUndone={(id: string, tally: VoteTally) => {
              const prevVote = userVotes[id]
              setUserVotes(prev => { const n = { ...prev }; delete n[id]; return n })
              unpersistVote(id)
              setVoteCounts(prev => ({ ...prev, [id]: tally }))
              // Optimistic: -1 only if we're removing a yes vote
              if (prevVote === true) setCommunityTotal(prev => prev !== null ? prev - 1 : prev)
              fetchCommunityTotal()
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
            <span className="text-primary-300 font-normal"> · each ≈ 30 ft × 10 ft = 1 home</span>
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
