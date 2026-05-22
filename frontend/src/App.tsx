import { BrowserRouter as Router, Routes, Route, NavLink, Link, useLocation, useNavigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './contexts/AuthContext'
import { AuthGuard } from './components/AuthGuard'
import AHPPage from './pages/AHPPage'
import AboutPage from './pages/AboutPage'
import HomePage from './pages/HomePage'
import LinearWeightingPage from './pages/LinearWeightingPage'
import VotePage from './pages/VotePage'
import SuggestPage from './pages/SuggestPage'
import PolygonMapPage from './pages/PolygonMapPage'
import ParkingVotePage from './pages/ParkingVotePage'
import LandingPage from './pages/LandingPage'
import LoginPage from './pages/LoginPage'
import SignupPage from './pages/SignupPage'
import OnboardingGoalPage from './pages/OnboardingGoalPage'

const PRE_AUTH_ROUTES = ['/', '/login', '/signup', '/onboarding/goal']

const navLinks = [
  { to: '/home', label: 'Home' },
  { to: '/parking-vote', label: 'Vote on Parking' },
  // { to: '/vote', label: 'Community Vote' },
  // { to: '/suggest', label: 'Suggest a Location' },
  // { to: '/polygon-map', label: 'Parking Spots' },
  { to: '/about', label: 'About' },
]

function NavBar() {
  const location = useLocation()
  const navigate = useNavigate()
  const { signOut } = useAuth()

  if (PRE_AUTH_ROUTES.includes(location.pathname)) return null

  async function handleSignOut() {
    await signOut()
    navigate('/')
  }

  return (
    <nav className="bg-primary-900 border-b border-primary-800">
      <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
        <Link to="/home" className="text-lg font-semibold text-white tracking-tight">
          Tiny Home Siting Tool
        </Link>
        <div className="flex items-center gap-1">
          {navLinks.map(({ to, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isActive
                    ? 'text-white bg-primary-800'
                    : 'text-primary-100 hover:text-white hover:bg-primary-800'
                }`
              }
            >
              {label}
            </NavLink>
          ))}
          <button
            onClick={handleSignOut}
            className="ml-3 px-3 py-1.5 rounded-md text-sm font-medium text-primary-300 hover:text-white hover:bg-primary-800 transition-colors"
          >
            Log out
          </button>
        </div>
      </div>
    </nav>
  )
}

function AppShell() {
  return (
    <div className="h-screen bg-surface-page flex flex-col overflow-hidden">
      <NavBar />
      <div className="flex-1 min-h-0 flex flex-col overflow-auto">
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/signup" element={<SignupPage />} />
        <Route path="/about" element={<AboutPage />} />

        {/* Onboarding (requires auth) */}
        <Route path="/onboarding/goal" element={<AuthGuard><OnboardingGoalPage /></AuthGuard>} />

        {/* Authenticated app routes */}
        <Route path="/home" element={<AuthGuard><HomePage /></AuthGuard>} />
        <Route path="/vote" element={<AuthGuard><VotePage /></AuthGuard>} />
        <Route path="/suggest" element={<AuthGuard><SuggestPage /></AuthGuard>} />
        <Route path="/parking-vote" element={<AuthGuard><ParkingVotePage /></AuthGuard>} />
        <Route path="/polygon-map" element={<AuthGuard><PolygonMapPage /></AuthGuard>} />
        <Route path="/ahp" element={<AuthGuard><AHPPage /></AuthGuard>} />
        <Route path="/linear" element={<AuthGuard><LinearWeightingPage /></AuthGuard>} />
      </Routes>
      </div>
    </div>
  )
}

function App() {
  return (
    <Router>
      <AuthProvider>
        <AppShell />
      </AuthProvider>
    </Router>
  )
}

export default App
