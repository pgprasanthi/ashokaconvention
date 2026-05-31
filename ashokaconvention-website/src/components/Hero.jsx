import { useState, useEffect } from 'react'
import img01 from '../gallery/palace-exterior.jpeg'
import img02 from '../gallery/main-hall-1.jpeg'
import img03 from '../gallery/engagement-party-2.jpeg'
import img04 from '../gallery/wedding-reception-1.jpeg'
import img05 from '../gallery/main-hall-2.jpeg'
import img06 from '../gallery/decorations-1.jpeg'
import img07 from '../gallery/interior-design-1.jpeg'
import img08 from '../gallery/dining-1.jpeg'
import img09 from '../gallery/engagement-party-1.jpeg'
import img10 from '../gallery/interior-design-2.jpeg'
import img11 from '../gallery/dining-2.jpeg'
import img12 from '../gallery/lawn-outdoor-2.jpeg'

const slides = [
  img01, img02, img03, img04, img05, img06,
  img07, img08, img09, img10, img11, img12
]

export default function Hero({ onPageChange }) {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => {
      setCurrent(prev => (prev + 1) % slides.length)
    }, 4000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="hero">
      {slides.map((src, idx) => (
        <img
          key={idx}
          src={src}
          alt="Ashok Palace"
          className={`hero-bg-img${idx === current ? ' active' : ''}`}
        />
      ))}
      <div className="hero-overlay" />
      <div className="hero-inner">
        <h1>A Dream Destination for Any Celebration</h1>
        <p className="hero-subtitle">Create unforgettable memories with your loved ones</p>
        <button className="cta" onClick={() => onPageChange('contact')}>Get in Touch</button>
      </div>
    </section>
  )
}
