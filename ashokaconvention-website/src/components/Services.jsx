import { useState } from 'react'

const servicesData = [
  {
    title: 'Services',
    subcategories: [
      {
        name: 'Social Gatherings',
        items: ['Engagement\'s', 'Wedding\'s', 'Birthday Party\'s', 'Wedding Anniversary\'s', 'DJ Event\'s', 'Audio Launch', 'Live Concert\'s']
      },
      {
        name: 'Corporate Events',
        items: ['Conferences', 'Corporate Seminars', 'Annual Day\'s', 'Exhibitions', 'Launch Event\'s']
      }
    ]
  }
]

export default function Services(){
  const [activeCategory, setActiveCategory] = useState(null)

  return (
    <section id="services" className="services-section">
      <div className="services-container">
        <h2>Our Services</h2>
        <p className="services-subtitle">Professional event management for all occasions</p>
        
        <div className="services-grid">
          {servicesData[0].subcategories.map((category, idx) => (
            <div key={idx} className="service-card">
              <h3>{category.name}</h3>
              <ul className="service-list">
                {category.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
