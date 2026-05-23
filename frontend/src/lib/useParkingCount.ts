import { useState, useEffect } from 'react'

let cached: number | null = null

export function useParkingCount(): number | null {
  const [count, setCount] = useState<number | null>(cached)

  useEffect(() => {
    if (cached !== null) { setCount(cached); return }
    const apiUrl = import.meta.env.VITE_API_URL || ''
    fetch(`${apiUrl}/api/polygon_count`)
      .then(r => r.json())
      .then(data => {
        cached = data.total_spots ?? null
        if (cached !== null) setCount(cached)
      })
      .catch(() => {})
  }, [])

  return count
}
