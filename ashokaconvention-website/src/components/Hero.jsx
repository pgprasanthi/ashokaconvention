import heroImage from '../gallery/palace-exterior.jpeg'

export default function Hero({ onPageChange }) {
  return (
    <section className="hero">
      <img src={heroImage} alt="Ashok Palace" className="hero-bg-img" />
      <div className="hero-overlay"></div>
      <div className="hero-inner">
        <h1>A Dream Destination for Any Celebration</h1>
        <p className="hero-subtitle">Create unforgettable memories with your loved ones</p>
        <button className="cta" onClick={() => onPageChange('contact')}>Get in Touch</button>
      </div>
    </section>
  )
}
