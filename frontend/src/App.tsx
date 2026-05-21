import React, { useEffect, useState } from 'react';
import { BrowserRouter, Link, Route, Routes } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard';
import { NewScan } from './pages/NewScan';
import { ScanDetail } from './pages/ScanDetail';
import './App.css';

type Theme = 'light' | 'dark';

export const App: React.FC = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = window.localStorage.getItem('theme');
    return storedTheme === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  return (
    <BrowserRouter>
      <div className="app" data-theme={theme}>
        <nav className="navbar">
          <div className="nav-brand">
            <h2>Code Analytics</h2>
          </div>
          <div className="nav-actions">
            <div className="nav-links">
              <Link to="/">Dashboard</Link>
              <Link to="/new">New Scan</Link>
            </div>
            <div className="theme-toggle" aria-label="Theme selector">
              <button
                type="button"
                className={theme === 'light' ? 'active' : ''}
                onClick={() => setTheme('light')}
              >
                Light
              </button>
              <button
                type="button"
                className={theme === 'dark' ? 'active' : ''}
                onClick={() => setTheme('dark')}
              >
                Dark
              </button>
            </div>
          </div>
        </nav>

        <main className="main-content">
          <Routes>
            <Route path="/" element={<Dashboard />} />
            <Route path="/new" element={<NewScan />} />
            <Route path="/scans/:id" element={<ScanDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};
