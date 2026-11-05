import React, { useState, useEffect } from 'react';
import { useApp } from '../context/AppContext';
import api from '../services/api';
import { SOCKET_EVENTS, PLAYER_COLOR_STYLES, COLOR_EMOJI } from '../constants/game';

function LobbyPage() {
  const { user, socket, navigate, pageParams } = useApp();
  const { matchId } = pageParams;
  
  const [match, setMatch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [starting, setStarting] = useState(false);
  const [copied, setCopied] = useState(false);

  const isCreator = match?.creator_id === user?.id;

  useEffect(() => {
    if (!matchId) {
      navigate('home');
      return;
    }
    fetchMatch();
  }, [matchId]);

  useEffect(() => {
    if (!socket || !matchId) return;

    socket.emit(SOCKET_EVENTS.JOIN_MATCH_ROOM, { matchId });

    const handleMatchJoined = ({ match: m }) => {
      if (m) setMatch(m);
      setLoading(false);
    };

    const handlePlayerStatusChanged = () => {
      fetchMatch();
    };

    const handleMatchStarted = ({ matchId: startedId }) => {
      if (startedId === matchId) {
        navigate('game', { matchId });
      }
    };

    const handlePlayerJoined = () => {
      fetchMatch();
    };

    socket.on(SOCKET_EVENTS.MATCH_JOINED, handleMatchJoined);
    socket.on(SOCKET_EVENTS.PLAYER_STATUS_CHANGED, handlePlayerStatusChanged);
    socket.on(SOCKET_EVENTS.MATCH_STARTED, handleMatchStarted);

    return () => {
      socket.off(SOCKET_EVENTS.MATCH_JOINED, handleMatchJoined);
      socket.off(SOCKET_EVENTS.PLAYER_STATUS_CHANGED, handlePlayerStatusChanged);
      socket.off(SOCKET_EVENTS.MATCH_STARTED, handleMatchStarted);
    };
  }, [socket, matchId]);

  const fetchMatch = async () => {
    try {
      const data = await api.getMatch(matchId);
      setMatch(data.match);
    } catch (err) {
      console.error('Failed to fetch match:', err);
    } finally {
      setLoading(false);
    }
  };

  const startMatch = async () => {
    setStarting(true);
    try {
      await api.startMatch(matchId);
      navigate('game', { matchId });
    } catch (err) {
      alert(err.message || 'Failed to start match');
    } finally {
      setStarting(false);
    }
  };

  const leaveMatch = async () => {
    try {
      await api.leaveMatch(matchId);
      socket?.emit(SOCKET_EVENTS.LEAVE_MATCH_ROOM);
    } catch (err) {}
    navigate('home');
  };

  const copyRoomCode = () => {
    navigator.clipboard.writeText(match?.room_code || '').catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
        <div className="loading-spinner" />
      </div>
    );
  }

  if (!match) {
    return (
      <div className="page" style={{ textAlign: 'center', paddingTop: '4rem' }}>
        <p>Match not found</p>
        <button className="btn btn-primary" onClick={() => navigate('home')} style={{ marginTop: '1rem' }}>
          Go Home
        </button>
      </div>
    );
  }

  const players = match.players || [];
  const emptySlots = match.max_players - players.length;
  const canStart = isCreator && players.length >= 2;

  return (
    <div className="page" style={{ paddingTop: '1rem' }}>
      {/* Header */}
      <div className="page-header">
        <button
          onClick={leaveMatch}
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1.2rem' }}
        >
          ←
        </button>
        <div>
          <h1 style={{ fontSize: '1.1rem', fontWeight: '700' }}>{match.name}</h1>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Waiting for players...</p>
        </div>
      </div>

      {/* Room code */}
      <div className="card" style={{ textAlign: 'center', marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.8rem', color: 'var(--color-muted)', marginBottom: '0.5rem' }}>Room Code</p>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.75rem' }}>
          <span style={{
            fontSize: '2rem',
            fontWeight: '800',
            letterSpacing: '0.3em',
            color: 'var(--color-gold)',
            fontFamily: 'monospace'
          }}>
            {match.room_code}
          </span>
          <button
            onClick={copyRoomCode}
            style={{
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '0.5rem',
              color: copied ? '#48c78e' : 'var(--color-muted)',
              padding: '0.4rem 0.75rem',
              cursor: 'pointer',
              fontSize: '0.8rem'
            }}
          >
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
        </div>
        <p style={{ fontSize: '0.75rem', color: 'var(--color-muted)', marginTop: '0.5rem' }}>
          Share this code with friends to invite them
        </p>
      </div>

      {/* Players */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <h3 style={{ fontSize: '0.9rem', fontWeight: '700', marginBottom: '1rem', color: 'var(--color-muted)' }}>
          Players ({players.length}/{match.max_players})
        </h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {players.map((player, i) => {
            const style = PLAYER_COLOR_STYLES[player.color];
            const isMe = player.userId === user?.id;
            return (
              <div key={player.userId} style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.75rem',
                padding: '0.75rem',
                background: `${style.bg}15`,
                borderRadius: '0.75rem',
                border: `1px solid ${style.bg}44`
              }}>
                <div style={{
                  width: '36px',
                  height: '36px',
                  borderRadius: '50%',
                  background: style.bg,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 'bold',
                  fontSize: '0.8rem'
                }}>
                  {COLOR_EMOJI[player.color]}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                    {player.username ? `@${player.username}` : player.first_name || 'Player'}
                    {isMe && <span style={{ color: 'var(--color-gold)', fontSize: '0.7rem', marginLeft: '0.4rem' }}>(You)</span>}
                    {i === 0 && <span style={{ color: 'var(--color-muted)', fontSize: '0.7rem', marginLeft: '0.4rem' }}>👑 Host</span>}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: style.bg, textTransform: 'capitalize' }}>
                    {player.color} team
                  </div>
                </div>
                <div style={{ fontSize: '0.8rem', color: '#48c78e' }}>✓ Ready</div>
              </div>
            );
          })}

          {/* Empty slots */}
          {Array.from({ length: emptySlots }).map((_, i) => (
            <div key={`empty-${i}`} style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.75rem',
              padding: '0.75rem',
              background: 'rgba(255,255,255,0.03)',
              borderRadius: '0.75rem',
              border: '1px dashed rgba(255,255,255,0.1)'
            }}>
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.05)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.1rem'
              }}>
                ?
              </div>
              <span style={{ color: 'var(--color-muted)', fontSize: '0.85rem' }}>Waiting for player...</span>
            </div>
          ))}
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {isCreator ? (
          <button
            className="btn btn-primary"
            onClick={startMatch}
            disabled={!canStart || starting}
            style={{ width: '100%', padding: '1rem' }}
          >
            {starting ? 'Starting...' : 
             canStart ? '🚀 Start Match' : 
             '⏳ Need at least 2 players'}
          </button>
        ) : (
          <div className="card" style={{ textAlign: 'center', color: 'var(--color-muted)' }}>
            Waiting for the host to start the match...
          </div>
        )}
        <button
          className="btn btn-secondary"
          onClick={leaveMatch}
          style={{ width: '100%' }}
        >
          Leave Lobby
        </button>
      </div>
    </div>
  );
}

export default LobbyPage;

