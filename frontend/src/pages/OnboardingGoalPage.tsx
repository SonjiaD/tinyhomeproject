import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Home, Key, Users, Megaphone, Circle } from 'lucide-react'
import { supabase } from '../lib/supabase'

const GOALS = [
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
    desc: "Enough supply to push Oakland's vacancy rate to 6–7%, the level at which rents actually start falling.",
    barColor: 'bg-orange-300',
    border: 'border-orange-400',
    ring: 'ring-orange-400',
  },
]

const ROLES = [
  { value: 'renter',    label: 'Renter',     Icon: Home },
  { value: 'homeowner', label: 'Homeowner',  Icon: Key },
  { value: 'neighbor',  label: 'Neighbor',   Icon: Users },
  { value: 'advocate',  label: 'Advocate',   Icon: Megaphone },
  { value: 'other',     label: 'Other',      Icon: Circle },
]

const NEIGHBORHOODS = [
  "Adams Point", "Allendale", "Arroyo Viejo", "Bartlett", "Bella Vista",
  "Brookfield Village", "Caballo Hills", "Castlemont", "Chinatown", "Cleveland Heights",
  "Clinton", "Coliseum", "Dimond", "Downtown", "Durant Manor",
  "East Peralta", "Eastmont Hills", "Elmhurst", "Fairfax", "Fitchburg",
  "Foothill Square", "Fruitvale", "Glenview", "Golden Gate", "Grand Lake",
  "Grass Valley", "Harbor Bay Isle", "Highland", "Hoover-Foster", "Ivy Hill",
  "Jingletown", "Knowland Park", "Laurel", "Lincoln Heights", "Lower Bottoms",
  "Maxwell Park", "Meadowbrook", "Merritt", "Millsmont", "Montclair",
  "Mosswood", "North Oakland", "Oakmore", "Old Oakland", "Peralta Hacienda",
  "Piedmont Ave", "Pill Hill", "Portola", "Rockridge", "San Antonio",
  "Santa Fe", "Seminary", "Sequoyah", "Shafter", "Skyline",
  "Sobrante Park", "Temescal", "Toler Heights", "Trestle Glen", "Upper Dimond",
  "Upper Laurel", "Waterfront", "West Oakland", "Woodminster",
]

