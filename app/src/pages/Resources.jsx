import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { COLORS } from '../lib/format'

const CONTRACT_CATEGORIES = ['Client Contracts — Events', 'Client Contracts — Staffing', 'Staff & Contractor', 'Reporting & Operations']

const resources = [
  // ─── BRAND ───
  { title: 'Color Palette', desc: 'Primary, secondary, accent, and neutral colors with hex codes and usage guidance', file: '/docs/Sheepdog_01_Color_Palette.html', category: 'Brand' },
  { title: 'Typography System', desc: 'Heading and body fonts, type scale, sizes, weights, and spacing', file: '/docs/Sheepdog_02_Typography_System.html', category: 'Brand' },
  { title: 'Visual Standards Guide', desc: 'Logo usage, color application, imagery style, and file format rules', file: '/docs/Sheepdog_03_Visual_Standards_Guide.html', category: 'Brand' },
  { title: 'Events Brand Identity', desc: 'Positioning, voice, messaging pillars, and visual expression for Sheepdog Events', file: '/docs/Sheepdog_04_Events_Brand_Identity.html', category: 'Brand' },
  { title: 'Staffing Brand Identity', desc: 'Positioning, voice, messaging pillars, and visual expression for Sheepdog Staffing', file: '/docs/Sheepdog_05_Staffing_Brand_Identity.html', category: 'Brand' },
  // ─── GOOGLE BUSINESS ───
  { title: 'GBP Description & Keywords', desc: 'Google Business Profile description, category recommendations, and target keyword list', file: '/docs/deliverable-08-gbp-description-keywords.html', category: 'Google Business' },
  { title: 'GBP Photo Structure', desc: 'Photo categories, shot list, naming conventions, and upload cadence', file: '/docs/deliverable-09-gbp-photo-standards.html', category: 'Google Business' },
  // ─── OUTREACH ───
  { title: 'Instagram Cold Outreach Strategy', desc: 'DM scripts, target lists, follow-up sequences for Events and Staffing', file: '/docs/instagram-cold-outreach-strategy.html', category: 'Outreach' },
  { title: 'Events Outreach Targets', desc: 'Target accounts, hashtags, and venues for event security and bartending leads', file: '/docs/events-outreach-targets.html', category: 'Outreach' },
  { title: 'Staffing Outreach Targets', desc: 'Target companies, industries, and contacts for staffing leads', file: '/docs/staffing-outreach-targets.html', category: 'Outreach' },
  // ─── REVIEWS ───
  { title: 'Business Card (3.5 x 2)', desc: 'Front and back business card with review QR code. Standard wallet size.', file: '/docs/sheepdog-review-card.html', category: 'Reviews' },
  { title: 'Review Flyer (4 x 6)', desc: 'Larger print-ready review card for handouts and table displays.', file: '/docs/sheepdog-review-flyer.html', category: 'Reviews' },
  { title: 'Review Staff Script', desc: 'Word-for-word scripts for asking clients for Google reviews', file: '/docs/review-staff-script.html', category: 'Reviews' },
  { title: 'Review Response Templates', desc: 'Pre-built replies for positive, neutral, and negative Google reviews', file: '/docs/review-response-templates.html', category: 'Reviews' },
  { title: 'Review Momentum Strategy', desc: 'System for building and maintaining a steady flow of Google reviews', file: '/docs/review-momentum-strategy.html', category: 'Reviews' },
  // ─── CLIENT CONTRACTS (EVENTS) ───
  { title: 'Event Security Agreement', desc: 'Single-event security contract with liability, cancellation, and payment terms', file: '/docs/01-event-security-agreement.html', category: 'Client Contracts — Events' },
  { title: 'Mobile Bartending Agreement', desc: 'Bartending contract with TABC compliance, alcohol liability, and tip policy', file: '/docs/02-mobile-bartending-agreement.html', category: 'Client Contracts — Events' },
  { title: 'Combined Security & Bartending', desc: 'Merged contract for clients booking both security and bartending', file: '/docs/03-combined-security-bartending-agreement.html', category: 'Client Contracts — Events' },
  { title: 'Recurring Event Contract', desc: 'Rolling contract for venues with ongoing weekly shifts and rate lock', file: '/docs/04-recurring-event-contract.html', category: 'Client Contracts — Events' },
  // ─── CLIENT CONTRACTS (STAFFING) ───
  { title: 'Staffing Services Agreement', desc: 'Master service agreement for B2B staffing with billing and non-solicitation terms', file: '/docs/05-staffing-services-agreement.html', category: 'Client Contracts — Staffing' },
  { title: 'Project-Based Staffing SOW', desc: 'Statement of work for specific projects with duration, headcount, and deliverables', file: '/docs/06-project-based-staffing-sow.html', category: 'Client Contracts — Staffing' },
  { title: 'Ongoing Placement Agreement', desc: 'Long-term recurring placement contract with schedule, rate, and auto-renewal', file: '/docs/07-ongoing-placement-agreement.html', category: 'Client Contracts — Staffing' },
  // ─── STAFF & CONTRACTOR ───
  { title: 'Independent Contractor Agreement', desc: '1099 contractor agreement with pay rate, code of conduct, non-compete, and termination', file: '/docs/08-independent-contractor-agreement.html', category: 'Staff & Contractor' },
  { title: 'W-9 Request Form', desc: 'Template for requesting W-9 tax forms from contractors', file: '/docs/09-w9-request-form.html', category: 'Staff & Contractor' },
  { title: 'TABC Compliance Acknowledgment', desc: 'Staff certification of valid TABC cert and alcohol service law compliance', file: '/docs/10-tabc-compliance-acknowledgment.html', category: 'Staff & Contractor' },
  { title: 'Background Check Authorization', desc: 'Consent form for running background checks on staff', file: '/docs/11-background-check-authorization.html', category: 'Staff & Contractor' },
  { title: 'NDA / Confidentiality Agreement', desc: 'Protects client info, venue details, and Sheepdog business data', file: '/docs/12-nda-confidentiality-agreement.html', category: 'Staff & Contractor' },
  // ─── REPORTING & OPERATIONS ───
  { title: 'Incident Report Form', desc: 'Document security incidents, injuries, or notable events during a shift', file: '/docs/13-incident-report-form.html', category: 'Reporting & Operations' },
  { title: 'Post-Event Report', desc: 'Team lead report after each job: attendance, issues, client feedback, follow-ups', file: '/docs/14-post-event-report.html', category: 'Reporting & Operations' },
  { title: 'Table & Chair Rental Agreement', desc: 'Rental contract for tables and chairs with quantities, delivery, and damage terms', file: '/docs/15-table-chair-rental-agreement.html', category: 'Reporting & Operations' },
  { title: 'Equipment Inventory Checklist', desc: 'Track equipment issued and returned per event', file: '/docs/16-equipment-inventory-checklist.html', category: 'Reporting & Operations' },
  { title: 'Event Setup/Takedown Agreement', desc: 'Contract for setup, takedown, and cleanup services with scope and timing', file: '/docs/17-event-setup-takedown-cleanup-agreement.html', category: 'Reporting & Operations' },
  { title: 'Setup/Takedown Walkthrough', desc: 'Pre and post-event walkthrough checklist for venue condition documentation', file: '/docs/18-setup-takedown-walkthrough-checklist.html', category: 'Reporting & Operations' },
]

