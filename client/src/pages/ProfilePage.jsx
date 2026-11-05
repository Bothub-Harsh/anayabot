import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import api from '../services/api';
import { LEVEL_THRESHOLDS, getXPProgressToNextLevel } from '../constants/game';

function ProfilePage() {
  const { user, navigate } = useApp();
  const [profile, setProfile] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user?.id) return;

    Promise.all([
      api.getUser(user.id),
      api.getUserMatches(user.id)
    ])
      .then(([userData, matchesData]) => {
        setProfile(userData.user);
        setMatches(matchesData.matches || []);
      })
      .catch(err => console.error('Failed to load profile:', err))
      .finally(() => setLoading(false));
  }, [user?.id]);

  const p = profile || user || {};
  const winRate = p.total_matches > 0
    ? ((p.wins / p.total_matches) * 100).toFixed(1)
    : '0.0';

  const xpProgress = getXPProgressToNextLevel(p.total_xp || 0, p.level || 1);

  return (
    <div className="page" style={{ paddingTop: '1rem', paddingBottom: '5rem' }}>
      <div className="page-header">
        <button
          onClick={() => navigate('home')}
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          ←
        </button>
        <h1 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Player Profile</h1>
      </div>

      {/* User Header Card */}
      <div className="card" style={{ textAlign: 'center', marginBottom: '1rem', position: 'relative', overflow: 'hidden' }}>
        <div style={{
          width: '70px',
          height: '70px',
          borderRadius: '50%',
          background: 'linear-gradient(135deg, #e94560, #f5a623)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 0.75rem',
          fontSize: '1.8rem',
          fontWeight: 'bold',
          color: 'white',
          boxShadow: '0 4px 15px rgba(233, 69, 96, 0.4)'
        }}>
          {(p.first_name || p.username || 'P')[0]?.toUpperCase()}
        </div>

        <h2 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '0.2rem' }}>
          {p.first_name || 'Player'}
        </h2>
        {p.username && (
          <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginBottom: '0.75rem' }}>
            @{p.username}
          </p>
        )}

        {/* Level & XP Bar */}
        <div style={{ maxWidth: '280px', margin: '0 auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', marginBottom: '0.3rem' }}>
            <span style={{ color: 'var(--color-gold)', fontWeight: '700' }}>Level {p.level || 1}</span>
            <span style={{ color: 'var(--color-muted)' }}>{p.total_xp || 0} XP</span>
          </div>
          <div style={{ height: '6px', background: 'rgba(255,255,255,0.1)', borderRadius: '3px', overflow: 'hidden' }}>
            <div style={{
              height: '100%',
              width: `${xpProgress}%`,
              background: 'linear-gradient(90deg, #f5a623, #e94560)',
              borderRadius: '3px',
              transition: 'width 0.4s ease'
            }} />
          </div>
        </div>
      </div>

      {/* Stats Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: '0.75rem', marginBottom: '1.5rem' }}>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#48c78e' }}>{p.wins || 0}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Total Wins</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-accent)' }}>{p.losses || 0}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Total Losses</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-gold)' }}>{winRate}%</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Win Rate</div>
        </div>
        <div className="card" style={{ textAlign: 'center', padding: '1rem' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: '800', color: '#63b3ed' }}>🔥 {p.best_win_streak || 0}</div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Best Streak</div>
        </div>
      </div>

      {/* Recent Match History */}
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.75rem' }}>Match History</h3>

        {matches.length === 0 ? (
          <div className="card" style={{ textAlign: 'center', padding: '1.5rem', color: 'var(--color-muted)', fontSize: '0.85rem' }}>
            No completed matches yet. Jump into the arena!
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {matches.map(m => {
              const won = m.finished_position === 1;
              return (
                <div key={m.id} className="card" style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.75rem 1rem'
                }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                      {won ? '🏆 Victory' : `Finished #${m.finished_position || '-'}`}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                      Room: {m.room_code} • {m.color?.toUpperCase()} Team
                    </div>
                  </div>
                  <span className={`badge ${won ? 'badge-active' : 'badge-completed'}`}>
                    {won ? '+100 XP' : '+25 XP'}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default ProfilePage;

