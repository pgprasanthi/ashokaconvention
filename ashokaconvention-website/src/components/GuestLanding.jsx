import { useAuth } from '../context/AuthContext'

export default function GuestLanding({ onNavigate }) {
  const { user } = useAuth()

  const links = [
    { id: 'gallery', label: 'View Gallery' },
    { id: 'services', label: 'Explore Services' },
    { id: 'contact', label: 'Contact Us' }
  ]

  return (
    <section className="about-section">
      <div className="about-container">
        <h5>Welcome</h5>
        <h3 style={{ fontWeight: 600, marginBottom: 20 }}>
          Hi {user?.name || 'there'}, thanks for signing in!
        </h3>
        <p>
          Take a look around — browse our gallery of past celebrations, explore what we offer, or reach out to us directly to start planning your event.
        </p>
        <div className="guest-links">
          {links.map((link) => (
            <button key={link.id} className="guest-link-btn" onClick={() => onNavigate(link.id)}>
              {link.label}
            </button>
          ))}
        </div>
      </div>
    </section>
  )
}
