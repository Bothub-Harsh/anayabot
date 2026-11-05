import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import api from '../services/api';

function AdminPage() {
  const { user, navigate } = useApp();
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [banReason, setBanReason] = useState('');
  const [targetUserId, setTargetUserId] = useState('');

  useEffect(() => {
    fetchAdminData();
  }, []);

  const fetchAdminData = async () => {
    setLoading(true);
    try {
      const [statsData, usersData] = await Promise.all([
        api.getAdminStats(),
        api.getAdminUsers(1)
      ]);
      setStats(statsData);
      setUsers(usersData.users || []);
    } catch (err) {
      console.error('Failed to load admin stats:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleBanUser = async (userId) => {
    if (!window.confirm('Are you sure you want to ban this user?')) return;
    try {
      await api.banUser(userId, banReason || 'Terms Violation');
      alert('User has been banned.');
      fetchAdminData();
    } catch (err) {
      alert(err.message || 'Failed to ban user');
    }
  };

  const handleUnbanUser = async (userId) => {
    try {
      await api.unbanUser(userId);
      alert('User ban removed.');
      fetchAdminData();
    } catch (err) {
      alert(err.message || 'Failed to unban user');
    }
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
          <h1 style={{ fontSize: '1.2rem', fontWeight: '700' }}>🛡️ Admin Dashboard</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Authorized Platform Moderation</p>
        </div>
      </div>

      {loading ? (
        <div style={{ textAlign: 'center', padding: '3rem' }}>
          <div className="loading-spinner" style={{ margin: '0 auto' }} />
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          {/* Key Metrics */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
            <div className="card" style={{ textAlign: 'center', padding: '0.75rem' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--color-text)' }}>
                {stats?.users?.total || 0}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Registered Users</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '0.75rem' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: '#48c78e' }}>
                {stats?.matches?.active || 0}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Live Matches</div>
            </div>
            <div className="card" style={{ textAlign: 'center', padding: '0.75rem' }}>
              <div style={{ fontSize: '1.3rem', fontWeight: '800', color: 'var(--color-gold)' }}>
                {stats?.matches?.completed || 0}
              </div>
              <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Completed</div>
            </div>
          </div>

          {/* User Management */}
          <div>
            <h2 style={{ fontSize: '1rem', fontWeight: '700', marginBottom: '0.75rem' }}>User Directory</h2>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              {users.map(u => (
                <div key={u.id} className="card" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontWeight: '600', fontSize: '0.85rem' }}>
                      {u.first_name} {u.username ? `(@${u.username})` : ''}
                      {u.is_banned && <span style={{ color: '#e53e3e', fontSize: '0.7rem', marginLeft: '6px' }}>[BANNED]</span>}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>
                      ID: {u.id.substring(0, 8)}... • {u.total_matches || 0} matches • {u.wins || 0} wins
                    </div>
                  </div>

                  <div>
                    {u.is_banned ? (
                      <button
                        className="btn btn-secondary"
                        onClick={() => handleUnbanUser(u.id)}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem' }}
                      >
                        Unban
                      </button>
                    ) : (
                      <button
                        className="btn btn-primary"
                        onClick={() => handleBanUser(u.id)}
                        style={{ padding: '0.3rem 0.6rem', fontSize: '0.75rem', background: '#e53e3e' }}
                      >
                        Ban
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminPage;

