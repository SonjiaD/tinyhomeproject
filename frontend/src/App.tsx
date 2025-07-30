import { useState } from 'react'
import axios from 'axios'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts'

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

function App() {
  const [comparisons, setComparisons] = useState<{ [key: string]: string }>({})
  const [result, setResult] = useState<{ [key: string]: number }>({})

  const handleChange = (key: string, value: string) => {
    setComparisons(prev => ({ ...prev, [key]: value }))
  }

  const submit = async () => {
    const response = await axios.post("http://localhost:5000/api/ahp", { comparisons })
    setResult(response.data.weights)
  }

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
    </div>
  )
}

export default App
