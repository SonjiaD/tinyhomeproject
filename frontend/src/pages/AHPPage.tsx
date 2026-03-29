import { useState } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'
import { PageHeader } from '../components/PageHeader'
import { SiteMap, type RankedSite } from '../components/SiteMap'
import { SubmissionForm } from '../components/SubmissionForm'
import { Footer } from '../components/Footer'
import { colors } from '../lib/colors'
import { CustomSelect } from '../components/CustomSelect'

const features = [
  'Transit Access',
  'Affordable Housing',
  'Water Infrastructure',
  'Urban Plan Priority Area',
]

const featureMap: Record<string, string> = {
  'Transit Access': 'transit_dist',
  'Affordable Housing': 'public_housing_dist',
  'Water Infrastructure': 'water_infrastructure_dist',
  'Urban Plan Priority Area': 'general_plan_dist',
}

const reverseMap: Record<string, string> = Object.fromEntries(
  Object.entries(featureMap).map(([label, key]) => [key, label])
)

function allPairs(items: string[]) {
  const pairs: [string, string][] = []
  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      pairs.push([items[i], items[j]])
    }
  }
  return pairs
}

export default function AHPPage() {
  const [comparisons, setComparisons] = useState<Record<string, string>>({})
  const [result, setResult] = useState<Record<string, number>>({})
  const [mapData, setMapData] = useState<RankedSite[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [consistencyRatio, setConsistencyRatio] = useState<number | null>(null)

  const handleChange = (key: string, value: string) => {
    setComparisons(prev => ({ ...prev, [key]: value }))
  }

  const submit = async () => {
    setLoading(true)
    try {
      const response = await axios.post(`${import.meta.env.VITE_API_URL}/api/ahp`, { comparisons })
      setResult(response.data.weights)
      setMapData(response.data.top_sites)
      setConsistencyRatio(response.data.consistency?.CR ?? null)
    } catch (err) {
      console.error('API error:', err)
      setError('Something went wrong contacting the server. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader
        title="AHP Feature Comparisons"
        description="Compare features in pairs to express your priorities. The Analytic Hierarchy Process computes mathematically consistent weights from your comparisons."
      />

      <div className="max-w-3xl mx-auto px-6 py-10 w-full">
        {/* Comparison cards */}
        <div className="grid grid-cols-1 gap-5">
          {allPairs(features).map(([f1, f2], idx) => {
            const key = `${f1}__vs__${f2}`
            const qNum = idx + 1
            return (
              <div key={key} className="bg-white rounded-xl border border-border p-5">
                <label className="block mb-3">
                  <span className="text-xs font-semibold uppercase tracking-wider text-primary-700">
                    Q{qNum}
                  </span>
                  <span className="block mt-1 text-sm font-medium text-gray-800">
                    How much more important is &ldquo;{f1}&rdquo; than &ldquo;{f2}&rdquo;?
                  </span>
                </label>
                <CustomSelect
                  options={[
                    `${f1} much more`,
                    `${f1} more`,
                    'Equal',
                    `${f2} more`,
                    `${f2} much more`,
                  ]}
                  value={comparisons[key] || 'Equal'}
                  onChange={val => handleChange(key, val)}
                />
              </div>
            )
          })}
        </div>

        {error && (
          <div className="mt-4 rounded-md bg-accent-100 border border-accent-500 px-4 py-2.5">
            <p className="text-sm text-accent-700">{error}</p>
          </div>
        )}

        <button
          onClick={submit}
          disabled={loading}
          className={`mt-6 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
            loading
              ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
              : 'bg-primary-700 hover:bg-primary-800'
          }`}
        >
          {loading ? 'Computing...' : 'Compute Priorities'}
        </button>

        {loading && (
          <div className="mt-4 flex items-center gap-2 text-gray-600 text-sm">
            <svg className="animate-spin h-5 w-5 text-primary-700" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
            </svg>
            Computing priorities and ranking sites...
          </div>
        )}

        {/* Results chart */}
        {Object.keys(result).length > 0 && (
          <div className="mt-10">
            <h2 className="text-xl font-semibold text-gray-800 mb-3">Computed Weights</h2>
            <div className="bg-white rounded-xl border border-border p-4">
              <ResponsiveContainer width="100%" height={300}>
                <BarChart
                  data={Object.entries(result).map(([k, v]) => ({ feature: reverseMap[k] || k, weight: v }))}
                  margin={{ top: 20, right: 30, left: 50, bottom: 60 }}
                >
                  <XAxis dataKey="feature" angle={-20} textAnchor="end" interval={0} height={60} tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="weight" fill={colors.chart.bar} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {consistencyRatio !== null && (
              <p className="mt-3 text-sm text-gray-500">
                Consistency Ratio: <span className="font-medium text-gray-700">{consistencyRatio.toFixed(4)}</span>
                {consistencyRatio > 0.1 && (
                  <span className="ml-2 text-amber-600 font-medium">
                    (Above 0.1 threshold — your comparisons may be inconsistent)
                  </span>
                )}
              </p>
            )}
          </div>
        )}

      </div>

      {/* Map - wider than the form content */}
      {mapData.length > 0 && (
        <div className="max-w-5xl mx-auto px-6 mt-10 w-full">
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Top 500 Ranked Sites</h2>
          <SiteMap sites={mapData} height="600px" ranked />
        </div>
      )}

      {/* Submission - back to narrow width */}
      {mapData.length > 0 && (
        <div className="max-w-3xl mx-auto px-6 w-full">
          <SubmissionForm
            method="AHP"
            weights={result}
            topSites={mapData}
            consistencyRatio={consistencyRatio}
          />
        </div>
      )}

      <div className="pb-16" />

      <Footer />
    </div>
  )
}
