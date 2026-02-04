import { useState } from 'react'
import axios from 'axios'
import type { RankedSite } from './SiteMap'

interface SubmissionFormProps {
  method: 'AHP' | 'WSM'
  weights: Record<string, number>
  topSites: RankedSite[]
  consistencyRatio?: number | null
}

export function SubmissionForm({ method, weights, topSites, consistencyRatio }: SubmissionFormProps) {
  const [userName, setUserName] = useState('')
  const [occupation, setOccupation] = useState('')
  const [location, setLocation] = useState('')
  const [feedback, setFeedback] = useState('')
  const [saveMessage, setSaveMessage] = useState('')
  const [saving, setSaving] = useState(false)
  const [isError, setIsError] = useState(false)

  const handleSave = async () => {
    setSaving(true)
    setIsError(false)
    try {
      await axios.post(`${import.meta.env.VITE_API_URL}/api/save_ahp_submission`, {
        name: userName,
        occupation,
        location,
        feedback,
        method,
        consistency_ratio: consistencyRatio ?? undefined,
        weights,
        top_sites: topSites,
      })
      setSaveMessage('Your submission was saved. Thank you!')
    } catch (err) {
      console.error(err)
      setSaveMessage('There was a problem saving your submission.')
      setIsError(true)
      setSaving(false)
    }
  }

  const inputClass =
    'w-full bg-white border border-border-input rounded-lg px-4 py-2.5 text-sm text-gray-700 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-primary-500 hover:border-primary-500/50 transition-colors'

  return (
    <div className="bg-white rounded-xl border border-border p-6 mt-10">
      <h2 className="text-lg font-semibold text-gray-800 mb-1">Submit Your Results</h2>
      <p className="text-sm text-gray-500 mb-5">
        Optionally share your preferences and ranked sites to support research
        by the Kalyan Lab at UBC.
      </p>

      <div className="space-y-4">
        <input
          type="text"
          className={inputClass}
          placeholder="Your Name (optional)"
          value={userName}
          onChange={e => setUserName(e.target.value)}
        />
        <input
          type="text"
          className={inputClass}
          placeholder="Occupation or Role (e.g. Student, Planner)"
          value={occupation}
          onChange={e => setOccupation(e.target.value)}
        />
        <input
          type="text"
          className={inputClass}
          placeholder="Location (City, Country)"
          value={location}
          onChange={e => setLocation(e.target.value)}
        />
        <textarea
          className={inputClass}
          placeholder="Optional feedback or why you picked your weights..."
          value={feedback}
          onChange={e => setFeedback(e.target.value)}
          rows={4}
        />
      </div>

      <button
        disabled={saving}
        onClick={handleSave}
        className={`mt-4 px-5 py-2.5 rounded-lg text-white text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2 ${
          saving
            ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
            : 'bg-primary-700 hover:bg-primary-800'
        }`}
      >
        {saving ? 'Saved' : 'Save My Results'}
      </button>

      {saveMessage && (
        <div
          className={`mt-3 px-4 py-2.5 rounded-lg border text-sm font-medium ${
            isError
              ? 'bg-red-50 border-red-200 text-red-700'
              : 'bg-emerald-50 border-emerald-200 text-emerald-700'
          }`}
        >
          {saveMessage}
        </div>
      )}
    </div>
  )
}
