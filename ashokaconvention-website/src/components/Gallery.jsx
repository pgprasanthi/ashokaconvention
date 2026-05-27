import { useState } from 'react'
import palaceExterior    from '../gallery/palace-exterior.jpeg'
import weddingReception1 from '../gallery/wedding-reception-1.jpeg'
import engagementParty1  from '../gallery/engagement-party-1.jpeg'
import engagementParty2  from '../gallery/engagement-party-2.jpeg'
import interiorDesign1   from '../gallery/interior-design-1.jpeg'
import interiorDesign2   from '../gallery/interior-design-2.jpeg'
import lawnOutdoor2      from '../gallery/lawn-outdoor-2.jpeg'
import decorations1      from '../gallery/decorations-1.jpeg'
import mainHall1         from '../gallery/main-hall-1.jpeg'
import mainHall2         from '../gallery/main-hall-2.jpeg'
import dining1           from '../gallery/dining-1.jpeg'
import dining2           from '../gallery/dining-2.jpeg'

const galleryImages = [
  // Reception — stage decorations
  // Reception — stage decorations
  { id: 1,  title: 'Floral Arch Stage',      url: engagementParty2,  category: 'Reception' },
  { id: 2,  title: 'Green Floral Stage',     url: mainHall2,         category: 'Reception' },
  { id: 3,  title: 'Wedding Mandap',         url: weddingReception1, category: 'Reception' },
  // Interior Decoration
  { id: 4,  title: 'Banquet Hall',           url: mainHall1,         category: 'Interior Decoration' },
  { id: 5,  title: 'Hall Aisle',             url: dining1,           category: 'Interior Decoration' },
  { id: 6,  title: 'Welcome Decor',          url: lawnOutdoor2,      category: 'Interior Decoration' },
  // Lawn and Outdoor
  { id: 7,  title: 'Stage Decoration',       url: decorations1,      category: 'Lawn and Outdoor' },
  { id: 8,  title: 'Entrance Gate',          url: dining2,           category: 'Lawn and Outdoor' },
  { id: 9,  title: 'Outdoor Stage',          url: engagementParty1,  category: 'Lawn and Outdoor' },
  { id: 10, title: 'Outdoor Walkway',        url: interiorDesign1,   category: 'Lawn and Outdoor' },
  { id: 11, title: 'Illuminated Entrance',   url: interiorDesign2,   category: 'Lawn and Outdoor' },
  { id: 12, title: 'Palace Exterior',        url: palaceExterior,    category: 'Lawn and Outdoor' },
]

const categories = ['All', 'Reception', 'Interior Decoration', 'Lawn and Outdoor']

export default function Gallery() {
  const [activeCategory, setActiveCategory] = useState('All')

  const filteredImages = activeCategory === 'All'
    ? galleryImages
    : galleryImages.filter(img => img.category === activeCategory)

  return (
    <section id="gallery" className="gallery-section">
      <div className="gallery-container">
        <h2>Our Event Gallery</h2>

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
