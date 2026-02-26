import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { SiteMap } from '../components/SiteMap'
import { Footer } from '../components/Footer'

interface Site {
  lat: number
  lon: number
  polygon: [number, number][]
}

const steps = [
  {
    num: '1',
    title: 'Pick a method',
    desc: 'Choose between AHP (pairwise comparisons) or linear weighting (direct slider control) to express your priorities.',
  },
  {
    num: '2',
    title: 'Set your priorities',
    desc: 'Rate the importance of transit access, housing proximity, water infrastructure, and other urban criteria.',
  },
  {
    num: '3',
    title: 'View ranked sites',
    desc: 'See the top 500 candidate sites ranked and color-coded on an interactive map, then optionally submit your results.',
  },
]

export default function HomePage() {
  const navigate = useNavigate()
  const [mapData, setMapData] = useState<Site[]>([])
  const [mapError, setMapError] = useState(false)

  useEffect(() => {
    fetch(`${import.meta.env.VITE_API_URL}/api/default_map`)
      .then(res => {
        if (!res.ok) throw new Error('API error')
        return res.json()
      })
      .then(data => setMapData(data.sites))
      .catch(() => setMapError(true))
  }, [])

  return (
    <div className="flex flex-col min-h-screen">
      {/* Hero */}
      <section className="bg-primary-900 text-white">
        <div className="max-w-6xl mx-auto px-6 py-20 md:py-28">
          <p className="text-xs font-semibold uppercase tracking-wider text-primary-200 mb-3">
            Oakland, CA &mdash; Community-Driven Site Selection
          </p>
          <h1 className="text-4xl md:text-5xl font-bold tracking-tight leading-tight max-w-3xl">
            Find the best sites for tiny home communities
          </h1>
          <p className="mt-4 text-lg text-primary-100 max-w-2xl leading-relaxed">
            Use data-driven decision tools to identify optimal locations for
            tiny home villages, balancing transit access, infrastructure, and
            community priorities.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <button
              onClick={() => navigate('/ahp')}
              className="px-6 py-2.5 bg-accent-600 hover:bg-accent-500 text-white font-medium rounded-lg transition-colors"
            >
              Try the AHP Tool
            </button>
            <button
              onClick={() => navigate('/linear')}
              className="px-6 py-2.5 bg-primary-700 hover:bg-primary-600 text-white font-medium rounded-lg border border-primary-500 transition-colors"
            >
              Linear Weighting
            </button>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section className="bg-surface-page py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-8 text-center">
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {steps.map(({ num, title, desc }) => (
              <div
                key={num}
                className="bg-white rounded-xl p-6 border border-border"
              >
                <div className="text-2xl font-bold text-primary-700 mb-2">{num}</div>
                <h3 className="font-semibold text-gray-800 mb-1">{title}</h3>
                <p className="text-sm text-gray-600 leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Map */}
      <section className="bg-surface-muted py-16">
        <div className="max-w-6xl mx-auto px-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-2">
            All Candidate Sites in Oakland
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Parking lots and land parcels evaluated for tiny home suitability.
          </p>

          {mapError && (
            <div className="mb-4 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg">
              <p className="text-sm text-red-700 font-medium">
                Could not load map data. The server may be starting up &mdash; please refresh in a moment.
              </p>
            </div>
          )}

          <SiteMap sites={mapData} height="560px" ranked={false} />
        </div>
      </section>

      <Footer />
    </div>
  )
}
