import { useMemo, useState } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { PageHeader } from '../components/PageHeader'
import { SiteMap, type RankedSite } from '../components/SiteMap'
import { SubmissionForm } from '../components/SubmissionForm'
import { Footer } from '../components/Footer'
import { colors } from '../lib/colors'

const FEATURE_LABELS: Record<string, string> = {
  transit_dist: 'Transit Access',
  assisted_housing_dist: 'Assisted Housing',
  public_housing_dist: 'Affordable Housing',
  general_plan_dist: 'Urban Plan Priority Area',
  water_fountain_dist: 'Public Water Fountains',
  man_water_dist: 'Manual Water Access',
  mobile_vending_dist: 'Mobile Vending Access',
  water_infrastructure_dist: 'Water Infrastructure',
  streams_oakland_dist: 'Oakland Streams',
  sewer_collection_dist: 'Sewer Collection',
  wildfire_dist: 'Wildfire Risk',
}

export default function LinearWeightingPage() {
  const [weightsPct, setWeightsPct] = useState<Record<string, number>>(
    Object.fromEntries(Object.keys(FEATURE_LABELS).map(k => [k, 0]))
  )
  const [mapData, setMapData] = useState<RankedSite[]>([])
  const [loading, setLoading] = useState(false)

  const totalPct = useMemo(
    () => Object.values(weightsPct).reduce((a, b) => a + (b || 0), 0),
    [weightsPct]
  )

  const weights01 = useMemo(() => {
    const t = totalPct > 0 ? totalPct : 1
    return Object.fromEntries(
      Object.entries(weightsPct).map(([k, v]) => [k, (v || 0) / t])
    )
  }, [weightsPct, totalPct])

  const chartData = useMemo(
    () =>
      Object.entries(weights01).map(([k, v]) => ({
        feature: FEATURE_LABELS[k] || k,
        weight: v,
      })),
    [weights01]
  )

  const generate = async () => {
    setLoading(true)
    try {
      const resp = await axios.post(
        `${import.meta.env.VITE_API_URL}/api/wsm`,
        { weights: weights01 }
      )
      setMapData(resp.data.top_sites || [])
    } catch (e) {
      console.error(e)
      alert('There was a problem computing rankings. Please check the server logs.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader
        title="Linear Weighting (WSM)"
        description="Set feature importances using sliders (0–100%). We normalize your choices to sum to 1 and rank sites by the weighted sum of normalized distances."
      />

      <div className="max-w-5xl mx-auto px-6 py-10 w-full">
        {/* Sliders */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {Object.entries(FEATURE_LABELS).map(([key, label]) => (
            <div
              key={key}
              className="bg-white rounded-xl border border-border p-5 hover:border-primary-500/30 transition-colors"
            >
              <div className="flex items-center justify-between mb-3">
                <label className="text-sm font-medium text-gray-800">{label}</label>
                <span className="text-sm font-semibold text-primary-700 tabular-nums">
                  {weightsPct[key] ?? 0}%
                </span>
              </div>
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={weightsPct[key] ?? 0}
                onChange={e =>
                  setWeightsPct(prev => ({
                    ...prev,
                    [key]: Number(e.target.value),
                  }))
                }
                className="slider-custom"
                style={{ '--value-pct': `${weightsPct[key] ?? 0}%` } as React.CSSProperties}
              />
            </div>
          ))}
        </div>

        <div className="mt-5 text-sm text-gray-600">
          <span className="font-medium">Total:</span>{' '}
          <span className={totalPct === 100 ? 'text-emerald-700 font-semibold' : 'text-amber-700 font-semibold'}>
            {totalPct}%
          </span>{' '}
          <span className="text-gray-400">(normalized automatically if not 100%)</span>
        </div>

        <button
          onClick={generate}
          disabled={loading}
          className={`mt-5 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
            loading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-primary-700 hover:bg-primary-800'
          }`}
        >
          {loading ? 'Ranking...' : 'Generate Rankings'}
        </button>

        {/* Chart */}
        <div className="mt-10">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Current Weights</h2>
          <div className="bg-white rounded-xl border border-border p-4">
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                <XAxis dataKey="feature" angle={-20} textAnchor="end" interval={0} height={60} tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="weight" fill={colors.chart.bar} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Map */}
        {mapData.length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">Top 500 Ranked Sites</h2>
            <SiteMap sites={mapData} height="600px" ranked />
          </div>
        )}

        {/* Submission */}
        {mapData.length > 0 && (
          <SubmissionForm
            method="WSM"
            weights={weights01}
            topSites={mapData}
          />
        )}
      </div>

      <Footer />
    </div>
  )
}
