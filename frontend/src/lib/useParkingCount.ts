import { useState, useEffect } from 'react'

let cached: number | null = null

export function useParkingCount(): number | null {
  const [count, setCount] = useState<number | null>(cached)

  useEffect(() => {
    if (cached !== null) { setCount(cached); return }
    fetch('/parking_polygons.geojson', { headers: { Range: 'bytes=0-300' } })
      .then(r => r.text())
      .then(text => {
        const m = text.match(/"total_spots":(\d+)/)
        if (m) { cached = parseInt(m[1], 10); setCount(cached) }
      })
      .catch(() => {})
  }, [])

  return count
}
