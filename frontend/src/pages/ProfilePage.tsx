import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Home, Key, Users, Megaphone, Circle } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../contexts/AuthContext'

const GOALS = [
  {
    units: 6000,
    label: 'Prove the Concept',
    tag: 'STARTER',
    pct: 14,
    headline: '6,000 units',
    desc: 'A serious demonstration. More units than any single recent year of Oakland construction.',
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
  { value: 'renter',    label: 'Renter',    Icon: Home },
  { value: 'homeowner', label: 'Homeowner', Icon: Key },
  { value: 'neighbor',  label: 'Neighbor',  Icon: Users },
  { value: 'advocate',  label: 'Advocate',  Icon: Megaphone },
  { value: 'other',     label: 'Other',     Icon: Circle },
]

const NEIGHBORHOODS = [
  "Adams Point", "Allendale", "Arroyo Viejo", "Bartlett", "Bella Vista",
  "Brookfield Village", "Caballo Hills", "Castlemont", "Chinatown", "Cleveland Heights",
  "Clinton", "Cloverdale", "Coal Tar", "Coliseum", "Coliseum Industrial",
  "Cox", "Dimond", "Downtown", "Durant Manor", "East Peralta",
  "Eastmont Hills", "Elmhurst", "Fairfax", "Farwell", "Fitchburg",
  "Foothill Square", "Fruitvale", "Glenview", "Golden Gate", "Grand Lake",
  "Grass Valley", "Harbor Bay Isle", "Hegenberger", "Highland", "Hoover-Foster",
  "Ivy Hill", "Jingletown", "Knowland Park", "Laurel", "Lincoln Heights",
  "Lower Bottoms", "Maxwell Park", "Meadowbrook", "Merritt", "Millsmont",
  "Montclair", "Mosswood", "North Kennedy Tract", "North Oakland", "Oakmore",
  "Old Oakland", "Peralta Hacienda", "Piedmont Ave", "Pill Hill", "Portola",
  "Ralph Bunche", "Reservoir Hill", "Rockridge", "San Antonio", "Santa Fe",
  "Seminary", "Sequoyah", "Shafter", "Skyline", "Sobrante Park",
  "South Kennedy Tract", "Temescal", "Toler Heights", "Trestle Glen",
  "Upper Dimond", "Upper Laurel", "Upper Peralta Creek", "Waterfront",
  "West Oakland", "Woodminster",
]

export default function ProfilePage() {
  const { user } = useAuth()
  const [goal, setGoal] = useState<number | null>(null)
  const [roles, setRoles] = useState<string[]>([])
  const [neighborhood, setNeighborhood] = useState('')
  const [neighborhoodSearch, setNeighborhoodSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const el = document.getElementById('main-scroll')
    if (el) el.style.backgroundColor = '#0f2a2a'
    return () => { if (el) el.style.backgroundColor = '' }
  }, [])

  useEffect(() => {
    const meta = user?.user_metadata
    if (!meta) return
    if (meta.goal) setGoal(meta.goal)
    if (meta.roles) setRoles(meta.roles)
    if (meta.neighborhood) {
      setNeighborhood(meta.neighborhood)
      setNeighborhoodSearch(meta.neighborhood === 'not-oakland' ? '' : meta.neighborhood)
    }
  }, [user])

  const filteredNeighborhoods = neighborhoodSearch.length > 0
    ? NEIGHBORHOODS.filter(n => n.toLowerCase().includes(neighborhoodSearch.toLowerCase()))
    : NEIGHBORHOODS

  function toggleRole(value: string) {
    setRoles(prev => prev.includes(value) ? prev.filter(r => r !== value) : [...prev, value])
  }

  async function handleSave() {
    if (!goal) return
    setSaving(true)
    setError('')
    const { error } = await supabase.auth.updateUser({
      data: { goal, roles, neighborhood: neighborhood || null },
    })
    setSaving(false)
    if (error) {
      setError('Could not save your profile. Please try again.')
    } else {
      setSaved(true)
      setTimeout(() => setSaved(false), 2500)
    }
  }

  return (
    <div className="min-h-screen py-12 pb-40 px-6" style={{ background: '#0f2a2a' }}>
      <div className="max-w-3xl mx-auto">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-3xl font-bold text-white mb-1">Your Profile</h1>
          <p className="text-teal-300 mb-10">Update your goal and preferences any time.</p>

          {/* Goal tier */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-teal-400 mb-4">Your Goal</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {GOALS.map((g, i) => {
                const isSelected = goal === g.units
                return (
                  <motion.button
                    key={g.units}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.07 }}
                    onClick={() => setGoal(g.units)}
                    className={`text-left rounded-2xl p-5 border-2 transition-all duration-200 focus:outline-none ${
                      isSelected
                        ? `${g.border} bg-white/10 ring-2 ${g.ring} ring-offset-2 ring-offset-transparent`
                        : 'border-white/10 bg-white/5 hover:bg-white/10 hover:border-white/20'
                    }`}
                  >
                    <span className="text-xs font-bold tracking-widest text-teal-400/70">{g.tag}</span>
                    <p className="text-2xl font-bold text-white mt-1">{g.headline}</p>
                    <p className="text-sm text-teal-300 mb-3">{g.pct}% of parking spaces</p>
                    <div className="w-full h-1.5 bg-white/10 rounded-full overflow-hidden mb-3">
                      <motion.div
                        className={`h-full ${g.barColor} rounded-full`}
                        initial={{ width: 0 }}
                        animate={{ width: `${g.pct}%` }}
                        transition={{ delay: 0.2 + i * 0.07, duration: 0.6, ease: 'easeOut' }}
                      />
                    </div>
                    <p className="text-sm font-semibold text-white">{g.label}</p>
                    {isSelected && (
                      <div className="mt-2 flex items-center gap-1.5 text-teal-400 text-xs font-medium">
                        <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                        Selected
                      </div>
                    )}
                  </motion.button>
                )
              })}
            </div>
          </section>

          {/* Role */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-teal-400 mb-1">Your Connection to Oakland</h2>
            <p className="text-teal-300/60 text-sm mb-4">Select all that apply.</p>
            <div className="flex flex-wrap gap-3">
              {ROLES.map(r => {
                const isSelected = roles.includes(r.value)
                return (
                  <button
                    key={r.value}
                    onClick={() => toggleRole(r.value)}
                    className={`flex items-center gap-2 px-4 py-2.5 rounded-full border-2 text-sm font-medium transition-all duration-200 focus:outline-none ${
                      isSelected
                        ? 'border-teal-400 bg-teal-400/20 text-teal-300 ring-2 ring-teal-400/30'
                        : 'border-white/10 bg-white/5 text-teal-200/70 hover:border-white/20 hover:bg-white/10'
                    }`}
                  >
                    <r.Icon className="w-4 h-4" strokeWidth={1.5} />
                    {r.label}
                  </button>
                )
              })}
            </div>
          </section>

          {/* Neighborhood */}
          <section className="mb-10">
            <h2 className="text-xs font-semibold tracking-[0.2em] uppercase text-teal-400 mb-1">Your Neighborhood</h2>
            <p className="text-teal-300/60 text-sm mb-4">Which part of Oakland do you care about most?</p>

            {/* Always-visible selected badge */}
            {neighborhood && neighborhood !== 'not-oakland' && (
              <div className="flex items-center gap-2 mb-3">
                <span className="text-teal-400/70 text-xs font-medium uppercase tracking-wider">Selected:</span>
                <span className="px-3 py-1 rounded-full text-xs font-medium border border-teal-400 bg-teal-400/20 text-teal-300">
                  {neighborhood}
                </span>
                <button
                  onClick={() => { setNeighborhood(''); setNeighborhoodSearch('') }}
                  className="text-teal-400/40 hover:text-teal-400 text-xs transition-colors"
                >
                  ✕ Clear
                </button>
              </div>
            )}

            <input
              type="text"
              placeholder="Search neighborhoods…"
              value={neighborhoodSearch}
              onChange={e => setNeighborhoodSearch(e.target.value)}
              className="w-full max-w-sm bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-white placeholder-white/30 focus:outline-none focus:border-teal-400 focus:bg-white/10 transition-all mb-3 text-sm"
            />

            <div className="flex flex-wrap gap-2">
              {neighborhoodSearch.length > 0 &&
                !NEIGHBORHOODS.some(n => n.toLowerCase() === neighborhoodSearch.toLowerCase()) && (
                <button
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

            <button
              onClick={() => { setNeighborhood('not-oakland'); setNeighborhoodSearch('') }}
              className={`mt-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-all duration-150 focus:outline-none ${
                neighborhood === 'not-oakland'
                  ? 'border-teal-400 bg-teal-400/20 text-teal-300'
                  : 'border-white/10 bg-white/5 text-teal-200/60 hover:border-white/20 hover:text-teal-200'
              }`}
            >
              I don't live in Oakland
            </button>
          </section>

          {error && (
            <p className="text-red-400 text-sm bg-red-400/10 rounded-lg px-4 py-2 mb-4">{error}</p>
          )}

          <button
            onClick={handleSave}
            disabled={!goal || saving}
            className="bg-teal-500 hover:bg-teal-400 disabled:opacity-40 disabled:cursor-not-allowed text-white font-bold px-8 py-3.5 rounded-full text-base transition-all duration-200 shadow-lg"
          >
            {saving ? 'Saving…' : saved ? '✓ Saved' : 'Save Profile'}
          </button>
          <div className="h-16" />
        </motion.div>
      </div>
    </div>
  )
}
