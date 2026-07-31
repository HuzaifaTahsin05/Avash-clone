import React from 'react';
import { Link } from 'react-router-dom';

const navItems = [
  { label: 'Home', to: '/' },
  { label: 'Risk map', to: '/risk-map' },
  { label: 'Report', to: '/report' },
  { label: 'Resources', to: '/resources' },
  { label: 'Symptoms', to: '/symptom-checker' },
  { label: 'Weather', to: '/weather' },
];

export const Header = () => (
  <header style={{ padding: '1rem 1.25rem', borderBottom: '1px solid #e2e8f0', background: 'white' }}>
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap' }}>
      <Link to="/" style={{ color: '#0f172a', textDecoration: 'none', fontWeight: 700, fontSize: '1.1rem' }}>
        আভাস
      </Link>
      <nav style={{ display: 'flex', gap: '0.8rem', flexWrap: 'wrap' }}>
        {navItems.map((item) => (
          <Link key={item.to} to={item.to} style={{ color: '#475569', textDecoration: 'none', fontSize: '0.95rem' }}>
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  </header>
);
