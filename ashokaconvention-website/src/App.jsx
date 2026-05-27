import { useState } from 'react'
import Header from './components/Header'
import Hero from './components/Hero'
import HeroCards from './components/HeroCards'
import Home from './components/Home'
import Services from './components/Services'
import Gallery from './components/Gallery'
import Contact from './components/Contact'
import Footer from './components/Footer'

export default function App() {
  const [currentPage, setCurrentPage] = useState('home')

  return (
    <div className="app" >
      <Header onPageChange={setCurrentPage} currentPage={currentPage} />
      <main  >
        <Hero />
        <HeroCards />
        {currentPage === 'home' && <Home />}
        {currentPage === 'services' && <Services />}
        {currentPage === 'gallery' && <Gallery />}
        {currentPage === 'contact' && <Contact />}
      </main>
      <Footer />
    </div>
  )
}

