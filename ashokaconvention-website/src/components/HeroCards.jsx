import { FaParking, FaUtensils, FaUsers, FaTree } from 'react-icons/fa'
import { MdKingBed, MdCorporateFare } from 'react-icons/md'
import WeddingHallIcon from './WeddingHallIcon'
import RoadIcon from './RoadIcon'

const heroCards = [
  {
    title: 'Outdoor Gatherings',
    subtitle: 'Scenic garden venues and stylish open-air spaces for memorable celebrations.',
    icon: FaTree
  },
  {
    title: 'Dining Area',
    subtitle: 'Elegant banquet settings and premium dining arrangements for every guest.',
    icon: FaUtensils
  },
  {
    title: 'Accessibility',
    subtitle: 'Strategically located with easy access from the city and the airport.',
    icon: RoadIcon
  },
  {
    title: 'Guest Capacity',
    subtitle: 'Spacious facilities designed to accommodate large gatherings and events.',
    icon: FaUsers
  },
  {
    title: 'Total Event Space',
    subtitle: 'Expansive event grounds and grand halls to host any celebration.',
    icon: MdCorporateFare
  },
  {
    title: 'Main Hall',
    subtitle: 'A majestic wedding hall with premium lighting, decor, and seating.',
    icon: WeddingHallIcon
  },
  {
    title: 'Car Parking',
    subtitle: 'Spacious, secure parking with easy access for guests and vendors.',
    icon: FaParking
  },
  {
    title: 'Guest Rooms',
    subtitle: 'Comfortable rooms with premium amenities for your guests.',
    icon: MdKingBed
  }
]

// Duplicate cards for seamless CSS-animation loop
const allCards = [...heroCards, ...heroCards]

export default function HeroCards() {
  return (
    <section className="hero-cards-panel">
      <div className="hero-cards-container">
        <div className="hero-cards-track">
          {allCards.map((card, idx) => {
            const Icon = card.icon
            return (
              <div key={idx} className="hero-card">
                <div className="hero-card-icon-wrap">
                  <Icon className="hero-card-icon" />
                </div>
                <div className="hero-card-copy">
                  <h3>{card.title}</h3>
                  <p>{card.subtitle}</p>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}
