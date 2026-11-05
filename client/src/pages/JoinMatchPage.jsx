import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import api from '../services/api';

function JoinMatchPage() {
  const { navigate, pageParams } = useApp();
  const [roomCode, setRoomCode] = useState(pageParams?.roomCode || '');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [foundMatch, setFoundMatch] = useState(null);

  useEffect(() => {
    if (pageParams?.roomCode) {
      setRoomCode(pageParams.roomCode);
      // Auto-search match
      (async () => {
        setLoading(true);
        try {
          const data = await api.findByRoomCode(pageParams.roomCode.trim().toUpperCase());
          setFoundMatch(data.match);
        } catch (e) {
          setError('Match not found. Check the room code.');
        } finally {
          setLoading(false);
        }
      })();
    }
  }, [pageParams?.roomCode]);

  const searchMatch = async () => {
    if (!roomCode.trim()) return;
    setLoading(true);
    setError('');
    setFoundMatch(null);

    try {
      const data = await api.findByRoomCode(roomCode.trim().toUpperCase());
      setFoundMatch(data.match);
    } catch (err) {
      setError('Match not found. Check the room code.');
    } finally {
      setLoading(false);
    }
  };

  const joinMatch = async () => {
    if (!foundMatch) return;
    setLoading(true);
    try {
      await api.joinMatch(foundMatch.id);
      navigate('lobby', { matchId: foundMatch.id });
    } catch (err) {
      setError(err.message || 'Failed to join match');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: '1rem' }}>
      <div className="page-header">
        <button
          onClick={() => navigate('home')}
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          ←
        </button>
        <h1 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Join Match</h1>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>
          Enter Room Code
        </label>
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input
            type="text"
            className="input"
            placeholder="e.g. ABCD12"
            value={roomCode}
            onChange={e => setRoomCode(e.target.value.toUpperCase().substring(0, 6))}
            onKeyPress={e => e.key === 'Enter' && searchMatch()}
            style={{ flex: 1, textTransform: 'uppercase', letterSpacing: '0.15em', fontSize: '1.1rem' }}
          />
          <button
            className="btn btn-primary"
            onClick={searchMatch}
            disabled={!roomCode.trim() || loading}
          >
            Search
          </button>
        </div>

        {error && (
          <div style={{
            background: 'rgba(229,62,62,0.15)',
            border: '1px solid rgba(229,62,62,0.3)',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            color: '#fc8181',
            fontSize: '0.875rem'
          }}>
            {error}
          </div>
        )}

        {foundMatch && (
          <div style={{
            background: 'rgba(72,199,142,0.1)',
            border: '1px solid rgba(72,199,142,0.3)',
            borderRadius: '0.75rem',
            padding: '1rem',
            marginTop: '1rem'
          }}>
            <div style={{ fontWeight: '700', marginBottom: '0.5rem', fontSize: '1rem' }}>
              🎮 {foundMatch.name}
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.75rem' }}>
              <div>👥 {foundMatch.current_players}/{foundMatch.max_players} players</div>
              <div>Status: {foundMatch.status}</div>
            </div>
            {foundMatch.status === 'waiting' && foundMatch.current_players < foundMatch.max_players ? (
              <button
                className="btn btn-primary"
                onClick={joinMatch}
                disabled={loading}
                style={{ width: '100%' }}
              >
                {loading ? 'Joining...' : '🚀 Join Match'}
              </button>
            ) : foundMatch.status === 'playing' ? (
              <button
                className="btn btn-secondary"
                onClick={() => navigate('game', { matchId: foundMatch.id, spectating: true })}
                style={{ width: '100%' }}
              >
                👁 Watch as Spectator
              </button>
            ) : (
              <p style={{ color: 'var(--color-muted)', textAlign: 'center', fontSize: '0.85rem' }}>
                This match is {foundMatch.status} and cannot be joined.
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default JoinMatchPage;

