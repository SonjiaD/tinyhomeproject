// src/pages/HomePage.tsx

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface RankedSite {
  lat: number
  lon: number
  rank: number
  final_score: number
}

export default function HomePage() {
  const navigate = useNavigate()
  const [mapData, setMapData] = useState<RankedSite[]>([])

  useEffect(() => {
    fetch('https://tinyhomeproject.onrender.com/api/default_map')
      .then(res => res.json())
      .then(data => setMapData(data.top_sites))
      .catch(err => console.error('Failed to load default map data', err))
  }, [])

  const getRankColor = (rank: number) => {
    if (rank <= 100) return "#1b5e20"
    if (rank <= 200) return "#388e3c"
    if (rank <= 300) return "#66bb6a"
    if (rank <= 400) return "#a5d6a7"
    return "#e8f5e9"
  }

  return (
    <div className="min-h-screen bg-white font-sans text-gray-800">
      <main className="p-6 max-w-4xl mx-auto">
        <section className="mb-10">
          <h1 className="text-3xl font-bold mb-1">Tiny Home Project: Site Selection Tool</h1>
          <p className="text-sm text-gray-600 mb-6">Supporting equitable housing in Oakland, CA</p>

          <h2 className="text-2xl font-semibold mb-2">What is this site?</h2>
          <p className="text-gray-700">
            This tool helps identify the best locations in Oakland, California for building tiny homes as a housing solution
            for the unhoused population. Using public data and multi-criteria decision-making (MCDM) methods like the
            Analytical Hierarchy Process (AHP), the tool lets users compare urban planning features and generate rankings
            of optimal sites.
          </p>
          <p className="mt-3 text-gray-700">
            The map below shows the top 500 ranked parking lots or land parcels based on default priority weights.
            Users can also go to the AHP tool to customize their priorities and generate personalized results.
          </p>
          <button
            onClick={() => navigate('/ahp')}
            className="mt-4 px-5 py-2 bg-green-700 text-white rounded hover:bg-green-800 transition"
          >
            Go to AHP Tool →
          </button>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Map of Ranked Sites</h2>
          <MapContainer
            center={[37.8044, -122.2712]}
            zoom={13}
            scrollWheelZoom={true}
            style={{ height: '500px', width: '100%', borderRadius: '8px' }}
          >
            <TileLayer
              attribution='&copy; <a href="http://www.openstreetmap.org/copyright">OpenStreetMap</a>'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />
            {mapData.map((site, idx) => (
              <CircleMarker
                key={idx}
                center={[site.lat, site.lon]}
                radius={5}
                color={getRankColor(site.rank)}
                fillOpacity={0.9}
              >
                <LeafletTooltip direction="top" offset={[0, -5]} opacity={1} permanent={false}>
                  <div>
                    <b>Rank:</b> {site.rank}<br />
                    <b>Score:</b> {site.final_score.toFixed(4)}
                  </div>
                </LeafletTooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </section>
      </main>

      <footer className="bg-gray-100 py-4 mt-12 text-center text-sm text-gray-600">
        &copy; 2025 Tiny Home Project. Built with ❤️ by Kalyan Lab at UBC.
      </footer>
    </div>
  )
}