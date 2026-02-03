// src/pages/HomePage.tsx

import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MapContainer, TileLayer, CircleMarker } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

interface Site {
  lat: number
  lon: number
}

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
            The map below shows all candidate parking lots and land parcels in Oakland.
            Use the AHP or Linear Weighting tools to customize your priorities and generate personalized rankings.
          </p>
          <button
            onClick={() => navigate('/ahp')}
            className="mt-4 px-5 py-2 bg-green-700 text-white rounded hover:bg-green-800 transition"
          >
            Go to AHP Tool →
          </button>
        </section>

        <section>
          <h2 className="text-xl font-semibold mb-3">Map of Candidate Sites</h2>
          {mapError && (
            <p className="text-red-600 text-sm mb-3">
              Could not load map data. The server may be starting up — please refresh in a moment.
            </p>
          )}
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
                radius={4}
                color="#388e3c"
                fillOpacity={0.7}
              />
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