const slideVariants = {
  enter: (dir: number) => ({ x: dir > 0 ? '100%' : '-100%', opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit: (dir: number) => ({ x: dir > 0 ? '-100%' : '100%', opacity: 0 }),
}

export default function OnboardingGoalPage() {
  const navigate = useNavigate()
  useEffect(() => {
    const el = document.getElementById('main-scroll')
    if (el) el.style.backgroundColor = '#0f2a2a'
    return () => { if (el) el.style.backgroundColor = '' }
  }, [])
  const [step, setStep] = useState(0) // 0, 1, 2
  const [dir, setDir] = useState(1)
  const [goal, setGoal] = useState<number | null>(null)
  const [neighborhood, setNeighborhood] = useState('')
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('')
  const [roles, setRoles] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const filteredNeighborhoods = neighborhoodSearch.length > 0
    ? NEIGHBORHOODS.filter(n => n.toLowerCase().includes(neighborhoodSearch.toLowerCase()))
    : NEIGHBORHOODS

  function toggleRole(value: string) {
    setRoles(prev => prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value])
  }

  function goNext() {
    setDir(1)
    setStep(s => s + 1)
  }

  function goBack() {
    setDir(-1)
    setStep(s => s - 1)
  }

  async function handleFinish() {
    if (goal === null) return
    setSaving(true)
    const { error } = await supabase.auth.updateUser({
      data: { goal, neighborhood: neighborhood || null, roles },
    })
    setSaving(false)
    if (error) {
      setError('Could not save your profile. Please try again.')
    } else {
      navigate('/parking-vote')
    }
  }

  async function handleSkipToEnd() {
    if (goal === null) return
    setSaving(true)
    const { error } = await supabase.auth.updateUser({
      data: { goal, neighborhood: neighborhood || null, roles },
    })
    setSaving(false)
    if (error) {
      setError('Could not save. Please try again.')
    } else {
      navigate('/parking-vote')
    }
  }

  const steps = [
    // Step 1 — Goal
    <div key="goal" className="w-full max-w-4xl">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-teal-400 mb-3">Step 1 of 3</p>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
          How much of Oakland's housing crisis do you want to solve?
        </h1>
        <p className="text-teal-300 max-w-xl mx-auto leading-relaxed">
          This sets your personal target on the voting map. You can change it any time.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-8">
        {GOALS.map((g, i) => {
          const isSelected = goal === g.units
          return (
            <motion.button
              key={g.units}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.08, duration: 0.4 }}
              onClick={() => setGoal(g.units)}
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

      {error && <p className="text-red-400 text-sm text-center mb-4 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>}

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={goNext}
          disabled={goal === null}
          className="bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-10 py-4 rounded-full text-lg transition-all duration-200 shadow-lg"
        >
          {goal ? 'Continue →' : 'Choose a goal to continue'}
        </button>
      </div>
    </div>,

    // Step 2 — Neighborhood
    <div key="neighborhood" className="w-full max-w-xl">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-teal-400 mb-3">Step 2 of 3</p>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
          Which part of Oakland do you care about most?
        </h1>
        <p className="text-teal-300 leading-relaxed">
          This helps us understand where Oaklanders want change.
        </p>
      </div>

      <input
        type="text"
        placeholder="Search neighborhoods…"
        value={neighborhoodSearch}
        onChange={e => setNeighborhoodSearch(e.target.value)}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-teal-400 focus:bg-white/10 transition-all mb-4 text-sm"
        autoFocus
      />

      <div className="flex flex-wrap gap-2 mb-6">
        {neighborhoodSearch.length > 0 &&
          !NEIGHBORHOODS.some(n => n.toLowerCase() === neighborhoodSearch.toLowerCase()) && (
          <button
            key="__custom__"
            onClick={() => { setNeighborhood(neighborhoodSearch); setNeighborhoodSearch(neighborhoodSearch) }}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 focus:outline-none ${
              neighborhood === neighborhoodSearch
                ? 'border-teal-400 bg-teal-400/20 text-teal-300'
                : 'border-teal-500/40 bg-teal-500/10 text-teal-300/80 hover:border-teal-400 hover:text-teal-300'
            }`}
          >
            + Use "{neighborhoodSearch}"
          </button>
        )}
        {filteredNeighborhoods.map(n => (
          <button
            key={n}
            onClick={() => setNeighborhood(n)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 focus:outline-none ${
              neighborhood === n
                ? 'border-teal-400 bg-teal-400/20 text-teal-300'
                : 'border-white/10 bg-white/5 text-teal-200/60 hover:border-white/20 hover:text-teal-200'
            }`}
          >
            {n}
          </button>
        ))}
      </div>

      {neighborhood && neighborhood !== 'not-oakland' && (
        <p className="text-teal-400 text-sm mb-4 flex items-center gap-1.5">
          <svg viewBox="0 0 20 20" className="w-4 h-4" fill="currentColor">
            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
          </svg>
          {neighborhood} selected
        </p>
      )}

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={goNext}
          disabled={!neighborhood}
          className="bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-10 py-4 rounded-full text-lg transition-all duration-200 shadow-lg w-full max-w-xs"
        >
          Continue →
        </button>
        <button
          onClick={() => { setNeighborhood('not-oakland'); goNext() }}
          className="text-teal-300/50 hover:text-teal-300 text-sm transition-colors"
        >
          I don't live in Oakland — Skip
        </button>
        <button onClick={goBack} className="text-teal-400/40 hover:text-teal-400 text-sm transition-colors">
          ← Back
        </button>
      </div>
    </div>,

    // Step 3 — Role
    <div key="role" className="w-full max-w-xl">
      <div className="text-center mb-10">
        <p className="text-xs font-semibold tracking-[0.2em] uppercase text-teal-400 mb-3">Step 3 of 3</p>
        <h1 className="text-3xl md:text-4xl font-bold text-white mb-3">
          What's your connection to Oakland?
        </h1>
        <p className="text-teal-300 leading-relaxed">Select all that apply.</p>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mb-8">
        {ROLES.map((r, i) => {
          const isSelected = roles.includes(r.value)
          return (
            <motion.button
              key={r.value}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.05 + i * 0.07 }}
              onClick={() => toggleRole(r.value)}
              className={`flex flex-col items-center gap-2.5 p-5 rounded-2xl border-2 text-sm font-medium transition-all duration-200 focus:outline-none ${
                isSelected
                  ? 'border-teal-400 bg-teal-400/20 text-teal-300 ring-2 ring-teal-400/30'
                  : 'border-white/10 bg-white/5 text-teal-200/70 hover:border-white/20 hover:bg-white/10'
              }`}
            >
              <r.Icon className="w-6 h-6" strokeWidth={1.5} />
              {r.label}
            </motion.button>
          )
        })}
      </div>

      {error && <p className="text-red-400 text-sm text-center mb-4 bg-red-400/10 rounded-lg px-4 py-2">{error}</p>}

      <div className="flex flex-col items-center gap-3">
        <button
          onClick={handleFinish}
          disabled={roles.length === 0 || saving}
          className="bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-10 py-4 rounded-full text-lg transition-all duration-200 shadow-lg w-full max-w-xs"
        >
          {saving ? 'Setting up your map…' : 'Start Voting →'}
        </button>
        <button
          onClick={handleSkipToEnd}
          disabled={saving}
          className="text-teal-300/50 hover:text-teal-300 text-sm transition-colors disabled:opacity-40"
        >
          Skip for now
        </button>
        <button onClick={goBack} className="text-teal-400/40 hover:text-teal-400 text-sm transition-colors">
          ← Back
        </button>
      </div>
    </div>,
  ]

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-6 py-12" style={{ background: '#0f2a2a' }}>
      {/* Progress dots */}
      <div className="flex gap-2 mb-10">
        {[0, 1, 2].map(i => (
          <div
            key={i}
            className={`rounded-full transition-all duration-300 ${
              i === step ? 'w-6 h-2 bg-teal-400' : i < step ? 'w-2 h-2 bg-teal-600' : 'w-2 h-2 bg-white/20'
            }`}
          />
        ))}
      </div>

      <div className="w-full flex justify-center overflow-hidden">
        <AnimatePresence mode="wait" custom={dir}>
          <motion.div
            key={step}
            custom={dir}
            variants={slideVariants}
            initial="enter"
            animate="center"
            exit="exit"
            transition={{ type: 'tween', ease: [0.25, 0.46, 0.45, 0.94], duration: 0.4 }}
            className="flex justify-center w-full"
          >
            {steps[step]}
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  )
}
