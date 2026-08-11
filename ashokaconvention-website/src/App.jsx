import { useState, useEffect } from 'react'
import { FaWhatsapp, FaPlay } from 'react-icons/fa'
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
import AdminPanel from './components/AdminPanel'
import StaffPage from './components/StaffPage'
import GuestLanding from './components/GuestLanding'
import BookingsCalendar from './components/BookingsCalendar'
import { useAuth } from './context/AuthContext'

export default function App() {
  const [currentPage, setCurrentPage] = useState('home')
  const [headerScrolled, setHeaderScrolled] = useState(false)
  const [videoOpen, setVideoOpen] = useState(false)
  const { user, role, isAdmin, isStaff } = useAuth()

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

  const NO_HERO_PAGES = ['bookings', 'staff', 'admin']
  const showHero = !NO_HERO_PAGES.includes(currentPage)

  return (
    <div className="app">
      <Header onPageChange={handlePageChange} currentPage={currentPage} scrolled={headerScrolled || !showHero} />
      <main>
        {showHero && (
          <>
            <Hero />
            <HeroCards />
          </>
        )}
        <div id="page-content">
          {currentPage === 'home' && <Home />}
          {currentPage === 'services' && <Services />}
          {currentPage === 'gallery' && <Gallery />}
          {currentPage === 'contact' && <Contact />}
          {currentPage === 'feedback' && <Feedback />}
          {currentPage === 'partners' && <Partners />}
          {currentPage === 'welcome' && role === 'guest' && <GuestLanding onNavigate={handlePageChange} />}
          {currentPage === 'bookings' && user && <BookingsCalendar />}
          {currentPage === 'staff' && isStaff && <StaffPage />}
          {currentPage === 'admin' && isAdmin && <AdminPanel />}
        </div>
      </main>
      <Footer />

      {/* Floating play button */}
      <button
        className="video-fab"
        onClick={() => setVideoOpen(true)}
        aria-label="Watch promo video"
      >
        <FaPlay />
      </button>

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

      {/* Video modal */}
      {videoOpen && (
        <div className="video-modal-overlay" onClick={() => setVideoOpen(false)}>
          <div className="video-modal" onClick={e => e.stopPropagation()}>
            <button className="video-modal-close" onClick={() => setVideoOpen(false)}>✕</button>
            <video
              src="/promo-video.mp4"
              controls
              autoPlay
              className="video-modal-player"
            />
          </div>
        </div>
      )}
    </div>
  )
}
