import { useState, useEffect } from 'react'

const resources = [
  {
    title: 'Color Palette',
    desc: 'Primary, secondary, accent, and neutral colors with hex codes and usage guidance',
    file: '/docs/Sheepdog_01_Color_Palette.html',
    category: 'Brand',
  },
  {
    title: 'Typography System',
    desc: 'Heading and body fonts, type scale, sizes, weights, and spacing',
    file: '/docs/Sheepdog_02_Typography_System.html',
    category: 'Brand',
  },
  {
    title: 'Visual Standards Guide',
    desc: 'Logo usage, color application, imagery style, and file format rules',
    file: '/docs/Sheepdog_03_Visual_Standards_Guide.html',
    category: 'Brand',
  },
  {
    title: 'Events Brand Identity',
    desc: 'Positioning, voice, messaging pillars, and visual expression for Sheepdog Events',
    file: '/docs/Sheepdog_04_Events_Brand_Identity.html',
    category: 'Brand',
  },
  {
    title: 'Staffing Brand Identity',
    desc: 'Positioning, voice, messaging pillars, and visual expression for Sheepdog Staffing',
    file: '/docs/Sheepdog_05_Staffing_Brand_Identity.html',
    category: 'Brand',
  },
  {
    title: 'GBP Description & Keywords',
    desc: 'Google Business Profile description, category recommendations, and target keyword list',
    file: '/docs/deliverable-08-gbp-description-keywords.html',
    category: 'Google Business',
  },
  {
    title: 'GBP Photo Structure',
    desc: 'Photo categories, shot list, naming conventions, and upload cadence',
    file: '/docs/deliverable-09-gbp-photo-standards.html',
    category: 'Google Business',
  },
  {
    title: 'Instagram Cold Outreach Strategy',
    desc: 'DM scripts, target lists, follow-up sequences for Events and Staffing',
    file: '/docs/instagram-cold-outreach-strategy.html',
    category: 'Outreach',
  },
  {
    title: 'Events Outreach Targets',
    desc: 'Target accounts, hashtags, and venues for event security and bartending leads',
    file: '/docs/events-outreach-targets.html',
    category: 'Outreach',
  },
  {
    title: 'Staffing Outreach Targets',
    desc: 'Target companies, industries, and contacts for staffing leads',
    file: '/docs/staffing-outreach-targets.html',
    category: 'Outreach',
  },
  {
    title: 'Business Card (3.5 x 2)',
    desc: 'Front and back business card with review QR code. Standard wallet size.',
    file: '/docs/sheepdog-review-card.html',
    category: 'Reviews',
  },
  {
    title: 'Review Flyer (4 x 6)',
    desc: 'Larger print-ready review card for handouts and table displays.',
    file: '/docs/sheepdog-review-flyer.html',
    category: 'Reviews',
  },
  {
    title: 'Review Staff Script',
    desc: 'Word-for-word scripts for asking clients for Google reviews',
    file: '/docs/review-staff-script.html',
    category: 'Reviews',
  },
  {
    title: 'Review Response Templates',
    desc: 'Pre-built replies for positive, neutral, and negative Google reviews',
    file: '/docs/review-response-templates.html',
    category: 'Reviews',
  },
  {
    title: 'Review Momentum Strategy',
    desc: 'System for building and maintaining a steady flow of Google reviews',
    file: '/docs/review-momentum-strategy.html',
    category: 'Reviews',
  },
]

const categories = [...new Set(resources.map(r => r.category))]

export default function Resources() {
  const [open, setOpen] = useState(categories.reduce((acc, cat) => ({ ...acc, [cat]: true }), {}))
  const [deadLinks, setDeadLinks] = useState(new Set())

  useEffect(() => {
    const controller = new AbortController()
    resources.filter(r => r.file).forEach(r => {
      fetch(r.file, { method: 'HEAD', signal: controller.signal }).then(res => {
        if (!res.ok) setDeadLinks(prev => new Set([...prev, r.file]))
      }).catch(e => { if (e.name !== 'AbortError') setDeadLinks(prev => new Set([...prev, r.file])) })
    })
    return () => controller.abort()
  }, [])

  const toggle = (cat) => setOpen(prev => ({ ...prev, [cat]: !prev[cat] }))

  return (
    <div className="resources">
      <div className="resources-header">
        <h1>Resources</h1>
        <p>Strategy docs, outreach templates, and brand guides</p>
      </div>
      {categories.map((cat) => (
        <div key={cat} className="resource-section">
          <button
            className={`resource-section-header ${open[cat] ? 'open' : ''}`}
            onClick={() => toggle(cat)}
          >
            <span className="resource-section-title">{cat}</span>
            <span className="resource-section-count">{resources.filter(r => r.category === cat).length}</span>
            <svg className="resource-section-chevron" xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div className={`resource-section-body ${open[cat] ? 'open' : ''}`}>
            <div className="resources-grid">
              {resources.filter(r => r.category === cat).map((res) => (
                res.coming ? (
                  <div key={res.title} className="resource-card resource-card--locked">
                    <h3>{res.title}</h3>
                    <p>{res.desc}</p>
                    <span className="resource-card-badge">Coming Soon</span>
                  </div>
                ) : (
                  deadLinks.has(res.file) ? (
                    <div key={res.title} className="resource-card resource-card--locked">
                      <h3>{res.title}</h3>
                      <p>{res.desc}</p>
                      <span className="resource-card-badge" style={{ background: '#C23B2222', color: '#C23B22' }}>Missing File</span>
                    </div>
                  ) : (
                  <a
                    key={res.title}
                    href={res.file}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="resource-card"
                  >
                    <h3>{res.title}</h3>
                    <p>{res.desc}</p>
                  </a>
                  )
                )
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
