import diningIcon from '../assets/dining.png'
import parkingIcon from '../assets/parking.png'
import accommodationIcon from '../assets/accomodation.png'
import guestCapacityIcon from '../assets/guest capacity.png'
import mainHallIcon from '../assets/mainhall.png'
import spaceIcon from '../assets/space.png'
import outdoorgatheringImage from '../assets/outdoorgathering.jpeg'

const heroCards = [
  {
    title: 'Outdoor Gatherings',
    subtitle: 'Scenic garden venues and stylish open-air spaces for memorable celebrations.',
    image: outdoorgatheringImage
  },
  {
    title: 'Dining Area',
    subtitle: 'Elegant banquet settings and premium dining arrangements for every guest.',
    image: diningIcon
  },
  {
    title: 'Accommodation',
    subtitle: 'Luxurious guest rooms and suites designed for comfort and convenience.',
    image: accommodationIcon
  },
  {
    title: 'Guest Capacity',
    subtitle: 'Spacious facilities designed to accommodate large gatherings and events.',
    image: guestCapacityIcon
  },
  {
    title: 'Total Event Space',
    subtitle: 'Expansive event grounds and grand halls to host any celebration.',
    image: spaceIcon
  },
  {
    title: 'Main Hall',
    subtitle: 'A majestic main hall with premium lighting, decor, and seating.',
    image: mainHallIcon
  },
  {
    title: 'Car Parking',
    subtitle: 'Spacious, secure parking with easy access for guests and vendors.',
    image: parkingIcon
  },
  {
    title: 'Guest Rooms',
    subtitle: 'Comfortable rooms with premium amenities for your guests.',
    image: accommodationIcon
  }
]

export default function HeroCards() {
  return (
    <section className="hero-cards-panel">
      <div className="hero-cards-container">
        {heroCards.map((card, idx) => (
          <div key={idx} className="hero-card">
            <img src={card.image} alt={card.title} />
            <div className="hero-card-copy">
              <h3>{card.title}</h3>
              <p>{card.subtitle}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
