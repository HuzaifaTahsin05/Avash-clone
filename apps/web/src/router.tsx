import { createBrowserRouter } from 'react-router-dom';
import React from 'react';
import Layout from './components/Layout';
import RiskMap from './pages/RiskMap';
import Report from './pages/Report';
import Resources from './pages/Resources';
import SymptomChecker from './pages/SymptomChecker';
import Weather from './pages/Weather';

const HomePage = () => (
  <section style={{ display: 'grid', gap: '1.5rem' }}>
    <div style={{ padding: '1.5rem', borderRadius: '1rem', background: 'linear-gradient(135deg, #0f766e, #2563eb)', color: 'white' }}>
      <p style={{ margin: 0, fontSize: '0.95rem', textTransform: 'uppercase', letterSpacing: '0.2em', opacity: 0.9 }}>আভাস · Early warning for dengue</p>
      <h1 style={{ margin: '0.4rem 0 0.6rem', fontSize: '2rem' }}>Stay informed before outbreaks spread.</h1>
      <p style={{ margin: 0, lineHeight: 1.6, maxWidth: '640px' }}>
        Monitor neighborhood risk, review local weather signals, and act quickly with trusted health resources.
      </p>
    </div>

    <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {[
        { title: 'Risk map', description: 'See current dengue risk by area.', to: '/risk-map' },
        { title: 'Report breeding sites', description: 'Share findings with local teams.', to: '/report' },
        { title: 'Symptom checker', description: 'Check warning signs quickly.', to: '/symptom-checker' },
        { title: 'Weather insights', description: 'Track rainfall and temperature.', to: '/weather' },
      ].map((item) => (
        <a
          key={item.title}
          href={item.to}
          style={{ padding: '1rem 1.1rem', borderRadius: '0.9rem', background: '#ffffff', color: '#0f172a', textDecoration: 'none', border: '1px solid #e2e8f0', boxShadow: '0 10px 30px rgba(15, 23, 42, 0.06)' }}
        >
          <strong>{item.title}</strong>
          <p style={{ margin: '0.35rem 0 0', color: '#475569', lineHeight: 1.5 }}>{item.description}</p>
        </a>
      ))}
    </div>
  </section>
);

export const router = createBrowserRouter([
  {
    element: <Layout />,
    children: [
      { path: '/', element: <HomePage /> },
      { path: '/risk-map', element: <RiskMap /> },
      { path: '/report', element: <Report /> },
      { path: '/resources', element: <Resources /> },
      { path: '/symptom-checker', element: <SymptomChecker /> },
      { path: '/weather', element: <Weather /> },
    ],
  },
]);