const categories = [...new Set(resources.map(r => r.category))]

export default function Resources() {
  const navigate = useNavigate()
  const [open, setOpen] = useState(categories.reduce((acc, cat) => ({ ...acc, [cat]: true }), {}))
  const [deadLinks, setDeadLinks] = useState(new Set())

  useEffect(() => {
    const controller = new AbortController()
    resources.filter(r => r.file).forEach(r => {
      fetch(r.file, { method: 'HEAD', signal: controller.signal })
        .then(res => { if (!res.ok) return fetch(r.file, { signal: controller.signal }) })
        .then(res => { if (res && !res.ok) setDeadLinks(prev => new Set([...prev, r.file])) })
        .catch(e => { if (e.name !== 'AbortError') setDeadLinks(prev => new Set([...prev, r.file])) })
    })
    return () => controller.abort()
  }, [])

  const toggle = (cat) => setOpen(prev => ({ ...prev, [cat]: !prev[cat] }))
  const isContract = (cat) => CONTRACT_CATEGORIES.includes(cat)

  return (
    <div className="resources">
      <div className="resources-header">
        <h1>Resources</h1>
        <p>Strategy docs, contracts, templates, and brand guides</p>
      </div>
      {categories.map((cat) => (
        <div key={cat} className="resource-section">
          <button
            className={`resource-section-header ${open[cat] ? 'open' : ''}`}
            onClick={() => toggle(cat)}
            aria-expanded={open[cat]}
            aria-controls={`section-${cat.replace(/\s+/g, '-')}`}
          >
            <span className="resource-section-title">{cat}</span>
            <span className="resource-section-count">{resources.filter(r => r.category === cat).length}</span>
            <svg className="resource-section-chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div className={`resource-section-body ${open[cat] ? 'open' : ''}`}>
            <div className="resources-grid">
              {resources.filter(r => r.category === cat).map((res) => (
                deadLinks.has(res.file) ? (
                  <div key={res.title} className="resource-card resource-card--locked">
                    <h3>{res.title}</h3>
                    <p>{res.desc}</p>
                    <span className="resource-card-badge" style={{ background: '#C23B2222', color: '#C23B22' }}>Missing File</span>
                  </div>
                ) : (
                  <div key={res.title} className="resource-card" style={{ cursor: 'default' }}>
                    <h3>{res.title}</h3>
                    <p>{res.desc}</p>
                    <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                      <a href={res.file} target="_blank" rel="noopener noreferrer"
                        style={{ fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600, color: COLORS.blue, textDecoration: 'none' }}
                        onClick={e => e.stopPropagation()}>View</a>
                      {isContract(cat) && (
                        <button onClick={() => navigate(`/contracts?template=${encodeURIComponent(res.file)}`)}
                          style={{ background: 'none', border: 'none', fontSize: 12, fontFamily: 'var(--fh)', fontWeight: 600, color: COLORS.amber, cursor: 'pointer' }}>Fill & Send</button>
                      )}
                    </div>
                  </div>
                )
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
