import React from 'react';
import { AppProvider, useApp } from './context/AppContext';
import HomePage from './pages/HomePage';
import CreateMatchPage from './pages/CreateMatchPage';
import JoinMatchPage from './pages/JoinMatchPage';
import LobbyPage from './pages/LobbyPage';
import GamePage from './pages/GamePage';
import SpectatePage from './pages/SpectatePage';
import ProfilePage from './pages/ProfilePage';
import LeaderboardPage from './pages/LeaderboardPage';
import SettingsPage from './pages/SettingsPage';
import AdminPage from './pages/AdminPage';
import MatchNotFoundPage from './pages/MatchNotFoundPage';

function AppContent() {
  const { user, currentPage, navigate, loading, error } = useApp();

  if (loading) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
        background: 'var(--color-bg)'
      }}>
        <div style={{ fontSize: '3rem' }}>🎲</div>
        <div className="loading-spinner" />
        <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>Loading Ludo Arena...</p>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        gap: '1rem',
        padding: '2rem',
        textAlign: 'center',
        background: 'var(--color-bg)'
      }}>
        <div style={{ fontSize: '3.5rem' }}>⚠️</div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: '700', color: '#fc8181' }}>Connection Error</h2>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem', maxWidth: '360px', lineHeight: '1.5' }}>
          {error || 'Unable to connect to Ludo Arena servers. If the backend is waking up, please wait a few seconds and tap retry.'}
        </p>
        <button 
          className="btn btn-primary" 
          onClick={() => window.location.reload()}
          style={{ padding: '0.6rem 1.5rem', marginTop: '0.5rem' }}
        >
          🔄 Retry Connection
        </button>
      </div>
    );
  }

  // Active view router
  const renderPage = () => {
    switch (currentPage) {
      case 'home':
        return <HomePage />;
      case 'create-match':
        return <CreateMatchPage />;
      case 'join-match':
        return <JoinMatchPage />;
      case 'lobby':
        return <LobbyPage />;
      case 'game':
        return <GamePage />;
      case 'spectate':
        return <SpectatePage />;
      case 'profile':
        return <ProfilePage />;
      case 'leaderboard':
        return <LeaderboardPage />;
      case 'settings':
        return <SettingsPage />;
      case 'admin':
        return <AdminPage />;
      case 'match-not-found':
        return <MatchNotFoundPage />;
      default:
        return <HomePage />;
    }
  };

  // Hide bottom navigation in gameplay or lobby for immersion
  const hideNavigation = currentPage === 'game' || currentPage === 'lobby';

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg)', display: 'flex', flexDirection: 'column' }}>
      <main style={{ flex: 1 }}>
        {renderPage()}
      </main>

      {!hideNavigation && (
        <nav style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '60px',
          background: 'rgba(26, 26, 46, 0.95)',
          backdropFilter: 'blur(10px)',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-around',
          zIndex: 50,
          maxWidth: '480px',
          margin: '0 auto'
        }}>
          {[
            { id: 'home', label: 'Play', icon: '🎲' },
            { id: 'spectate', label: 'Spectate', icon: '👁' },
            { id: 'leaderboard', label: 'Ranks', icon: '🏆' },
            { id: 'profile', label: 'Profile', icon: '👤' },
            { id: 'settings', label: 'Settings', icon: '⚙️' }
          ].map(tab => {
            const isActive = currentPage === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => navigate(tab.id)}
                style={{
                  background: 'none',
                  border: 'none',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '2px',
                  color: isActive ? 'var(--color-accent)' : 'var(--color-muted)',
                  cursor: 'pointer',
                  padding: '0.4rem',
                  fontSize: '0.75rem',
                  fontWeight: isActive ? '700' : '500',
                  transition: 'color 0.2s'
                }}
              >
                <span style={{ fontSize: '1.2rem' }}>{tab.icon}</span>
                <span>{tab.label}</span>
              </button>
            );
          })}
        </nav>
      )}
    </div>
  );
}

function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}

export default App;
