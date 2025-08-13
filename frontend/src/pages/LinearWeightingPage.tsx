// src/pages/LinearWeightingPage.tsx
import { useMemo, useState } from "react";
import axios from "axios";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
} from "recharts";
import {
  MapContainer, TileLayer, CircleMarker, Tooltip as LeafletTooltip,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";

// --- Feature set (from your Streamlit Simple MCDM) ---
const FEATURE_LABELS: Record<string, string> = {
  homeless_service_dist: "Homeless Services Nearby",
  transit_dist: "Transit Access",
  assisted_housing_dist: "Assisted Housing Nearby",
  public_housing_dist: "Affordable Housing Nearby",
  city_facility_dist: "Nearby City Facilities",
  general_plan_dist: "Urban Plan Priority Area",
  water_fountain_dist: "Public Water Fountain Nearby",
  man_water_dist: "Manual Water Access Nearby",
  mobile_vending_dist: "Mobile Vending Access",
  water_infrastructure_dist: "Access to Water Infrastructure",
  streams_oakland_dist: "Proximity to Oakland Streams",
  sewer_collection_dist: "Sewer Collection Distance",
  wildfire_dist: "Wildfire Risk Proximity",
};

type RankedSite = {
  lat: number;
  lon: number;
  rank: number;
  final_score: number;
};

export default function LinearWeightingPage() {
  // slider weights in percent [0..100]
  const [weightsPct, setWeightsPct] = useState<Record<string, number>>(
    Object.fromEntries(Object.keys(FEATURE_LABELS).map(k => [k, 0]))
  );
  const [mapData, setMapData] = useState<RankedSite[]>([]);
  const [loading, setLoading] = useState(false);

  // Optional “submit your map” fields (same as AHP page)
  const [userName, setUserName] = useState("");
  const [occupation, setOccupation] = useState("");
  const [location, setLocation] = useState("");
  const [feedback, setFeedback] = useState("");
  const [saveMessage, setSaveMessage] = useState("");

  const totalPct = useMemo(
    () => Object.values(weightsPct).reduce((a, b) => a + (b || 0), 0),
    [weightsPct]
  );

  // normalized weights (safeguard if total != 100)
  const weights01 = useMemo(() => {
    const t = totalPct > 0 ? totalPct : 1;
    const w = Object.fromEntries(
      Object.entries(weightsPct).map(([k, v]) => [k, (v || 0) / t])
    );
    return w; // sums to 1
  }, [weightsPct, totalPct]);

  const chartData = useMemo(
    () =>
      Object.entries(weights01).map(([k, v]) => ({
        feature: FEATURE_LABELS[k] || k,
        weight: v,
      })),
    [weights01]
  );

  const getRankColor = (rank: number) => {
    if (rank <= 100) return "#1b5e20";
    if (rank <= 200) return "#388e3c";
    if (rank <= 300) return "#66bb6a";
    if (rank <= 400) return "#a5d6a7";
    return "#e8f5e9";
  };

  const mapCenter: [number, number] =
    mapData.length > 0
      ? [mapData[0].lat, mapData[0].lon]
      : [37.8044, -122.2712]; // Oakland fallback

  const generate = async () => {
    setLoading(true);
    try {
      // call the new backend route (see section 2)
      const resp = await axios.post(
        "https://tinyhomeproject.onrender.com/api/wsm",
        { weights: weights01 }
      );
      setMapData(resp.data.top_sites || []);
    } catch (e) {
      console.error(e);
      alert(
        "There was a problem computing rankings. Please check the server logs."
      );
    } finally {
      setLoading(false);
    }
  };

  const saveSubmission = async () => {
    try {
      await axios.post("https://tinyhomeproject.onrender.com/api/save_ahp_submission", {
        name: userName,
        occupation,
        location,
        feedback,
        // store method + weights for later audit
        method: "WSM",
        weights: weights01,
        top_sites: mapData,
      });
      setSaveMessage("✅ Your submission was saved. Thank you!");
    } catch (err) {
      console.error(err);
      setSaveMessage("❌ There was a problem saving your map.");
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 font-sans">
      <h1 className="text-2xl font-bold mb-2">Linear Weighting (WSM)</h1>
      <p className="text-gray-700 mb-6">
        Set feature importances (0–100%). We normalize your choices to sum to 1
        and rank sites by the weighted sum of normalized distances
        (smaller score = better).
      </p>

      {/* Weights UI */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5 max-w-5xl">
        {Object.entries(FEATURE_LABELS).map(([key, label]) => (
          <div key={key} className="bg-white rounded-lg shadow p-4">
            <label className="block text-sm font-medium mb-2">{label}</label>
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              value={weightsPct[key] ?? 0}
              onChange={(e) =>
                setWeightsPct((prev) => ({
                  ...prev,
                  [key]: Number(e.target.value),
                }))
              }
              className="w-full"
            />
            <div className="mt-2 text-sm text-gray-700">
              {weightsPct[key] ?? 0}%
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 text-sm">
        <b>Total:</b>{" "}
        <span className={totalPct === 100 ? "text-green-700" : "text-amber-700"}>
          {totalPct}%
        </span>{" "}
        (we’ll normalize automatically if not exactly 100)
      </div>

      <button
        onClick={generate}
        disabled={loading}
        className={`mt-4 px-4 py-2 rounded text-white ${
          loading ? "bg-gray-400 cursor-not-allowed" : "bg-green-700 hover:bg-green-800"
        }`}
      >
        {loading ? "Ranking..." : "Generate Rankings"}
      </button>

      {/* Bar chart of weights */}
      <div className="mt-8 max-w-3xl">
        <h2 className="text-xl font-semibold mb-3">Current Weights</h2>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
            <XAxis dataKey="feature" angle={-20} textAnchor="end" interval={0} height={60} />
            <YAxis />
            <Tooltip />
            <Bar dataKey="weight" fill="#4a6240" />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Map */}
      {mapData.length > 0 && (
        <div className="mt-10">
          <h2 className="text-xl font-semibold mb-3">Top 500 Ranked Sites Map</h2>
          <MapContainer
            center={mapCenter}
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
                    <b>Rank:</b> {site.rank}
                    <br />
                    <b>Score:</b> {site.final_score.toFixed(4)}
                  </div>
                </LeafletTooltip>
              </CircleMarker>
            ))}
          </MapContainer>
        </div>
      )}

      {/* Save block (same pattern as AHP page) */}
      {mapData.length > 0 && (
        <div className="mt-10 max-w-xl">
          <h2 className="text-xl font-semibold mb-3">Submit Your Map</h2>
          <p className="text-gray-600 mb-4">
            You can optionally share your preferences and ranked sites to support our research.
          </p>

          <div className="space-y-3">
            <input
              type="text"
              className="w-full border px-4 py-2 rounded"
              placeholder="Your Name (optional)"
              value={userName}
              onChange={(e) => setUserName(e.target.value)}
            />
            <input
              type="text"
              className="w-full border px-4 py-2 rounded"
              placeholder="Occupation or Role (e.g. Student, Planner)"
              value={occupation}
              onChange={(e) => setOccupation(e.target.value)}
            />
            <input
              type="text"
              className="w-full border px-4 py-2 rounded"
              placeholder="Location (City, Country)"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
            <textarea
              className="w-full border px-4 py-2 rounded"
              placeholder="Optional feedback or why you picked your weights..."
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              rows={4}
            />
          </div>

          <button
            onClick={saveSubmission}
            className="mt-4 px-4 py-2 bg-green-700 text-white rounded hover:bg-green-800"
          >
            Save My Map
          </button>

          {saveMessage && <div className="mt-2 text-sm text-gray-700">{saveMessage}</div>}
        </div>
      )}
    </div>
  );
}
