import { useState, useEffect, useRef } from 'react'
import logoImage from '../assets/logo.jpeg'

export default function Header({ onPageChange, currentPage, scrolled }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const dropdownRef = useRef(null)
  const hamburgerRef = useRef(null)

  const navItems = [
    { id: 'home',     label: 'Home' },
    { id: 'services', label: 'Services' },
    { id: 'gallery',  label: 'Gallery' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'partners', label: 'Partners' },
    { id: 'contact',  label: 'Contact' }
  ]

  // Close on outside click
  useEffect(() => {
    const handleClick = (e) => {
      if (
        dropdownRef.current && !dropdownRef.current.contains(e.target) &&
        hamburgerRef.current && !hamburgerRef.current.contains(e.target)
      ) {
        setMenuOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const handleNav = (id) => {
    onPageChange(id)
    setMenuOpen(false)
  }

  return (
    <>
      <header className={`site-header${scrolled ? ' scrolled' : ''}`}>
        <div className="logo" onClick={() => handleNav('home')} style={{ cursor: 'pointer' }}>
          <img src={logoImage} alt="Ashoka Convention" width="56" height="56" />
        </div>

        <button
          ref={hamburgerRef}
          className={`hamburger${menuOpen ? ' open' : ''}`}
          onClick={() => setMenuOpen(o => !o)}
          aria-label="Toggle menu"
        >
          <span /><span /><span />
        </button>
      </header>

      {/* Dropdown menu */}
      <div ref={dropdownRef} className={`nav-dropdown${menuOpen ? ' visible' : ''}`}>
        <nav className="nav-breadcrumb">
          {navItems.map((item) => (
            <span key={item.id} className="bc-item">
              <button
                className={`bc-link${currentPage === item.id ? ' active' : ''}`}
                onClick={() => handleNav(item.id)}
              >
                {item.label}
              </button>
            </span>
          ))}
        </nav>
      </div>
    </>
  )
}
