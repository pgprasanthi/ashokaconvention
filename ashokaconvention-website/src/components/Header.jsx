import logoImage from '../assets/logo.jpeg'

export default function Header({ onPageChange, currentPage }){
  const navItems = [
    { id: 'home', label: 'Home' },
    { id: 'services', label: 'Services' },
    { id: 'gallery', label: 'Gallery' },
    { id: 'contact', label: 'Contact' }
  ]

  return (
    <header>
      <div className="logo">
        <img src={logoImage} alt="AshokaConvention" width="100" height="100" />
        <span>AshokA Convention</span>
      </div>
{/* 
       <div className="header-contact">
        <a href="https://wa.me/919493068777" target="_blank" rel="noopener noreferrer" title="WhatsApp">
          💬 9493068777
        </a>
      </div> */}

      <nav className="nav">
        
        {navItems.map(item => (
          <button
            key={item.id}
            className={`nav-link ${currentPage === item.id ? 'active' : ''}`}
            onClick={() => onPageChange(item.id)}
          >
            {item.label}
          </button>
        ))}
      </nav>
  
    </header>
  )
}
