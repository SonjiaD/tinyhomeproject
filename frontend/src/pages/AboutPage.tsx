import { PageHeader } from '../components/PageHeader'
import { Footer } from '../components/Footer'

export default function AboutPage() {
  return (
    <div className="flex flex-col min-h-screen">
      <PageHeader
        title="About This Project"
        description="A research-backed tool for community-driven tiny home site selection in Oakland, California."
      />

      <div className="max-w-4xl mx-auto px-6 py-12 space-y-12 w-full">
        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">The Problem</h2>
          <p className="text-gray-600 leading-relaxed">
            Oakland faces a significant housing crisis, with thousands of residents experiencing
            homelessness. Tiny home villages have emerged as a practical, dignified interim housing
            solution — but identifying the right sites requires balancing many competing factors:
            proximity to transit, access to services, infrastructure capacity, and alignment with
            urban planning goals.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Our Approach</h2>
          <p className="text-gray-600 leading-relaxed mb-6">
            We use Multi-Criteria Decision Making (MCDM) methods to rank potential sites based on
            publicly available Oakland datasets. This tool offers two complementary approaches:
          </p>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl border border-border p-6">
              <h3 className="font-semibold text-gray-800 mb-2">Analytic Hierarchy Process (AHP)</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                A structured method where you compare criteria in pairs. The system computes
                mathematically consistent weights from your comparisons and checks for logical
                consistency using a consistency ratio.
              </p>
            </div>
            <div className="bg-white rounded-xl border border-border p-6">
              <h3 className="font-semibold text-gray-800 mb-2">Linear Weighting (WSM)</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                A direct approach where you assign importance scores to each criterion using
                sliders. Simpler and more intuitive, giving you full manual control over how
                much each factor matters.
              </p>
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Data Sources</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            All site data is derived from publicly available Oakland and regional datasets, including:
          </p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              Transit access data (AC Transit and BART stop proximity)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              Affordable and assisted housing locations
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              Water infrastructure, fountains, and sewer collection networks
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              Oakland General Plan priority areas
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              Wildfire risk zones and Oakland streams data
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">The Team</h2>
          <p className="text-gray-600 leading-relaxed">
            This tool was developed by the Kalyan Lab at the University of British Columbia (UBC),
            focusing on urban analytics, GIS, and equitable urban planning. Our goal is to make
            complex spatial decision-making accessible to community members and planners alike.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Get Involved</h2>
          <p className="text-gray-600 leading-relaxed">
            We welcome feedback from community members, urban planners, and researchers. Your
            submissions through the AHP and Linear Weighting tools directly contribute to our
            research on participatory site selection methods.
          </p>
        </section>
      </div>

      <Footer />
    </div>
  )
}
