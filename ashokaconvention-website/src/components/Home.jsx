export default function Home(){
  return (
    <div className="home-page">
      <About />
      {/* <Amenities /> */}
      <Testimonials />
      <Partners />
    </div>
  )
}

function About(){
  return (
    <section className="about-section">
      <div className="about-container">
        <h2>WELCOME TO ASHOK PALACE</h2>
        <p style={{fontWeight: 600, marginBottom: 20}}>A perfect destination for weddings, celebrations, and memorable gatherings</p>
        <p>
          Some moments in life deserve more than just a venue — they deserve a place where every celebration feels grand, warm, and unforgettable. At Ashok Palace, we believe every event has its own story, and we are here to make yours truly special.
        </p>
        <p>
          Located in Tirupathi with easy accessibility from both the city and the airport, Ashok Palace is a thoughtfully designed wedding and event destination ideal for intimate gatherings as well as grand celebrations. Whether it is a traditional wedding, reception, engagement, family function, corporate event, or social gathering, our venue offers the perfect setting for every occasion.
        </p>
        <p>
          Featuring elegant event spaces, spacious dining halls, comfortable guest rooms, ample parking, and dedicated hospitality services, every detail is carefully taken care of by our professional team to ensure a smooth and memorable experience for you and your guests.
        </p>
        <p>
          At Ashok Palace, we are delighted to welcome your family and friends and create celebrations filled with joy, tradition, and lasting memories.
        </p>
      </div>
    </section>
  )
}

function Amenities(){
  const amenities = [
    { title: 'Main Hall', desc: 'Grand pillar-free hall with elegant chandeliers', img: '/gallery/WhatsApp Image 2026-05-25 at 5.53.28 PM.jpeg' },
    { title: 'Dining Area', desc: 'Spacious dining halls for buffet and service', img: '/gallery/WhatsApp Image 2026-05-25 at 5.53.27 PM.jpeg' },
    { title: 'Guest Capacity', desc: 'Comfortably accommodates up to 2,000 guests', img: '/gallery/WhatsApp Image 2026-05-25 at 5.53.35 PM.jpeg' },
    { title: 'Decor & Coordination', desc: 'In-house support for decorations', img: '/gallery/WhatsApp Image 2026-05-25 at 5.53.22 PM.jpeg' },
    { title: 'Parking', desc: 'Dedicated parking for 500+ vehicles', img: '/gallery/WhatsApp Image 2026-05-25 at 5.53.21 PM.jpeg' },
    { title: '24/7 Power Backup', desc: 'Uninterrupted power supply', img: '/gallery/WhatsApp Image 2026-05-25 at 5.53.20 PM.jpeg' }
  ]

  return (
    <section className="amenities-section">
      <div className="amenities-container">
        <h2>Our Amenities</h2>
        <div className="amenities-grid">
          {amenities.map((amenity, idx) => (
            <div key={idx} className="amenity-card">
              <img src={amenity.img} alt={amenity.title} className="amenity-img" />
              <h3>{amenity.title}</h3>
              <p>{amenity.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Testimonials(){
  const reviews = [
    {
      text: 'Absolutely loved everything about this venue. The entrance, gardens and interiors were stunning. Perfect for our family celebration!',
      author: 'Rajesh Kumar'
    },
    {
      text: 'We had my daughter\'s wedding at Ashok Palace and it was everything we dreamed of. The grandeur and professional team made it perfect!',
      author: 'Priya & Arun'
    },
    {
      text: 'My wife\'s baby shower was absolutely beautiful. The palace interiors made us feel like royalty. Thank you for making it special!',
      author: 'Vikram Singh'
    }
  ]

  return (
    <section className="testimonials-section">
      <div className="testimonials-container">
        <h2>Precious Remarks from Our Guests</h2>
        <div className="testimonials-grid">
          {reviews.map((review, idx) => (
            <div key={idx} className="testimonial-card">
              <p className="review-text">"{review.text}"</p>
              <p className="review-author">- {review.author}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Partners(){
  const partners = [
    'Photography',
    'Event Decor',
    'Catering',
    'Music & DJ',
    'Makeup Artists',
    'Floral Design'
  ]

  return (
    <section className="partners-section">
      <div className="partners-container">
        <h2>Our Partners</h2>
        <p className="partners-subtitle">We work with the finest vendors to make your event extraordinary</p>
        <div className="partners-grid">
          {partners.map((partner, idx) => (
            <div key={idx} className="partner-badge">{partner}</div>
          ))}
        </div>
      </div>
    </section>
  )
}
