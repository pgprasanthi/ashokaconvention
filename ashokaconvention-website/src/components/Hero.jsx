import { useState, useEffect } from 'react'
import slide1  from '../assets/slide-exterior.jpeg'
import slide2  from '../assets/slide-banquet-hall.jpeg'
import slide3  from '../assets/slide-wedding-stage.jpeg'
import slide4  from '../assets/slide-reception-stage.jpeg'
import slide5  from '../assets/slide-lit-entrance.jpeg'
import slide6  from '../assets/slide-floral-pathway.jpeg'
import slide7  from '../assets/slide-traditional-decor.jpeg'
import slide8  from '../assets/slide-hall-entrance.jpeg'
import slide9  from '../assets/slide-floral-stage.jpeg'
import slide10 from '../assets/slide-golden-entrance.jpeg'

const slides = [
  slide1, slide2, slide3, slide4, slide5,
  slide6, slide7, slide8, slide9, slide10
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
          alt="Ashoka Convention"
          className={`hero-bg-img${idx === current ? ' active' : ''}`}
        />
      ))}
      <div className="hero-overlay" />
      <div className="hero-inner">
        <button className="cta" onClick={() => onPageChange('contact')}>Get in Touch</button>
      </div>
    </section>
  )
}
