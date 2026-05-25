import { PageHeader } from '../components/PageHeader'
import { Footer } from '../components/Footer'
import { FAQSection } from '../components/FAQSection'

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
            California requires Oakland to permit 26,251 new housing units by 2031. So far, roughly
            3,614 have been approved, a gap of more than 22,000 homes. Meanwhile, Oakland has tens
            of thousands of on-street parking spaces sitting mostly idle. Tiny Home Parklets convert
            individual parking spots into full, market-rate residential units: factory-built, 200 sq ft,
            installed in 6–10 weeks for around $100,000 each, on land the city already controls.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">What Is a Tiny Home Parklet?</h2>
          <p className="text-gray-600 leading-relaxed mb-4">
            A vertical parklet is a concept that places tiny homes above existing parking lots,
            preserving parking capacity while adding dignified housing and green rooftop space.
            The design integrates stairway access, landscaping, and compact living units into
            underused urban infrastructure.
          </p>
          <div className="rounded-xl overflow-hidden border border-border shadow-sm">
            <img
              src="/tinyHomeParklet.webp"
              alt="A tiny yellow home with a white picket fence on an Oakland street"
              className="w-full"
              loading="eager"
              fetchPriority="high"
            />
          </div>
          <p className="mt-2 text-xs text-gray-400">
            Concept rendering of a vertical parklet design for Oakland.
          </p>
        </section>

        {/* currently this section is commented out since we are not planning to use AHP or MCDM anymore in data collection */}
        {/* <section>
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
        </section> */}

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Data Sources</h2>
          <p className="text-gray-600 leading-relaxed mb-3">
            The parking inventory is built from six primary datasets from the City of Oakland Open
            Data portal, supplemented by crowdsourced and scraped sources:
          </p>
          <ul className="space-y-2 text-sm text-gray-600 mb-4">
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              Residential Parking Permit Zones — polygon zones for blocks requiring residential permits
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              On-Street Parking Inventory — curb segments with regulations (meters, time limits)
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              Off-Street Parking Facilities — public pay and permit garages and lots
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              Parking Meters — all city-managed IPS parking meters
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              Jack London On-Street Parking — curb availability for the Jack London district
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              International Blvd BRT Parking — curb inventory near the International Blvd corridor
            </li>
          </ul>
          <p className="text-gray-600 leading-relaxed mb-3">Supplemental sources:</p>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              SpotAngels — scraped real-time parking rules to identify overnight-free and holiday parking
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              OpenStreetMap via Overpass Turbo — East Oakland parking lanes and streetside parking nodes
            </li>
            <li className="flex items-start gap-2">
              <span className="text-primary-500 mt-0.5 shrink-0">&ndash;</span>
              SpotHero — supplemental parking inventory
            </li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">The Team</h2>
          <p className="text-gray-600 leading-relaxed">
            This tool was developed by the Kalyan Lab at the University of British Columbia (UBC)
            in 2026, focusing on urban analytics, GIS, and equitable urban planning. Our goal is
            to make complex spatial decision-making accessible to community members and planners alike.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-gray-800 mb-3">Get Involved</h2>
          <p className="text-gray-600 leading-relaxed">
            Vote on the map to show which parking spots you'd support converting to tiny homes.
            Share the tool with neighbors and community members. The more Oaklanders who weigh in,
            the stronger the case for making this a reality.
          </p>
        </section>

        <FAQSection />
      </div>

      <Footer />
    </div>
  )
}
