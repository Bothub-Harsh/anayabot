import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import api from '../services/api';
import { MATCH_STATUS } from '../constants/game';

function SpectatePage() {
  const { navigate } = useApp();
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLiveMatches();
  }, []);

  const fetchLiveMatches = async () => {
    setLoading(true);
    try {
      const data = await api.getMatches();
      // Only matches that are currently playing or waiting
      setMatches(data.matches || []);
    } catch (err) {
      console.error('Failed to load live matches:', err);
    } finally {
      setLoading(false);
    }
  };

  const ongoingMatches = matches.filter(m => m.status === MATCH_STATUS.PLAYING);
  const waitingMatches = matches.filter(m => m.status === MATCH_STATUS.WAITING);

  return (
    <div className="page" style={{ paddingTop: '1rem', paddingBottom: '5rem' }}>
      <div className="page-header">
        <button
          onClick={() => navigate('home')}
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          ←
        </button>
        <div>
          <h1 style={{ fontSize: '1.2rem', fontWeight: '700' }}>👁 Spectator Lounge</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Watch live arena battles in real-time</p>
        </div>
      </div>

      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        <button
          onClick={fetchLiveMatches}
          style={{
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '0.5rem',
            padding: '0.35rem 0.75rem',
            color: 'var(--color-text)',
            fontSize: '0.8rem',
            cursor: 'pointer'
          }}
        >
          🔄 Refresh
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="loading-spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Active Live Matches */}
          <div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
              <span style={{ color: '#e53e3e' }}>●</span> Playing Now ({ongoingMatches.length})
            </h2>

            {ongoingMatches.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                No active games currently running. Check back shortly or start a match!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {ongoingMatches.map(m => (
                  <div key={m.id} className="card card-hover" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.95rem', marginBottom: '0.2rem' }}>{m.name}</div>
                      <div style={{ fontSize: '0.8rem', color: 'var(--color-muted)' }}>
                        👥 {m.current_players} Players • Room: {m.room_code}
                      </div>
                    </div>
                    <button
                      className="btn btn-primary"
                      onClick={() => navigate('game', { matchId: m.id, spectating: true })}
                      style={{ padding: '0.4rem 0.9rem', fontSize: '0.85rem' }}
                    >
                      👁 Watch Live
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Waiting in Lobby */}
          <div>
            <h2 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.75rem', color: 'var(--color-muted)' }}>
              ⏳ Waiting Lobbies ({waitingMatches.length})
            </h2>

            {waitingMatches.length === 0 ? (
              <div className="card" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-muted)', fontSize: '0.85rem' }}>
                No open lobbies. Tap Create Match from the home screen!
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                {waitingMatches.map(m => (
                  <div key={m.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{m.name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                        Slots: {m.current_players}/{m.max_players}
                      </div>
                    </div>
                    <button
                      className="btn btn-secondary"
                      onClick={() => navigate('lobby', { matchId: m.id })}
                      style={{ padding: '0.4rem 0.8rem', fontSize: '0.8rem' }}
                    >
                      Join
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default SpectatePage;

