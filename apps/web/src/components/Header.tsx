import { Link } from 'react-router-dom';

export const Header = () => (
  <header>
    <nav>
      <Link to="/weather">Weather</Link>
      <Link to="/risk">Risk Map</Link>
    </nav>
  </header>
);
