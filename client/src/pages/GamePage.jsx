import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useApp } from '../context/AppContext';
import LudoBoard from '../game/LudoBoard';
import DiceComponent from '../game/DiceComponent';
import ChatPanel from '../components/ChatPanel';
import api from '../services/api';
import { SOCKET_EVENTS, PLAYER_COLOR_STYLES, COLOR_EMOJI } from '../constants/game';

function GamePage() {
  const { user, socket, navigate, pageParams } = useApp();
  const { matchId, spectating } = pageParams;

  const [match, setMatch] = useState(null);
  const [gameState, setGameState] = useState(null);
  const [validMoves, setValidMoves] = useState([]);
  const [isRolling, setIsRolling] = useState(false);
  const [spectatorCount, setSpectatorCount] = useState(0);
  const [showChat, setShowChat] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [loading, setLoading] = useState(true);
  const [errorMsg, setErrorMsg] = useState('');

  // Determine user's role and color in this match
  const myPlayer = useMemo(() => {
    if (!match?.players || !user?.id) return null;
    return match.players.find(p => p.userId === user.id);
  }, [match, user]);

  const isMyTurn = useMemo(() => {
    if (!gameState || !myPlayer || gameState.phase !== 'playing') return false;
    const currentP = gameState.players?.[gameState.currentPlayerIndex];
    return currentP?.userId === user?.id;
  }, [gameState, myPlayer, user]);

  const canRoll = useMemo(() => {
    return isMyTurn && !gameState?.diceRolled && !isRolling;
  }, [isMyTurn, gameState, isRolling]);

  // Load initial match details
  useEffect(() => {
    if (!matchId) {
      navigate('home');
      return;
    }

    let isMounted = true;
    api.getMatch(matchId)
      .then(data => {
        if (!isMounted) return;
        setMatch(data.match);
        if (data.gameState) {
          setGameState(data.gameState);
        }
      })
      .catch(err => {
        if (!isMounted) return;
        setErrorMsg(err.message || 'Failed to load match');
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => { isMounted = false; };
  }, [matchId, navigate]);

  // Socket room connection and game events
  useEffect(() => {
    if (!socket || !matchId) return;

    socket.emit(SOCKET_EVENTS.JOIN_MATCH_ROOM, {
      matchId,
      role: spectating ? 'spectator' : 'player'
    });

    const handleMatchJoined = (payload) => {
      if (payload.match) setMatch(payload.match);
      if (payload.gameState) setGameState(payload.gameState);
      if (typeof payload.spectatorCount === 'number') {
        setSpectatorCount(payload.spectatorCount);
      }
    };

    const handleDiceRolled = (data) => {
      setIsRolling(false);
      if (data.gameState) setGameState(data.gameState);
      if (data.userId === user?.id && data.validMoves) {
        setValidMoves(data.validMoves);
      }
      setAnnouncement(`🎲 ${data.username || 'Player'} rolled a ${data.diceValue}!`);
    };

    const handleTokenMoved = (data) => {
      setValidMoves([]);
      if (data.gameState) setGameState(data.gameState);
    };

    const handleTokenCaptured = (data) => {
      setAnnouncement(`💥 Token captured! Sent back to home base!`);
    };

    const handleTurnChanged = (data) => {
      if (data.gameState) setGameState(data.gameState);
      setValidMoves([]);
    };

    const handleMatchCompleted = (data) => {
      if (data.gameState) setGameState(data.gameState);
      setAnnouncement('🏆 Match Completed!');
    };

    const handleSpectatorCount = (data) => {
      if (typeof data.count === 'number') setSpectatorCount(data.count);
    };

    const handleMoveError = (data) => {
      setIsRolling(false);
      setAnnouncement(`⚠️ ${data.message || 'Invalid move'}`);
    };

    socket.on(SOCKET_EVENTS.MATCH_JOINED, handleMatchJoined);
    socket.on(SOCKET_EVENTS.DICE_ROLLED, handleDiceRolled);
    socket.on(SOCKET_EVENTS.TOKEN_MOVED, handleTokenMoved);
    socket.on(SOCKET_EVENTS.TOKEN_CAPTURED, handleTokenCaptured);
    socket.on(SOCKET_EVENTS.TURN_CHANGED, handleTurnChanged);
    socket.on(SOCKET_EVENTS.MATCH_COMPLETED, handleMatchCompleted);
    socket.on(SOCKET_EVENTS.SPECTATOR_COUNT_UPDATED, handleSpectatorCount);
    socket.on(SOCKET_EVENTS.MOVE_ERROR, handleMoveError);

    return () => {
      socket.off(SOCKET_EVENTS.MATCH_JOINED, handleMatchJoined);
      socket.off(SOCKET_EVENTS.DICE_ROLLED, handleDiceRolled);
      socket.off(SOCKET_EVENTS.TOKEN_MOVED, handleTokenMoved);
      socket.off(SOCKET_EVENTS.TOKEN_CAPTURED, handleTokenCaptured);
      socket.off(SOCKET_EVENTS.TURN_CHANGED, handleTurnChanged);
      socket.off(SOCKET_EVENTS.MATCH_COMPLETED, handleMatchCompleted);
      socket.off(SOCKET_EVENTS.SPECTATOR_COUNT_UPDATED, handleSpectatorCount);
      socket.off(SOCKET_EVENTS.MOVE_ERROR, handleMoveError);
      socket.emit(SOCKET_EVENTS.LEAVE_MATCH_ROOM);
    };
  }, [socket, matchId, spectating, user?.id]);

  const handleRollDice = useCallback(() => {
    if (!canRoll || !socket) return;
    setIsRolling(true);
    socket.emit(SOCKET_EVENTS.ROLL_DICE, { matchId });
  }, [canRoll, socket, matchId]);

  const handleTokenClick = useCallback((token) => {
    if (!isMyTurn || !socket) return;
    const move = validMoves.find(m => m.tokenId === token.id);
    if (!move) return;

    socket.emit(SOCKET_EVENTS.MOVE_TOKEN, {
      matchId,
      tokenId: token.id,
      targetPosition: move.to
    });
  }, [isMyTurn, socket, validMoves, matchId]);

  if (loading) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100vh', gap: '1rem' }}>
        <div className="loading-spinner" />
        <p style={{ color: 'var(--color-muted)' }}>Entering Arena...</p>
      </div>
    );
  }

  if (errorMsg || !match) {
    return (
      <div className="page" style={{ paddingTop: '3rem', textAlign: 'center' }}>
        <p style={{ color: '#fc8181', marginBottom: '1.5rem' }}>{errorMsg || 'Match could not be found.'}</p>
        <button className="btn btn-secondary" onClick={() => navigate('home')}>Return to Arena</button>
      </div>
    );
  }

  const currentPlayer = gameState?.players?.[gameState?.currentPlayerIndex];
  const isSpectatorMode = spectating || !myPlayer;
  const isGameOver = gameState?.phase === 'completed' || match?.status === 'completed';
  const displayWinners = (gameState?.winners && gameState.winners.length > 0)
    ? gameState.winners
    : (match?.winner_id ? [{ userId: match.winner_id, color: match.players?.find(p => p.userId === match.winner_id)?.color || 'red' }] : []);

  return (
    <div className="page" style={{ paddingTop: '0.5rem', paddingBottom: '4rem', position: 'relative' }}>
      {/* Top Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0.4rem 0',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        marginBottom: '0.5rem'
      }}>
        <button
          onClick={() => navigate('home')}
          style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1.2rem', padding: '0.2rem' }}
        >
          ✕
        </button>

        <div style={{ textAlign: 'center' }}>
          <div style={{ fontWeight: '700', fontSize: '0.9rem' }}>{match.name || 'Arena Match'}</div>
          <div style={{ fontSize: '0.7rem', color: 'var(--color-muted)' }}>Room: {match.room_code}</div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span style={{
            fontSize: '0.75rem',
            background: 'rgba(255,255,255,0.06)',
            padding: '0.2rem 0.5rem',
            borderRadius: '999px',
            color: 'var(--color-muted)'
          }}>
            👁 {spectatorCount}
          </span>
          <button
            onClick={() => setShowChat(!showChat)}
            style={{
              background: showChat ? 'var(--color-accent)' : 'rgba(255,255,255,0.08)',
              border: 'none',
              borderRadius: '0.5rem',
              color: 'white',
              padding: '0.3rem 0.6rem',
              cursor: 'pointer',
              fontSize: '0.85rem'
            }}
          >
            💬 Chat
          </button>
        </div>
      </div>

      {/* Spectator Banner if spectating */}
      {isSpectatorMode && (
        <div style={{
          background: 'rgba(49, 130, 206, 0.15)',
          border: '1px solid rgba(49, 130, 206, 0.3)',
          color: '#63b3ed',
          borderRadius: '0.5rem',
          padding: '0.4rem 0.75rem',
          fontSize: '0.8rem',
          textAlign: 'center',
          marginBottom: '0.5rem'
        }}>
          👁 Spectator Mode: Live Board View
        </div>
      )}

      {/* Players Turn Bar */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${gameState?.players?.length || 2}, 1fr)`,
        gap: '0.4rem',
        marginBottom: '0.5rem'
      }}>
        {gameState?.players?.map((p, idx) => {
          const isTurn = gameState?.currentPlayerIndex === idx && !isGameOver;
          const styles = PLAYER_COLOR_STYLES[p.color];
          const isYou = p.userId === user?.id;

          return (
            <div
              key={p.userId}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.3rem',
                padding: '0.35rem 0.5rem',
                borderRadius: '0.5rem',
                background: isTurn ? `${styles.bg}33` : 'rgba(255,255,255,0.03)',
                border: isTurn ? `2px solid ${styles.bg}` : '1px solid rgba(255,255,255,0.05)',
                transition: 'all 0.3s ease'
              }}
            >
              <div style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: styles.bg
              }} />
              <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.75rem', flex: 1 }}>
                <span style={{ fontWeight: isTurn ? '700' : '500' }}>
                  {p.username || 'Player'}
                </span>
                {isYou && <span style={{ color: 'var(--color-gold)', marginLeft: '2px' }}>(You)</span>}
              </div>
              {isTurn && (
                <span style={{ fontSize: '0.65rem', color: styles.bg, fontWeight: '700' }}>▶</span>
              )}
            </div>
          );
        })}
      </div>

      {/* Announcement Message */}
      {announcement && (
        <div style={{
          textAlign: 'center',
          fontSize: '0.8rem',
          color: '#ffd700',
          fontWeight: '600',
          marginBottom: '0.3rem',
          minHeight: '1.2rem'
        }}>
          {announcement}
        </div>
      )}

      {/* Center Board Area */}
      <div style={{ position: 'relative', width: '100%', marginBottom: '0.75rem' }}>
        <LudoBoard
          gameState={gameState}
          currentUserId={user?.id}
          onTokenClick={handleTokenClick}
          validMoves={validMoves}
          myColor={myPlayer?.color}
        />
      </div>

      {/* Bottom Controls: Dice & Turn Info */}
      <div className="card" style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-around',
        padding: '0.75rem'
      }}>
        <div style={{ textAlign: 'left' }}>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-muted)' }}>Current Turn</div>
          <div style={{ fontWeight: '700', fontSize: '0.95rem', color: currentPlayer ? PLAYER_COLOR_STYLES[currentPlayer.color]?.bg : 'inherit' }}>
            {isGameOver ? 'Match Over' : isMyTurn ? '🌟 YOUR TURN!' : `${currentPlayer?.username || 'Player'}'s turn`}
          </div>
          {validMoves.length > 0 && isMyTurn && (
            <div style={{ fontSize: '0.75rem', color: '#48c78e', marginTop: '0.2rem' }}>
              Tap a highlighted token to move
            </div>
          )}
        </div>

        <DiceComponent
          value={gameState?.diceValue}
          canRoll={canRoll}
          onRoll={handleRollDice}
          isRolling={isRolling}
        />
      </div>

      {/* Winner / Game Over Modal */}
      {isGameOver && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.85)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 999,
          padding: '1rem'
        }}>
          <div className="card bounce-in" style={{
            maxWidth: '360px',
            width: '100%',
            textAlign: 'center',
            border: '2px solid var(--color-gold)',
            boxShadow: '0 0 30px rgba(245, 166, 35, 0.4)'
          }}>
            <div style={{ fontSize: '3rem', marginBottom: '0.5rem' }}>🏆</div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: '800', color: 'var(--color-gold)', marginBottom: '0.5rem' }}>
              Victory!
            </h2>
            <p style={{ color: 'var(--color-muted)', fontSize: '0.85rem', marginBottom: '1rem' }}>
              The match has ended!
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '1.5rem' }}>
              {displayWinners.map((w, index) => (
                <div key={w.userId} style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  padding: '0.5rem 0.75rem',
                  background: 'rgba(255,255,255,0.04)',
                  borderRadius: '0.5rem',
                  border: index === 0 ? '1px solid var(--color-gold)' : 'none'
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <span>{index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : '4️⃣'}</span>
                    <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>
                      {COLOR_EMOJI[w.color]} {match.players?.find(p => p.userId === w.userId)?.username || 'Player'}
                    </span>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-gold)' }}>
                    {index === 0 ? '+100 XP' : '+25 XP'}
                  </span>
                </div>
              ))}
            </div>

            <button
              className="btn btn-primary"
              onClick={() => navigate('home')}
              style={{ width: '100%', padding: '0.75rem' }}
            >
              Back to Arena
            </button>
          </div>
        </div>
      )}

      {/* Collapsible Live Chat Overlay / Drawer */}
      {showChat && (
        <div style={{
          position: 'fixed',
          bottom: 0,
          left: 0,
          right: 0,
          height: '55vh',
          zIndex: 100,
          background: 'var(--color-surface)',
          borderTop: '2px solid var(--color-accent)',
          borderTopLeftRadius: '1rem',
          borderTopRightRadius: '1rem',
          boxShadow: '0 -10px 25px rgba(0,0,0,0.5)',
          display: 'flex',
          flexDirection: 'column'
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '0.5rem 1rem',
            borderBottom: '1px solid rgba(255,255,255,0.08)'
          }}>
            <span style={{ fontWeight: '700', fontSize: '0.9rem' }}>Match Live Discussion</span>
            <button
              onClick={() => setShowChat(false)}
              style={{ background: 'none', border: 'none', color: 'var(--color-muted)', cursor: 'pointer', fontSize: '1.1rem' }}
            >
              ✕
            </button>
          </div>
          <div style={{ flex: 1, overflow: 'hidden' }}>
            <ChatPanel matchId={matchId} socket={socket} />
          </div>
        </div>
      )}
    </div>
  );
}

export default GamePage;

