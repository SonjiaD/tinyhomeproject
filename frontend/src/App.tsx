import { BrowserRouter as Router, Routes, Route, NavLink, Link } from 'react-router-dom'
import AHPPage from './pages/AHPPage'
import AboutPage from './pages/AboutPage'
import HomePage from './pages/HomePage'
import LinearWeightingPage from './pages/LinearWeightingPage'
import VotePage from './pages/VotePage'
import SuggestPage from './pages/SuggestPage'
import PolygonMapPage from './pages/PolygonMapPage'

const navLinks = [
  { to: '/vote', label: 'Community Vote' },
  { to: '/suggest', label: 'Suggest a Location' },
  // { to: '/ahp', label: 'AHP Tool' }, // commented out these pages since they are of no use at the moment
  // { to: '/linear', label: 'Linear Weighting' },
  { to: '/polygon-map', label: 'Parking Spots' },
  { to: '/about', label: 'About' },
]

function App() {
  return (
    <Router>
      <div className="min-h-screen bg-surface-page flex flex-col">
        <nav className="bg-primary-900 border-b border-primary-800">
          <div className="max-w-6xl mx-auto px-6 py-3 flex items-center justify-between">
            <Link to="/" className="text-lg font-semibold text-white tracking-tight">
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
            </div>
          </div>
        </nav>

        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/vote" element={<VotePage />} />
          <Route path="/suggest" element={<SuggestPage />} />
          <Route path="/ahp" element={<AHPPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/linear" element={<LinearWeightingPage />} />
          <Route path="/polygon-map" element={<PolygonMapPage />} />
        </Routes>
      </div>
    </Router>
  )
}

export default App
