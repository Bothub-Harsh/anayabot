const { 
  processDiceRoll, 
  processMove, 
  getPublicGameState 
} = require('../game/ludoEngine');
const { 
  getGameState, 
  saveGameState, 
  saveMove, 
  completeMatch,
  leaveMatch,
  getMatchById
} = require('../services/matchService');
const { 
  findUserByTelegramId,
  createOrUpdateUser,
  addSpectator,
  removeSpectator,
  addComment,
  addReaction,
  findMatchById,
  updateMatchDoc,
  models,
  memoryStore
} = require('../database/db');
const { verifyTelegramInitData } = require('../middleware/auth');

// Track connected sockets per match
const matchConnections = new Map(); // matchId -> Set of socket IDs
const socketToUser = new Map(); // socketId -> { userId, matchId, role }

function initializeSocketHandlers(io) {
  io.use(async (socket, next) => {
    try {
      const initData = socket.handshake.auth?.initData;
      const isDev = !process.env.NODE_ENV || process.env.NODE_ENV === 'development' || !process.env.TELEGRAM_BOT_TOKEN;

      // Development / Test bypass
      if (isDev && (!initData || initData === 'dev_bypass' || !process.env.TELEGRAM_BOT_TOKEN)) {
        const user = await createOrUpdateUser({
          id: 123456789,
          first_name: 'Player',
          username: 'ludoplayer',
          language_code: 'en'
        });
        socket.userId = user.id || user._id;
        socket.username = user.username || user.first_name;
        socket.telegramId = 123456789;
        return next();
      }

      if (!initData) {
        return next(new Error('Authentication required'));
      }

      const telegramUser = verifyTelegramInitData(initData);
      if (!telegramUser) {
        return next(new Error('Invalid authentication'));
      }

      let user = await findUserByTelegramId(telegramUser.id);
      if (!user) {
        user = await createOrUpdateUser(telegramUser);
      }
      
      if (user.is_banned) {
        return next(new Error('Account banned'));
      }

      socket.userId = user.id || user._id;
      socket.username = user.username || user.first_name;
      socket.telegramId = telegramUser.id;
      next();
    } catch (error) {
      console.error('Socket auth error:', error);
      next(new Error('Authentication failed'));
    }
  });

  io.on('connection', (socket) => {
    console.log(`Socket connected: ${socket.id} (user: ${socket.username})`);

    // ===== MATCH ROOM EVENTS =====

    socket.on('join_match_room', async ({ matchId, role = 'player' }) => {
      try {
        if (!matchId) {
          return socket.emit('error', { message: 'matchId is required' });
        }

        const match = await getMatchById(matchId);
        if (!match) {
          return socket.emit('error', { message: 'Match not found' });
        }

        // Join Socket.IO room
        socket.join(`match:${matchId}`);
        
        // Track connection
        if (!matchConnections.has(matchId)) {
          matchConnections.set(matchId, new Set());
        }
        matchConnections.get(matchId).add(socket.id);
        socketToUser.set(socket.id, { userId: socket.userId, matchId, role });

        // If spectator, record in DB
        if (role === 'spectator') {
          await addSpectator(matchId, socket.userId);
        }

        // Send current match state
        const gameState = await getGameState(matchId);
        
        socket.emit('match_joined', {
          match,
          gameState: gameState ? getPublicGameState(gameState) : null,
          role
        });

        // Notify others
        socket.to(`match:${matchId}`).emit('player_connected', {
          userId: socket.userId,
          username: socket.username,
          role
        });

        console.log(`User ${socket.username} joined match room ${matchId} as ${role}`);
      } catch (error) {
        console.error('join_match_room error:', error);
        socket.emit('error', { message: 'Failed to join match room' });
      }
    });

    socket.on('leave_match_room', async ({ matchId }) => {
      try {
        socket.leave(`match:${matchId}`);
        
        if (matchConnections.has(matchId)) {
          matchConnections.get(matchId).delete(socket.id);
          if (matchConnections.get(matchId).size === 0) {
            matchConnections.delete(matchId);
          }
        }
        
        const userInfo = socketToUser.get(socket.id);
        socketToUser.delete(socket.id);

        if (userInfo?.role === 'spectator') {
          await removeSpectator(matchId, socket.userId);
        }

        socket.to(`match:${matchId}`).emit('player_disconnected', {
          userId: socket.userId,
          username: socket.username
        });
      } catch (error) {
        console.error('leave_match_room error:', error);
      }
    });

    // ===== GAME EVENTS =====

    socket.on('roll_dice', async ({ matchId }) => {
      try {
        const gameState = await getGameState(matchId);
        if (!gameState) {
          return socket.emit('error', { message: 'Game state not found' });
        }

        const result = processDiceRoll(gameState, socket.userId);
        
        if (!result.success) {
          return socket.emit('error', { message: result.error });
        }

        await saveGameState(matchId, result.gameState);

        // Broadcast dice roll to all in room
        io.to(`match:${matchId}`).emit('dice_rolled', {
          userId: socket.userId,
          username: socket.username,
          diceValue: result.diceValue,
          validMoves: result.validMoves,
          autoAdvanced: result.autoAdvanced,
          gameState: getPublicGameState(result.gameState)
        });

        // Save move to DB
        await saveMove(matchId, socket.userId, {
          turnNumber: gameState.turnNumber,
          type: 'dice_roll',
          diceValue: result.diceValue
        }).catch(console.error);

      } catch (error) {
        console.error('roll_dice error:', error);
        socket.emit('error', { message: 'Failed to roll dice' });
      }
    });

    socket.on('move_token', async ({ matchId, tokenId, targetPosition }) => {
      try {
        const gameState = await getGameState(matchId);
        if (!gameState) {
          return socket.emit('error', { message: 'Game state not found' });
        }

        const result = processMove(gameState, socket.userId, tokenId, targetPosition);
        
        if (!result.success) {
          return socket.emit('error', { message: result.error });
        }

        await saveGameState(matchId, result.gameState);

        // Save move to DB
        const lastAction = result.gameState.lastAction;
        await saveMove(matchId, socket.userId, {
          turnNumber: gameState.turnNumber,
          type: lastAction?.moveType || 'move',
          diceValue: gameState.diceValue,
          tokenId,
          from: lastAction?.from,
          to: targetPosition,
          captured: result.captured
        }).catch(console.error);

        // Broadcast move to all in room
        io.to(`match:${matchId}`).emit('token_moved', {
          userId: socket.userId,
          username: socket.username,
          tokenId,
          targetPosition,
          captured: result.captured,
          gameState: getPublicGameState(result.gameState)
        });

        // Handle capture notification
        if (result.captured) {
          io.to(`match:${matchId}`).emit('token_captured', {
            capturedBy: socket.userId,
            capturedColor: result.captured.color,
            capturedTokenId: result.captured.tokenId
          });
        }

        // Handle game over
        if (result.gameOver) {
          await completeMatch(matchId, result.winners);
          
          io.to(`match:${matchId}`).emit('game_over', {
            winners: result.winners,
            gameState: getPublicGameState(result.gameState)
          });

          // Add system message
          await addSystemMessage(matchId, 
            `🏆 Game Over! Winner: ${result.winners[0]?.color}`,
            io
          );
        }

      } catch (error) {
        console.error('move_token error:', error);
        socket.emit('error', { message: 'Failed to process move' });
      }
    });

    // ===== CHAT EVENTS =====

    socket.on('send_message', async ({ matchId, message, messageType = 'text' }) => {
      try {
        if (!message || message.trim().length === 0) {
          return socket.emit('error', { message: 'Message cannot be empty' });
        }

        if (message.length > 500) {
          return socket.emit('error', { message: 'Message too long (max 500 chars)' });
        }

        const comment = await addComment({
          match_id: matchId,
          user_id: socket.userId,
          username: socket.username,
          message: message.trim(),
          message_type: messageType
        });

        io.to(`match:${matchId}`).emit('new_message', {
          id: comment.id || comment._id,
          userId: socket.userId,
          username: socket.username,
          message: comment.message,
          messageType: comment.message_type,
          createdAt: comment.created_at
        });

      } catch (error) {
        console.error('send_message error:', error);
        socket.emit('error', { message: 'Failed to send message' });
      }
    });

    socket.on('add_reaction', async ({ commentId, emoji }) => {
      try {
        const validEmojis = ['👍', '👎', '😂', '🎉', '😮', '😢', '🔥', '💯'];
        if (!validEmojis.includes(emoji)) {
          return socket.emit('error', { message: 'Invalid emoji' });
        }

        const comment = await addReaction(commentId, socket.userId, emoji);
        if (comment) {
          io.to(`match:${comment.match_id}`).emit('reaction_added', {
            commentId,
            userId: socket.userId,
            emoji
          });
        }
      } catch (error) {
        console.error('add_reaction error:', error);
        socket.emit('error', { message: 'Failed to add reaction' });
      }
    });

    // ===== LOBBY EVENTS =====

    socket.on('join_lobby', () => {
      socket.join('lobby');
    });

    socket.on('leave_lobby', () => {
      socket.leave('lobby');
    });

    // ===== PLAYER READY =====

    socket.on('player_ready', async ({ matchId, isReady }) => {
      try {
        const match = await findMatchById(matchId);
        if (match) {
          const players = (match.players || []).map(p => {
            if (p.userId === socket.userId) {
              return { ...p, isReady: !!isReady };
            }
            return p;
          });
          await updateMatchDoc(matchId, { players });
        }

        io.to(`match:${matchId}`).emit('player_ready_changed', {
          userId: socket.userId,
          username: socket.username,
          isReady
        });
      } catch (error) {
        console.error('player_ready error:', error);
        socket.emit('error', { message: 'Failed to update ready status' });
      }
    });

    // ===== DISCONNECT =====

    socket.on('disconnect', async (reason) => {
      console.log(`Socket disconnected: ${socket.id} (${socket.username}) - ${reason}`);
      
      const userInfo = socketToUser.get(socket.id);
      if (userInfo) {
        const { matchId, role } = userInfo;
        
        // Clean up tracking
        if (matchConnections.has(matchId)) {
          matchConnections.get(matchId).delete(socket.id);
        }
        socketToUser.delete(socket.id);

        // Notify room
        io.to(`match:${matchId}`).emit('player_disconnected', {
          userId: socket.userId,
          username: socket.username,
          reason
        });

        // Update spectator record
        if (role === 'spectator') {
          await removeSpectator(matchId, socket.userId).catch(console.error);
        }
      }
    });
  });

  return { matchConnections, socketToUser };
}

async function addSystemMessage(matchId, message, io) {
  try {
    const comment = await addComment({
      match_id: matchId,
      user_id: 'system',
      username: 'System',
      message,
      is_system: true,
      message_type: 'system'
    });

    if (comment && io) {
      io.to(`match:${matchId}`).emit('new_message', {
        id: comment.id || comment._id,
        userId: null,
        username: 'System',
        message,
        messageType: 'system',
        isSystem: true,
        createdAt: comment.created_at
      });
    }
  } catch (error) {
    console.error('addSystemMessage error:', error);
  }
}

module.exports = { initializeSocketHandlers, addSystemMessage };
