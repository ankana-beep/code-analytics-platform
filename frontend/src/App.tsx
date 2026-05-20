import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { AuthPage } from './pages/AuthPage';
import { Dashboard } from './pages/Dashboard';
import { NewScan } from './pages/NewScan';
import { Repositories } from './pages/Repositories';
import { ScanDetail } from './pages/ScanDetail';
import { api, clearAuthToken, getAuthToken } from './services/api';
import { AuthUser } from './types';
import './App.css';

type Theme = 'light' | 'dark';

export const App: React.FC = () => {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [theme, setTheme] = useState<Theme>(() => {
    const storedTheme = window.localStorage.getItem('theme');
    return storedTheme === 'dark' ? 'dark' : 'light';
  });

  useEffect(() => {
    window.localStorage.setItem('theme', theme);
  }, [theme]);

  useEffect(() => {
    if (!getAuthToken()) {
      setIsCheckingAuth(false);
      return;
    }

    api.getMe()
      .then(setUser)
      .catch(() => {
        clearAuthToken();
        setUser(null);
      })
      .finally(() => setIsCheckingAuth(false));
  }, []);

  const handleLogout = async () => {
    try {
      await api.logout();
    } finally {
      clearAuthToken();
      setUser(null);
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="app" data-theme={theme}>
        <main className="main-content">
          <p>Checking authentication...</p>
        </main>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="app" data-theme={theme}>
        <AuthPage onAuthenticated={setUser} />
      </div>
    );
  }

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
              <Link to="/repositories">Repositories</Link>
              <Link to="/new">New Scan</Link>
            </div>
            <span className="nav-user">{user.full_name || user.email}</span>
            <button type="button" onClick={handleLogout}>
              Logout
            </button>
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
            <Route path="/repositories" element={<Repositories />} />
            <Route path="/new" element={<NewScan />} />
            <Route path="/scans/:id" element={<ScanDetail />} />
          </Routes>
        </main>
      </div>
    </BrowserRouter>
  );
};
