import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom'
import AHPPage from './pages/AHPPage'
import AboutPage from './pages/AboutPage'
import HomePage from './pages/HomePage'
import LinearWeightingPage from "./pages/LinearWeightingPage";


function App() {
  return (
    <Router>
      <div className="min-h-screen bg-gray-50 font-sans">
        {/* Top Navbar */}
        <nav className="bg-green-800 text-white px-6 py-3 flex gap-6 shadow">
          <Link to="/" className="text-lg font-bold">Home</Link>
          <Link to="/ahp" className="hover:underline">AHP</Link>
          <Link to="/about" className="hover:underline">About</Link>
          <Link to="/linear" className="hover:underline">Linear</Link>

        </nav>

        {/* Routing */}
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/ahp" element={<AHPPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/linear" element={<LinearWeightingPage />} />

        </Routes>
      </div>
    </Router>
  )
}

export default App
