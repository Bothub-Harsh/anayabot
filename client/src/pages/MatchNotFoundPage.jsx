import React from 'react';
import { useApp } from '../context/AppContext';

function MatchNotFoundPage() {
  const { navigate, pageParams } = useApp();
  const matchId = pageParams?.matchId || pageParams?.requestedId || '';

  return (
    <div className="page" style={{
      paddingTop: '3rem',
      paddingBottom: '5rem',
      textAlign: 'center',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '80vh',
      gap: '1rem'
    }}>
      <div style={{ fontSize: '3.5rem', marginBottom: '0.5rem' }}>🎲 🔍</div>
      
      <h1 style={{
        fontSize: '1.6rem',
        fontWeight: '800',
        color: '#f56565',
        marginBottom: '0.25rem'
      }}>
        Match Not Found
      </h1>

      <p style={{
        color: 'var(--color-muted)',
        fontSize: '0.95rem',
        maxWidth: '340px',
        lineHeight: '1.5',
        marginBottom: '1rem'
      }}>
        {matchId
          ? `The requested match (#${matchId}) could not be located. It may have expired or ended.`
          : 'The requested game could not be found or is no longer accepting players.'}
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', width: '100%', maxWidth: '280px' }}>
        <button
          className="btn btn-primary"
          onClick={() => navigate('home')}
          style={{ width: '100%', padding: '0.75rem' }}
        >
          🎮 Browse Active Games
        </button>

        <button
          className="btn btn-secondary"
          onClick={() => navigate('create-match')}
          style={{ width: '100%', padding: '0.75rem' }}
        >
          ➕ Create New Game
        </button>
      </div>
    </div>
  );
}

export default MatchNotFoundPage;
