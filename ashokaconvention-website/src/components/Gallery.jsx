import { useState } from 'react'
import img1 from '../gallery/WhatsApp Image 2026-05-16 at 1.04.23 PM.jpeg'
import img2 from '../gallery/WhatsApp Image 2026-05-18 at 6.44.36 PM.jpeg'
import img3 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.16 PM (1).jpeg'
import img4 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.16 PM.jpeg'
import img5 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.19 PM.jpeg'
import img6 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.20 PM (1).jpeg'
import img7 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.20 PM (2).jpeg'
import img8 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.20 PM.jpeg'
import img9 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.21 PM.jpeg'
import img10 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.22 PM.jpeg'
import img11 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.27 PM (1).jpeg'
import img12 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.27 PM.jpeg'
import img13 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.28 PM.jpeg'
import img14 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.32 PM (1).jpeg'
import img15 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.32 PM.jpeg'
import img16 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.35 PM (1).jpeg'
import img17 from '../gallery/WhatsApp Image 2026-05-25 at 5.53.35 PM.jpeg'

const galleryImages = [
  { id: 1, title: 'Palace View 1', url: img1, category: 'Wedding Ceremonies' },
  { id: 2, title: 'Palace View 2', url: img2, category: 'Wedding Ceremonies' },
  { id: 3, title: 'Palace View 3', url: img3, category: 'Wedding Receptions' },
  { id: 4, title: 'Palace View 4', url: img4, category: 'Wedding Receptions' },
  { id: 5, title: 'Palace View 5', url: img5, category: 'Engagement Parties' },
  { id: 6, title: 'Palace View 6', url: img6, category: 'Engagement Parties' },
  { id: 7, title: 'Palace View 7', url: img7, category: 'Interior Design' },
  { id: 8, title: 'Palace View 8', url: img8, category: 'Interior Design' },
  { id: 9, title: 'Palace View 9', url: img9, category: 'Lawn & Outdoor' },
  { id: 10, title: 'Palace View 10', url: img10, category: 'Lawn & Outdoor' },
  { id: 11, title: 'Palace View 11', url: img11, category: 'Decorations' },
  { id: 12, title: 'Palace View 12', url: img12, category: 'Decorations' },
  { id: 13, title: 'Palace View 13', url: img13, category: 'Main Hall' },
  { id: 14, title: 'Palace View 14', url: img14, category: 'Main Hall' },
  { id: 15, title: 'Palace View 15', url: img15, category: 'Dining' },
  { id: 16, title: 'Palace View 16', url: img16, category: 'Dining' },
  { id: 17, title: 'Palace View 17', url: img17, category: 'Dining' }
]

const categories = ['All', 'Wedding Ceremonies', 'Wedding Receptions', 'Engagement Parties', 'Interior Design', 'Lawn & Outdoor', 'Decorations', 'Main Hall', 'Dining']

export default function Gallery(){
  const [activeCategory, setActiveCategory] = useState('All')
  
  const filteredImages = activeCategory === 'All' 
    ? galleryImages 
    : galleryImages.filter(img => img.category === activeCategory)

  return (
    <section id="gallery" className="gallery-section">
      <div className="gallery-container">
        <h2>Our Event Gallery</h2>
        <p className="gallery-subtitle"></p>
        
        <div className="gallery-filters">
          {categories.map(cat => (
            <button
              key={cat}
              className={`filter-btn ${activeCategory === cat ? 'active' : ''}`}
              onClick={() => setActiveCategory(cat)}
            >
              {cat}
            </button>
          ))}
        </div>
        
        <div className="gallery-grid">
          {filteredImages.map(img => (
            <div key={img.id} className="gallery-item">
              <img src={img.url} alt={img.title} />
              <div className="gallery-overlay">
                <h3>{img.title}</h3>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}
