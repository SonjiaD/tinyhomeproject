import { useState } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const features = [
  "Transit Access",
  "Homeless Services Nearby",
  "Affordable Housing Nearby",
  "Access to Water Infrastructure",
  "Nearby City Facilities",
  "Urban Plan Priority Area"
]

const allPairs = (features: string[]) => {
  const pairs = []
  for (let i = 0; i < features.length; i++) {
    for (let j = i + 1; j < features.length; j++) {
      pairs.push([features[i], features[j]])
    }
  }
  return pairs
}

type RankedSite = {
  lat: number
  lon: number
  rank: number
  final_score: number
}

function App() {
  const [comparisons, setComparisons] = useState<{ [key: string]: string }>({})
  const [result, setResult] = useState<{ [key: string]: number }>({})
  const [mapData, setMapData] = useState<RankedSite[]>([])

  const handleChange = (key: string, value: string) => {
    setComparisons(prev => ({ ...prev, [key]: value }))
  }

  const submit = async () => {
    const response = await axios.post("http://localhost:5000/api/ahp", { comparisons })
    setResult(response.data.weights)
    setMapData(response.data.top_sites)
  }

  const getRankColor = (rank: number) => {
    if (rank <= 100) return "#1b5e20"
    if (rank <= 200) return "#388e3c"
    if (rank <= 300) return "#66bb6a"
    if (rank <= 400) return "#a5d6a7"
    return "#e8f5e9"
  }

  const mapCenter = mapData.length
    ? [mapData[0].lat, mapData[0].lon]
    : [37.8044, -122.2712] // Oakland fallback

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <h1 className="text-2xl font-bold mb-4">AHP Feature Comparisons</h1>
      <div className="grid grid-cols-1 gap-6 max-w-3xl">
        {allPairs(features).map(([f1, f2]) => {
          const key = `${f1}__vs__${f2}`
          return (
            <div key={key} className="flex flex-col">
              <label className="mb-1 font-medium">{`How much more important is "${f1}" than "${f2}"?`}</label>
              <select
                className="border rounded px-3 py-2"
                value={comparisons[key] || "Equal"}
                onChange={e => handleChange(key, e.target.value)}
              >
                <option>{`${f1} much more`}</option>
                <option>{`${f1} more`}</option>
                <option>Equal</option>
                <option>{`${f2} more`}</option>
                <option>{`${f2} much more`}</option>
              </select>
            </div>
          )
        })}
      </div>

      <button
        onClick={submit}
        className="mt-6 bg-green-700 text-white px-4 py-2 rounded hover:bg-green-800"
      >
        Compute Priorities
      </button>

      {Object.keys(result).length > 0 && (
        <div className="mt-10 max-w-xl">
          <h2 className="text-xl font-semibold mb-3">Results:</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={Object.entries(result).map(([k, v]) => ({ feature: k, weight: v }))}>
              <XAxis dataKey="feature" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="weight" fill="#4a6240" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {mapData.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-3">Top 500 Ranked Sites Map</h2>
          <MapContainer
            center={mapCenter as [number, number]}
            zoom={13}
            scrollWheelZoom={true}
            style={{ height: "500px", width: "100%", borderRadius: "8px" }}
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
        </div>
      )}
    </div>
  )
}

export default App
