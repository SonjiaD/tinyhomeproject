import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { supabase } from '../lib/supabase'

const goals = [
  {
    units: 6000,
    label: 'Prove the Concept',
    tag: 'STARTER',
    pct: 14,
    headline: '6,000 units',
    desc: 'More units than any single recent year of Oakland construction. A quarter of the RHNA gap closed.',
    barColor: 'bg-teal-400',
    border: 'border-teal-500',
    ring: 'ring-teal-500',
  },
  {
    units: 18000,
    label: 'Meet the State Obligation',
    tag: 'REQUIRED',
    pct: 40,
    headline: '18,000 units',
    desc: 'The full projected RHNA shortfall closed. Oakland meets its legal housing obligation by 2031.',
    barColor: 'bg-teal-300',
    border: 'border-teal-400',
    ring: 'ring-teal-400',
  },
  {
    units: 30000,
    label: 'End the Affordability Crisis',
    tag: 'TRANSFORMATIVE',
    pct: 65,
    headline: '30,000 units',
    desc: "Enough supply to push Oakland's vacancy rate to 6-7%, the level at which rents actually start falling.",
    barColor: 'bg-orange-300',
    border: 'border-orange-400',
    ring: 'ring-orange-400',
  },
]

export default function OnboardingGoalPage() {
  const navigate = useNavigate()
  const [selected, setSelected] = useState<number | null>(null)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function handleConfirm() {
    if (selected === null) return
    setSaving(true)
    const { error } = await supabase.auth.updateUser({ data: { goal: selected } })
    setSaving(false)
    if (error) {
      setError('Could not save your goal. Please try again.')
    } else {
      navigate('/home')
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: '#0f2a2a' }}>
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-4xl"
      >
        <div className="text-center mb-10">
          <p className="text-xs font-semibold tracking-[0.2em] uppercase text-teal-400 mb-3">Step 1 of 3</p>
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">Pick your ambition.</h1>
          <p className="text-teal-300 max-w-xl mx-auto leading-relaxed">
            How many parking spaces do you want to see converted to homes? This sets your personal target for the voting map.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
          {goals.map((g, i) => {
            const isSelected = selected === g.units
            return (
              <motion.button
                key={g.units}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1 + i * 0.1, duration: 0.4 }}
                onClick={() => setSelected(g.units)}
                className={`text-left rounded-2xl p-6 border-2 transition-all duration-200 focus:outline-none ${
                  isSelected
                    ? `${g.border} bg-white/10 ring-2 ${g.ring} ring-offset-2 ring-offset-transparent`
                    : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                }`}
              >
                <div className="mb-4">
                  <span className="text-xs font-bold tracking-widest text-teal-400/70">{g.tag}</span>
                  <p className="text-3xl font-bold text-white mt-1">{g.headline}</p>
                  <p className="text-sm text-teal-300">{g.pct}% of parking spaces</p>
                </div>

                <div className="mb-4">
                  <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <motion.div
                      className={`h-full ${g.barColor} rounded-full`}
                      initial={{ width: 0 }}
                      animate={{ width: `${g.pct}%` }}
                      transition={{ delay: 0.3 + i * 0.1, duration: 0.7, ease: 'easeOut' }}
                    />
                  </div>
                </div>

                <p className="text-lg font-bold text-white mb-2">{g.label}</p>
                <p className="text-sm text-teal-200/70 leading-relaxed">{g.desc}</p>

                {isSelected && (
                  <div className="mt-4 flex items-center gap-2 text-teal-400 text-sm font-medium">
                    <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
                      <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                    </svg>
                    Selected
                  </div>
                )}
              </motion.button>
            )
          })}
        </div>

        {error && (
          <p className="text-red-400 text-sm text-center mb-4 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>
        )}

        <div className="flex justify-center">
          <button
            onClick={handleConfirm}
            disabled={selected === null || saving}
            className="bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-10 py-4 rounded-full text-lg transition-all duration-200 shadow-lg"
          >
            {saving ? 'Saving…' : selected ? 'Start Voting →' : 'Choose a goal to continue'}
          </button>
        </div>

        <p className="text-teal-400/40 text-xs text-center mt-4">You can change this any time in your profile.</p>
      </motion.div>
    </div>
  )
}
