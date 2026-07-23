import { useState, useEffect, useRef } from 'react'
import logoImage from '../assets/logo.jpeg'
import { useAuth } from '../context/AuthContext'
import GoogleSignInButton from './GoogleSignInButton'

export default function Header({ onPageChange, currentPage, scrolled }) {
  const [menuOpen, setMenuOpen] = useState(false)
  const dropdownRef = useRef(null)
  const hamburgerRef = useRef(null)
  const { user, isAdmin, logout } = useAuth()

  const navItems = [
    { id: 'home',     label: 'Home' },
    { id: 'services', label: 'Services' },
    { id: 'gallery',  label: 'Gallery' },
    { id: 'feedback', label: 'Feedback' },
    { id: 'partners', label: 'Partners' },
    { id: 'contact',  label: 'Contact' },
    ...(isAdmin ? [{ id: 'admin', label: 'Admin' }] : [])
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
          <img src={logoImage} alt="Ashoka Convention" />
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

        <div className="nav-auth">
          {user ? (
            <span className="nav-auth-user">
              {user.name || user.email} ({user.role})
              <button className="bc-link" onClick={logout}>Sign out</button>
            </span>
          ) : (
            <GoogleSignInButton />
          )}
        </div>
      </div>
    </>
  )
}
