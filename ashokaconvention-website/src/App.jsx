import { useState, useEffect } from 'react'
import { FaWhatsapp } from 'react-icons/fa'
import Header from './components/Header'
import Hero from './components/Hero'
import HeroCards from './components/HeroCards'
import Home from './components/Home'
import Services from './components/Services'
import Gallery from './components/Gallery'
import Contact from './components/Contact'
import Feedback from './components/Feedback'
import Partners from './components/Partners'
import Footer from './components/Footer'

export default function App() {
  const [currentPage, setCurrentPage] = useState('home')
  const [headerScrolled, setHeaderScrolled] = useState(false)

  useEffect(() => {
    const onScroll = () => setHeaderScrolled(window.scrollY > 60)
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const handlePageChange = (page) => {
    setCurrentPage(page)
    setTimeout(() => {
      const el = document.getElementById('page-content')
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }, 50)
  }

  return (
    <div className="app">
      <Header onPageChange={handlePageChange} currentPage={currentPage} scrolled={headerScrolled} />
      <main>
        <Hero />
        <HeroCards />
        <div id="page-content">
          {currentPage === 'home' && <Home />}
          {currentPage === 'services' && <Services />}
          {currentPage === 'gallery' && <Gallery />}
          {currentPage === 'contact' && <Contact />}
          {currentPage === 'feedback' && <Feedback />}
          {currentPage === 'partners' && <Partners />}
        </div>
      </main>
      <Footer />

      {/* Floating WhatsApp button */}
      <a
        href="https://wa.me/919493068777"
        target="_blank"
        rel="noopener noreferrer"
        className="whatsapp-fab"
        aria-label="Chat on WhatsApp"
      >
        <FaWhatsapp />
      </a>
    </div>
  )
}
