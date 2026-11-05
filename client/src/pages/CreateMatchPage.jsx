import React, { useState } from 'react';
import { useApp } from '../context/AppContext';
import api from '../services/api';

function CreateMatchPage() {
  const { navigate } = useApp();
  const [form, setForm] = useState({
    name: '',
    maxPlayers: 4,
    visibility: 'public'
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await api.createMatch({
        name: form.name.trim() || undefined,
        maxPlayers: parseInt(form.maxPlayers),
        visibility: form.visibility
      });
      navigate('lobby', { matchId: data.match.id });
    } catch (err) {
      setError(err.message || 'Failed to create match');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="page" style={{ paddingTop: '1rem' }}>
      {/* Header */}
      <div className="page-header">
        <button
          onClick={() => navigate('home')}
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          ←
        </button>
        <h1 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Create Match</h1>
      </div>

      <div className="card" style={{ marginTop: '1rem' }}>
        {/* Match name */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>
            Match Name (optional)
          </label>
          <input
            type="text"
            className="input"
            placeholder="My Ludo Match"
            value={form.name}
            onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
            maxLength={50}
          />
        </div>

        {/* Max players */}
        <div style={{ marginBottom: '1.25rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>
            Number of Players
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            {[2, 3, 4].map(n => (
              <button
                key={n}
                onClick={() => setForm(f => ({ ...f, maxPlayers: n }))}
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  border: form.maxPlayers === n
                    ? '2px solid var(--color-accent)'
                    : '2px solid rgba(255,255,255,0.1)',
                  background: form.maxPlayers === n
                    ? 'rgba(233,69,96,0.15)'
                    : 'var(--color-surface2)',
                  color: 'white',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '1rem',
                  transition: 'all 0.2s'
                }}
              >
                {n} Players
              </button>
            ))}
          </div>
        </div>

        {/* Visibility */}
        <div style={{ marginBottom: '1.5rem' }}>
          <label style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>
            Visibility
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {[
              { value: 'public', icon: '🌍', label: 'Public', desc: 'Anyone can join' },
              { value: 'private', icon: '🔒', label: 'Private', desc: 'Invite only' }
            ].map(opt => (
              <button
                key={opt.value}
                onClick={() => setForm(f => ({ ...f, visibility: opt.value }))}
                style={{
                  padding: '0.75rem',
                  borderRadius: '0.75rem',
                  border: form.visibility === opt.value
                    ? '2px solid var(--color-accent)'
                    : '2px solid rgba(255,255,255,0.1)',
                  background: form.visibility === opt.value
                    ? 'rgba(233,69,96,0.15)'
                    : 'var(--color-surface2)',
                  color: 'white',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'all 0.2s'
                }}
              >
                <div style={{ fontSize: '1.2rem', marginBottom: '0.25rem' }}>{opt.icon}</div>
                <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>{opt.label}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>{opt.desc}</div>
              </button>
            ))}
          </div>
        </div>

        {error && (
          <div style={{
            background: 'rgba(229,62,62,0.15)',
            border: '1px solid rgba(229,62,62,0.3)',
            borderRadius: '0.5rem',
            padding: '0.75rem',
            color: '#fc8181',
            fontSize: '0.875rem',
            marginBottom: '1rem'
          }}>
            {error}
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleCreate}
          disabled={loading}
          style={{ width: '100%', padding: '1rem' }}
        >
          {loading ? 'Creating...' : '🎮 Create Match'}
        </button>
      </div>
    </div>
  );
}

export default CreateMatchPage;

