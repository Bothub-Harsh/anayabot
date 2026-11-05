import React, { useState, useEffect, useRef } from 'react';
import { useApp } from '../context/AppContext';
import { SOCKET_EVENTS } from '../constants/game';
import api from '../services/api';

function ChatPanel({ matchId, socket }) {
  const { user } = useApp();
  const [comments, setComments] = useState([]);
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const inputRef = useRef(null);

  // Rate limit: 1 message per 2 seconds
  const lastMessageTime = useRef(0);

  useEffect(() => {
    if (!matchId) return;

    // Load existing comments
    api.getMatchComments(matchId)
      .then(data => setComments(data.comments || []))
      .catch(console.error);
  }, [matchId]);

  useEffect(() => {
    if (!socket) return;

    const handleNewComment = (comment) => {
      setComments(prev => [...prev, comment]);
      scrollToBottom();
    };

    socket.on(SOCKET_EVENTS.NEW_COMMENT, handleNewComment);
    return () => socket.off(SOCKET_EVENTS.NEW_COMMENT, handleNewComment);
  }, [socket]);

  useEffect(() => {
    scrollToBottom();
  }, [comments]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const sendMessage = () => {
    if (!message.trim() || !socket || sending) return;

    const now = Date.now();
    if (now - lastMessageTime.current < 2000) {
      return; // Rate limit
    }

    setSending(true);
    lastMessageTime.current = now;

    socket.emit(SOCKET_EVENTS.SEND_COMMENT, {
      matchId,
      message: message.trim()
    });

    setMessage('');
    setSending(false);
    inputRef.current?.focus();
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const EMOJI_REACTIONS = ['👍', '😂', '😮', '🔥', '👑', '🎲'];

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--color-surface)',
      borderRadius: '0.75rem',
      overflow: 'hidden',
      border: '1px solid rgba(255,255,255,0.08)'
    }}>
      {/* Header */}
      <div style={{
        padding: '0.75rem 1rem',
        borderBottom: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        alignItems: 'center',
        gap: '0.5rem',
        background: 'rgba(0,0,0,0.2)'
      }}>
        <span>💬</span>
        <span style={{ fontWeight: '600', fontSize: '0.9rem' }}>Live Chat</span>
        <span style={{
          marginLeft: 'auto',
          fontSize: '0.75rem',
          color: 'var(--color-muted)',
          background: 'rgba(255,255,255,0.05)',
          padding: '0.2rem 0.5rem',
          borderRadius: '999px'
        }}>
          {comments.length} messages
        </span>
      </div>

      {/* Messages */}
      <div style={{
        flex: 1,
        overflowY: 'auto',
        padding: '0.75rem',
        display: 'flex',
        flexDirection: 'column',
        gap: '0.5rem'
      }}>
        {comments.length === 0 && (
          <div style={{
            textAlign: 'center',
            color: 'var(--color-muted)',
            fontSize: '0.85rem',
            padding: '2rem 0'
          }}>
            No messages yet. Be the first to say something! 👋
          </div>
        )}
        {comments.map((comment) => (
          <ChatMessage
            key={comment.id}
            comment={comment}
            isOwn={comment.userId === user?.id}
            socket={socket}
            matchId={matchId}
            emojis={EMOJI_REACTIONS}
          />
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        padding: '0.75rem',
        borderTop: '1px solid rgba(255,255,255,0.08)',
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center'
      }}>
        <input
          ref={inputRef}
          type="text"
          value={message}
          onChange={e => setMessage(e.target.value.substring(0, 300))}
          onKeyPress={handleKeyPress}
          placeholder="Say something..."
          className="input"
          style={{ flex: 1, padding: '0.6rem 0.75rem', fontSize: '0.875rem' }}
          maxLength={300}
        />
        <button
          onClick={sendMessage}
          disabled={!message.trim() || sending}
          style={{
            background: message.trim() ? 'var(--color-accent)' : 'rgba(255,255,255,0.1)',
            border: 'none',
            borderRadius: '0.5rem',
            padding: '0.6rem 1rem',
            color: 'white',
            cursor: message.trim() ? 'pointer' : 'default',
            fontSize: '1rem',
            transition: 'all 0.2s'
          }}
        >
          ➤
        </button>
      </div>
    </div>
  );
}

function ChatMessage({ comment, isOwn, socket, matchId, emojis }) {
  const [showReactions, setShowReactions] = useState(false);

  const addReaction = (emoji) => {
    socket?.emit(SOCKET_EVENTS.ADD_REACTION, {
      commentId: comment.id,
      emoji,
      matchId
    });
    setShowReactions(false);
  };

  const displayName = comment.username
    ? `@${comment.username}`
    : comment.first_name
    || 'Player';

  return (
    <div
      className="slide-up"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '0.2rem',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        maxWidth: '85%'
      }}
    >
      {!isOwn && (
        <span style={{ fontSize: '0.7rem', color: 'var(--color-muted)', paddingLeft: '0.5rem' }}>
          {displayName}
        </span>
      )}
      <div style={{ display: 'flex', gap: '0.4rem', alignItems: 'flex-end' }}>
        {!isOwn && (
          <div style={{
            width: '28px',
            height: '28px',
            borderRadius: '50%',
            background: 'var(--color-accent2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '0.8rem',
            fontWeight: 'bold',
            flexShrink: 0
          }}>
            {(comment.username || comment.first_name || '?')[0].toUpperCase()}
          </div>
        )}
        <div
          style={{
            background: isOwn
              ? 'var(--color-accent)'
              : 'rgba(255,255,255,0.08)',
            borderRadius: isOwn ? '1rem 1rem 0.25rem 1rem' : '1rem 1rem 1rem 0.25rem',
            padding: '0.5rem 0.75rem',
            fontSize: '0.875rem',
            lineHeight: '1.4',
            wordBreak: 'break-word',
            cursor: 'pointer',
            position: 'relative'
          }}
          onClick={() => setShowReactions(!showReactions)}
        >
          {comment.message}
          {/* Reaction picker */}
          {showReactions && (
            <div style={{
              position: 'absolute',
              bottom: 'calc(100% + 4px)',
              [isOwn ? 'right' : 'left']: 0,
              background: 'var(--color-surface)',
              border: '1px solid rgba(255,255,255,0.1)',
              borderRadius: '2rem',
              padding: '0.4rem 0.5rem',
              display: 'flex',
              gap: '0.3rem',
              zIndex: 100,
              boxShadow: '0 4px 15px rgba(0,0,0,0.4)'
            }}>
              {emojis.map(emoji => (
                <span
                  key={emoji}
                  onClick={(e) => { e.stopPropagation(); addReaction(emoji); }}
                  style={{ cursor: 'pointer', fontSize: '1.1rem' }}
                >
                  {emoji}
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
      <span style={{
        fontSize: '0.65rem',
        color: 'var(--color-muted)',
        alignSelf: isOwn ? 'flex-end' : 'flex-start',
        paddingLeft: isOwn ? 0 : '2rem',
        paddingRight: isOwn ? '0.25rem' : 0
      }}>
        {new Date(comment.createdAt || comment.created_at).toLocaleTimeString([], {
          hour: '2-digit', minute: '2-digit'
        })}
      </span>
    </div>
  );
}

export default ChatPanel;

