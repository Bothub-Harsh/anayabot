import React, { useState } from 'react';
import { useApp } from '../context/AppContext';

function SettingsPage() {
  const { navigate, user } = useApp();
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [vibrationEnabled, setVibrationEnabled] = useState(true);
  const [chatPreview, setChatPreview] = useState(true);

  return (
    <div className="page" style={{ paddingTop: '1rem', paddingBottom: '5rem' }}>
      <div className="page-header">
        <button
          onClick={() => navigate('home')}
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          ←
        </button>
        <h1 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Settings & Rules</h1>
      </div>

      {/* Preferences Card */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '1rem' }}>Game Preferences</h2>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Sound Effects</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Dice rolls, capture effects, and victory chimes</div>
            </div>
            <input
              type="checkbox"
              checked={soundEnabled}
              onChange={e => setSoundEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>Haptic Feedback</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Vibrate on token movements and captures</div>
            </div>
            <input
              type="checkbox"
              checked={vibrationEnabled}
              onChange={e => setVibrationEnabled(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>In-Game Chat Overlay</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Display spectator reactions during match</div>
            </div>
            <input
              type="checkbox"
              checked={chatPreview}
              onChange={e => setChatPreview(e.target.checked)}
              style={{ width: '18px', height: '18px', accentColor: 'var(--color-accent)' }}
            />
          </div>
        </div>
      </div>

      {/* Ludo Arena Rules Reference */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '0.95rem', fontWeight: '700', marginBottom: '0.75rem' }}>🎲 Official Rules</h2>
        <div style={{ fontSize: '0.825rem', color: 'var(--color-muted)', display: 'flex', flexDirection: 'column', gap: '0.5rem', lineHeight: '1.5' }}>
          <div>1. <strong>Starting Out:</strong> Roll a 6 to move a token from your base onto the starting tile.</div>
          <div>2. <strong>Bonus Roll:</strong> Rolling a 6 or capturing an opponent grants you an extra dice roll.</div>
          <div>3. <strong>Capturing:</strong> Landing on an opponent token on an open path cell sends them back to their home base!</div>
          <div>4. <strong>Safe Havens:</strong> Cells marked with a Star (⭐) and home paths cannot be captured.</div>
          <div>5. <strong>Victory:</strong> Move all 4 tokens into the central home triangle to secure your victory rank.</div>
        </div>
      </div>

      {/* Admin Panel Link if admin */}
      {user?.is_admin && (
        <button
          className="btn btn-secondary"
          onClick={() => navigate('admin')}
          style={{ width: '100%', marginBottom: '1rem', border: '1px solid var(--color-accent)' }}
        >
          🛡️ Open Admin Dashboard
        </button>
      )}

      <div style={{ textAlign: 'center', fontSize: '0.75rem', color: 'var(--color-muted)' }}>
        Ludo Arena v1.0.0 • Telegram Multiplayer Edition
      </div>
    </div>
  );
}

export default SettingsPage;

