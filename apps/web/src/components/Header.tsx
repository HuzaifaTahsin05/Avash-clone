import { NavLink } from 'react-router-dom';

// Every page currently routed (router.tsx). Add a link here when a new
// page is wired into the router so navigation stays complete without
// having to touch every page component individually.
const NAV_LINKS = [
  { to: '/weather', label: 'Weather' },
  { to: '/risk', label: 'Risk Map' },
];

export const Header = () => (
  <header className="navbar">
    <nav className="navbar__nav" aria-label="Main">
      <NavLink to="/" end className="navbar__brand">
        আভাস <span className="navbar__brand-en">Avash</span>
      </NavLink>
      <ul className="navbar__links">
        {NAV_LINKS.map((link) => (
          <li key={link.to}>
            <NavLink
              to={link.to}
              className={({ isActive }) =>
                isActive ? 'navbar__link navbar__link--active' : 'navbar__link'
              }
            >
              {link.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  </header>
);
