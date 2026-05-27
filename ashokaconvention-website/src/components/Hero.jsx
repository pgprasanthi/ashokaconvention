import heroImage from '../gallery/WhatsApp Image 2026-05-16 at 1.04.23 PM.jpeg'

export default function Hero({ onPageChange }) {
  return (
    <section className="hero" style={{ backgroundImage: `url(${heroImage})` }}>
      <div className="hero-overlay"></div>
      <div className="hero-inner">
        <h1>A Dream Destination for Any Celebrations</h1>
        <p>Create unforgettable memories at Ashok Palace</p>
        <button className="cta" onClick={() => onPageChange('contact')}>Get in touch</button>
      </div>
    </section>
  )
}
