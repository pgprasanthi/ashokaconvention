import { useEffect, useRef } from 'react'
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

// Duplicate cards for seamless infinite loop
const allCards = [...heroCards, ...heroCards]

export default function HeroCards() {
  const containerRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    const node = containerRef.current
    if (!node) return

    const step = 0.6

    const scroll = () => {
      node.scrollLeft += step
      // Reset halfway through the duplicated list for seamless loop
      if (node.scrollLeft >= node.scrollWidth / 2) {
        node.scrollLeft = 0
      }
      rafRef.current = requestAnimationFrame(scroll)
    }

    rafRef.current = requestAnimationFrame(scroll)

    const pause  = () => cancelAnimationFrame(rafRef.current)
    const resume = () => { rafRef.current = requestAnimationFrame(scroll) }

    node.addEventListener('mouseenter', pause)
    node.addEventListener('mouseleave', resume)

    return () => {
      cancelAnimationFrame(rafRef.current)
      node.removeEventListener('mouseenter', pause)
      node.removeEventListener('mouseleave', resume)
    }
  }, [])

  return (
    <section className="hero-cards-panel">
      <div className="hero-cards-container" ref={containerRef}>
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
    </section>
  )
}
