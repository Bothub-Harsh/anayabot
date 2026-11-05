import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import api from '../services/api';
import { MATCH_STATUS } from '../constants/game';

function HomePage() {
  const { user, navigate } = useApp();
  const [publicMatches, setPublicMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchMatches();
  }, []);

  const fetchMatches = async () => {
    try {
      const data = await api.getMatches();
      setPublicMatches(data.matches || []);
    } catch (err) {
      console.error('Failed to fetch matches:', err);
    } finally {
      setLoading(false);
    }
  };

  const displayName = user?.username 
    ? `@${user.username}` 
    : user?.first_name || 'Player';

  const stats = [
    { label: 'Matches', value: user?.total_matches ?? '—', icon: '🎮' },
    { label: 'Wins', value: user?.wins ?? '—', icon: '🏆' },
    { label: 'Level', value: user?.level ?? 1, icon: '⭐' },
  ];

  return (
    <div className="page" style={{ paddingTop: '1rem', paddingBottom: '5rem' }}>
      {/* Hero section */}
      <div style={{
        textAlign: 'center',
        padding: '1.5rem 0 2rem',
        background: 'linear-gradient(180deg, rgba(233,69,96,0.1) 0%, transparent 100%)',
        borderRadius: '1rem',
        marginBottom: '1.5rem'
      }}>
        <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🎲</div>
        <h1 style={{
          fontSize: '1.8rem',
          fontWeight: '800',
          background: 'linear-gradient(135deg, #e94560, #f5a623)',
          WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
          marginBottom: '0.25rem'
        }}>
          Ludo Arena
        </h1>
        <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
          Welcome back, {displayName}!
        </p>

        {/* Quick stats */}
        <div style={{
          display: 'flex',
          justifyContent: 'center',
          gap: '1.5rem',
          marginTop: '1.25rem'
        }}>
          {stats.map(s => (
            <div key={s.label} style={{ textAlign: 'center' }}>
              <div style={{ fontSize: '1.1rem' }}>{s.icon} <strong>{s.value}</strong></div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>{s.label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', marginBottom: '2rem' }}>
        <button
          className="btn btn-primary"
          onClick={() => navigate('create-match')}
          style={{ width: '100%', padding: '1rem', fontSize: '1rem' }}
        >
          🎮 Create New Match
        </button>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('join-match')}
            style={{ width: '100%' }}
          >
            🔗 Join Match
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => navigate('spectate')}
            style={{ width: '100%' }}
          >
            👁 Spectate
          </button>
        </div>
      </div>

      {/* Live matches */}
      <div>
        <div style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.75rem'
        }}>
          <h2 style={{ fontSize: '1rem', fontWeight: '700' }}>🔴 Live Matches</h2>
          <button
            onClick={fetchMatches}
            style={{
              background: 'none',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '0.5rem',
              color: 'var(--color-muted)',
              padding: '0.25rem 0.75rem',
              fontSize: '0.8rem',
              cursor: 'pointer'
            }}
          >
            Refresh
          </button>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>
            <div className="loading-spinner" style={{ margin: '0 auto' }} />
          </div>
        ) : publicMatches.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
            <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>🎲</div>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.9rem' }}>
              No active matches. Create one and invite friends!
            </p>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
            {publicMatches.map(match => (
              <MatchCard
                key={match.id}
                match={match}
                onJoin={() => navigate('lobby', { matchId: match.id })}
                onSpectate={() => navigate('game', { matchId: match.id, spectating: true })}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function MatchCard({ match, onJoin, onSpectate }) {
  const isWaiting = match.status === MATCH_STATUS.WAITING;
  const isPlaying = match.status === MATCH_STATUS.PLAYING;
  const spotsLeft = match.max_players - match.current_players;

  return (
    <div className="card card-hover" style={{ cursor: 'pointer' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div style={{ flex: 1 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.4rem' }}>
            <span
              className={`badge ${isPlaying ? 'badge-active' : 'badge-waiting'}`}
            >
              {isPlaying ? '🔴 LIVE' : '⏳ Waiting'}
            </span>
            <span style={{ fontWeight: '600', fontSize: '0.95rem' }}>{match.name}</span>
          </div>
          <div style={{ display: 'flex', gap: '1rem', fontSize: '0.8rem', color: 'var(--color-muted)' }}>
            <span>👥 {match.current_players}/{match.max_players} players</span>
            <span>#{match.room_code}</span>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {isWaiting && spotsLeft > 0 && (
            <button
              className="btn btn-primary"
              onClick={onJoin}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
            >
              Join
            </button>
          )}
          {isPlaying && (
            <button
              className="btn btn-secondary"
              onClick={onSpectate}
              style={{ padding: '0.4rem 0.75rem', fontSize: '0.8rem' }}
            >
              👁 Watch
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default HomePage;

