// src/pages/AHPPage.tsx
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

const featureMap: { [label: string]: string } = {
  "Transit Access": "transit_dist",
  "Homeless Services Nearby": "homeless_service_dist",
  "Affordable Housing Nearby": "public_housing_dist",
  "Access to Water Infrastructure": "water_infrastructure_dist",
  "Nearby City Facilities": "city_facility_dist",
  "Urban Plan Priority Area": "general_plan_dist",
}

const reverseMap: { [backendKey: string]: string } = Object.fromEntries(
  Object.entries(featureMap).map(([label, key]) => [key, label])
)

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

export default function AHPPage() {
  const [comparisons, setComparisons] = useState<{ [key: string]: string }>({})
  const [result, setResult] = useState<{ [key: string]: number }>({})
  const [mapData, setMapData] = useState<RankedSite[]>([])
  const [loading, setLoading] = useState(false)

  // User info for feedback
  const [userName, setUserName] = useState('')
  const [occupation, setOccupation] = useState('')
  const [location, setLocation] = useState('')
  const [feedback, setFeedback] = useState('')
  const [saveMessage, setSaveMessage] = useState('')

  const handleChange = (key: string, value: string) => {
    setComparisons(prev => ({ ...prev, [key]: value }))
  }

  const submit = async () => {
    setLoading(true)
    try {
      const response = await axios.post("https://tinyhomeproject.onrender.com/api/ahp", { comparisons })
      setResult(response.data.weights)
      setMapData(response.data.top_sites)
    } catch (err) {
      console.error("API error:", err)
      alert("Something went wrong contacting the server. Please try again.")
    } finally {
      setLoading(false)
    }
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
        disabled={loading}
        className={`mt-6 px-4 py-2 rounded text-white ${
          loading ? "bg-gray-400 cursor-not-allowed" : "bg-green-700 hover:bg-green-800"
        }`}
      >
        {loading ? "Computing..." : "Compute Priorities"}
      </button>

      {loading && (
        <div className="mt-4 flex items-center gap-2 text-gray-700 text-sm">
          <svg className="animate-spin h-5 w-5 text-green-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
          </svg>
          Computing priorities and ranking sites...
        </div>
      )}

      {Object.keys(result).length > 0 && (
        <div className="mt-10 max-w-xl">
          <h2 className="text-xl font-semibold mb-3">Results:</h2>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart
            //reverse map to make feature names clearer
            data={Object.entries(result).map(([k, v]) => ({ feature: reverseMap[k] || k, weight: v }))}
            margin={{ top: 20, right: 30, left: 50, bottom: 60 }} // <-- more bottom space
            >              
            <XAxis 
                dataKey="feature" 
                angle={-20} 
                textAnchor="end" 
                interval={0} 
                height={60}
                />
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
          
          <div className="mt-10 max-w-xl">
            <h2 className="text-xl font-semibold mb-3">Submit Your Map</h2>
            <p className="text-gray-600 mb-4">
              Thank you for using our tool! You can optionally share your preferences and ranked sites
              to support research by the Kalyan Lab at UBC. Only anonymized data will be used.
            </p>

            <div className="space-y-4">
              <input
                type="text"
                className="w-full border px-4 py-2 rounded"
                placeholder="Your Name (optional)"
                value={userName}
                onChange={e => setUserName(e.target.value)}
              />
              <input
                type="text"
                className="w-full border px-4 py-2 rounded"
                placeholder="Occupation or Role (e.g. Student, Planner)"
                value={occupation}
                onChange={e => setOccupation(e.target.value)}
              />
              <input
                type="text"
                className="w-full border px-4 py-2 rounded"
                placeholder="Location (City, Country)"
                value={location}
                onChange={e => setLocation(e.target.value)}
              />
              <textarea
                className="w-full border px-4 py-2 rounded"
                placeholder="Optional feedback or why you picked your weights..."
                value={feedback}
                onChange={e => setFeedback(e.target.value)}
                rows={4}
              />
            </div>

            <button
              onClick={async () => {
                try {
                  await axios.post("https://tinyhomeproject.onrender.com/api/save_map", {
                    name: userName,
                    occupation,
                    location,
                    feedback,
                    weights: result,
                    top_sites: mapData,
                  })
                  setSaveMessage("✅ Your submission was saved. Thank you!")
                } catch (err) {
                  console.error(err)
                  setSaveMessage("❌ There was a problem saving your map.")
                }
              }}
              className="mt-4 px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800"
            >
              Save My Map
            </button>

            {saveMessage && (
              <div className="mt-2 text-sm text-gray-700">{saveMessage}</div>
            )}
          </div>


        </div>

        
      )}

      

    </div>

    
  )
}
