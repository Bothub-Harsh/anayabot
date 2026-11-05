import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import api from '../services/api';

function LeaderboardPage() {
  const { user, navigate } = useApp();
  const [leaderboard, setLeaderboard] = useState([]);
  const [filter, setFilter] = useState('wins');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchLeaderboard(filter);
  }, [filter]);

  const fetchLeaderboard = async (type) => {
    setLoading(true);
    try {
      const data = await api.getLeaderboard(`?type=${type}`);
      setLeaderboard(data.leaderboard || []);
    } catch (err) {
      console.error('Failed to load leaderboard:', err);
    } finally {
      setLoading(false);
    }
  };

  const getRankBadge = (rank) => {
    if (rank === 1) return '🥇';
    if (rank === 2) return '🥈';
    if (rank === 3) return '🥉';
    return `#${rank}`;
  };

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
          <h1 style={{ fontSize: '1.2rem', fontWeight: '700' }}>🏆 Global Leaderboard</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Top ranking Ludo Arena players</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '0.5rem',
        marginBottom: '1rem'
      }}>
        {[
          { id: 'wins', label: 'Most Wins' },
          { id: 'streak', label: 'Best Streak' },
          { id: 'xp', label: 'Top Level' }
        ].map(t => (
          <button
            key={t.id}
            onClick={() => setFilter(t.id)}
            style={{
              padding: '0.5rem',
              borderRadius: '0.5rem',
              border: filter === t.id ? '1px solid var(--color-gold)' : '1px solid rgba(255,255,255,0.08)',
              background: filter === t.id ? 'rgba(245, 166, 35, 0.15)' : 'var(--color-surface2)',
              color: filter === t.id ? 'var(--color-gold)' : 'var(--color-text)',
              fontSize: '0.8rem',
              fontWeight: '600',
              cursor: 'pointer'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Leaderboard List */}
      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="loading-spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : leaderboard.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', padding: '2rem', color: 'var(--color-muted)' }}>
          No leaderboard data available yet. Play matches to climb the ranks!
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {leaderboard.map((item, index) => {
            const rank = index + 1;
            const isMe = item.id === user?.id;

            return (
              <div
                key={item.id}
                className="card"
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                  padding: '0.75rem 1rem',
                  border: isMe ? '1px solid var(--color-accent)' : rank <= 3 ? '1px solid rgba(245, 166, 35, 0.3)' : '1px solid rgba(255,255,255,0.05)',
                  background: isMe ? 'rgba(233, 69, 96, 0.1)' : 'var(--color-surface)'
                }}
              >
                <div style={{ fontSize: '1.2rem', width: '32px', textAlign: 'center', fontWeight: '800' }}>
                  {getRankBadge(rank)}
                </div>

                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: '600', fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.first_name || item.username || 'Player'}
                    {item.username && (
                      <span style={{ color: 'var(--color-muted)', fontSize: '0.75rem', marginLeft: '4px' }}>
                        @{item.username}
                      </span>
                    )}
                    {isMe && <span style={{ color: 'var(--color-gold)', fontSize: '0.7rem', marginLeft: '4px' }}>(You)</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                    Level {item.level || 1} • {item.total_matches || 0} matches ({item.win_percentage || 0}% WR)
                  </div>
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontWeight: '800', color: 'var(--color-gold)', fontSize: '1rem' }}>
                    {filter === 'wins' && `${item.wins || 0} W`}
                    {filter === 'streak' && `🔥 ${item.best_win_streak || 0}`}
                    {filter === 'xp' && `${item.total_xp || 0} XP`}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default LeaderboardPage;

