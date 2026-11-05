const { v4: uuidv4 } = require('uuid');
const {
  findUserById,
  findMatchById,
  findMatchByRoomCode,
  createMatchDoc,
  updateMatchDoc,
  findPublicMatches,
  findWaitingMatchByGroup,
  findActiveMatchesByGroup,
  findGameState,
  saveGameStateDoc,
  createGameMove,
  updateUserStats
} = require('../database/db');
const { initializeGameState } = require('../game/ludoEngine');

// In-memory game states for high speed real-time gameplay
const activeGameStates = new Map();
const matchCompletedHooks = [];
const matchStartedHooks = [];

function onMatchCompleted(callback) {
  if (typeof callback === 'function') {
    matchCompletedHooks.push(callback);
  }
}

function onMatchStarted(callback) {
  if (typeof callback === 'function') {
    matchStartedHooks.push(callback);
  }
}

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  return code;
}

async function roomCodeExists(roomCode) {
  const match = await findMatchByRoomCode(roomCode);
  return !!match;
}

async function createMatch(userId, options = {}) {
  const { 
    name, 
    maxPlayers = 4, 
    visibility = 'public', 
    settings = {}, 
    telegramGroupId = null, 
    telegramMessageId = null 
  } = options;
  
  let roomCode;
  let attempts = 0;
  do {
    roomCode = generateRoomCode();
    attempts++;
    if (attempts > 10) throw new Error('Failed to generate unique room code');
  } while (await roomCodeExists(roomCode));

  const creator = await findUserById(userId);

  const colors = ['red', 'blue', 'green', 'yellow'];
  const initialPlayers = [{
    userId,
    username: creator?.username || creator?.first_name || 'Host',
    first_name: creator?.first_name || 'Host',
    color: colors[0],
    position: 0,
    status: 'waiting',
    isReady: true,
    joined_at: new Date()
  }];

  const match = await createMatchDoc({
    room_code: roomCode,
    name: name || `Match ${roomCode}`,
    max_players: maxPlayers,
    current_players: 1,
    visibility,
    creator_id: userId,
    creator_username: creator?.username || null,
    creator_name: creator?.first_name || null,
    settings: typeof settings === 'string' ? JSON.parse(settings || '{}') : settings,
    telegram_group_id: telegramGroupId ? String(telegramGroupId) : null,
    telegram_message_id: telegramMessageId ? String(telegramMessageId) : null,
    status: 'waiting',
    players: initialPlayers
  });

  return match;
}

async function joinMatch(matchId, userId) {
  const match = await findMatchById(matchId);
  if (!match) {
    throw new Error('Match not found');
  }

  if (match.status !== 'waiting') {
    throw new Error('Match is not accepting players');
  }

  const activePlayers = (match.players || []).filter(p => p.status !== 'left');

  if (activePlayers.length >= match.max_players) {
    throw new Error('Match is full');
  }

  const existingPlayer = activePlayers.find(p => p.userId === userId);
  if (existingPlayer) {
    throw new Error('Already in this match');
  }

  const takenColors = new Set(activePlayers.map(r => r.color));
  const takenPositions = new Set(activePlayers.map(r => r.position));
  const colors = ['red', 'blue', 'green', 'yellow'];
  
  const availableColor = colors.find(c => !takenColors.has(c));
  const availablePosition = [0, 1, 2, 3].find(p => !takenPositions.has(p));

  if (!availableColor) throw new Error('No available colors');

  const joiningUser = await findUserById(userId);
  const newPlayer = {
    userId,
    username: joiningUser?.username || joiningUser?.first_name || 'Player',
    first_name: joiningUser?.first_name || 'Player',
    color: availableColor,
    position: availablePosition,
    status: 'waiting',
    isReady: true,
    joined_at: new Date()
  };

  const updatedPlayers = [...(match.players || []).filter(p => p.userId !== userId), newPlayer];
  const newPlayerCount = updatedPlayers.filter(p => p.status !== 'left').length;

  const updatedMatch = await updateMatchDoc(matchId, {
    players: updatedPlayers,
    current_players: newPlayerCount
  });

  return {
    match: updatedMatch,
    playerColor: availableColor,
    playerPosition: availablePosition
  };
}

async function startMatch(matchId, userId) {
  const match = await findMatchById(matchId);
  if (!match) throw new Error('Match not found');

  if (match.creator_id !== userId) throw new Error('Only the creator can start the match');
  if (match.status !== 'waiting') throw new Error('Match cannot be started');
  
  const activePlayers = (match.players || []).filter(p => p.status !== 'left');
  if (activePlayers.length < 2) throw new Error('Need at least 2 players to start');

  const players = activePlayers
    .sort((a, b) => a.position - b.position)
    .map(p => ({
      userId: p.userId,
      username: p.username || p.first_name || 'Player',
      color: p.color,
      position: p.position
    }));

  // Initialize game state
  const gameState = initializeGameState(players);
  
  // Save game state in MongoDB
  await saveGameStateDoc(matchId, gameState);

  const updatedMatch = await updateMatchDoc(matchId, {
    status: 'playing',
    started_at: new Date()
  });

  // Store in memory
  activeGameStates.set(matchId, gameState);

  // Trigger match start hooks (e.g. for Telegram group announcement)
  for (const hook of matchStartedHooks) {
    try {
      hook(updatedMatch, players);
    } catch (hookErr) {
      console.warn('Match start hook error:', hookErr.message);
    }
  }

  return { match: updatedMatch, gameState };
}

async function getGameState(matchId) {
  // Check in-memory first
  if (activeGameStates.has(matchId)) {
    return activeGameStates.get(matchId);
  }

  // Load from database
  const gameState = await findGameState(matchId);
  if (!gameState) return null;

  activeGameStates.set(matchId, gameState);
  return gameState;
}

async function saveGameState(matchId, gameState) {
  activeGameStates.set(matchId, gameState);
  
  // Persist to MongoDB asynchronously
  saveGameStateDoc(matchId, gameState).catch(err => {
    console.error('Failed to save game state to MongoDB:', err.message);
  });
}

async function getPublicMatches() {
  return await findPublicMatches();
}

async function getMatchById(matchId) {
  if (!matchId) return null;
  let match = await findMatchById(matchId);
  if (!match && typeof matchId === 'string' && matchId.trim().length <= 10) {
    match = await findMatchByRoomCode(matchId.trim().toUpperCase());
  }
  return match;
}

async function getMatchByRoomCode(roomCode) {
  if (!roomCode) return null;
  let match = await findMatchByRoomCode(roomCode);
  if (!match && typeof roomCode === 'string') {
    match = await findMatchById(roomCode.trim());
  }
  return match;
}

async function saveMove(matchId, userId, moveData) {
  await createGameMove({
    match_id: matchId,
    user_id: userId,
    turn_number: moveData.turnNumber,
    move_type: moveData.type,
    dice_value: moveData.diceValue,
    token_id: moveData.tokenId,
    from_position: moveData.from,
    to_position: moveData.to,
    captured_token: moveData.captured || null,
    move_data: moveData
  });
}

async function completeMatch(matchId, winners) {
  const winnerId = winners[0]?.userId || null;
  
  const updatedMatch = await updateMatchDoc(matchId, {
    status: 'completed',
    winner_id: winnerId,
    completed_at: new Date()
  });

  // Update player profiles in MongoDB
  for (let i = 0; i < winners.length; i++) {
    const winner = winners[i];
    const isWin = i === 0;
    
    await updateUserStats(winner.userId, {
      winsDelta: isWin ? 1 : 0,
      lossesDelta: isWin ? 0 : 1,
      xpDelta: isWin ? 100 : 25
    });
  }

  activeGameStates.delete(matchId);

  // Trigger match completion hooks (e.g. for Telegram group announcement)
  if (updatedMatch) {
    for (const hook of matchCompletedHooks) {
      try {
        hook(updatedMatch, winners);
      } catch (hookErr) {
        console.warn('Match completion hook error:', hookErr.message);
      }
    }
  }
}

async function leaveMatch(matchId, userId) {
  const match = await findMatchById(matchId);
  if (!match) return;

  const players = (match.players || []).map(p => {
    if (p.userId === userId) {
      return { ...p, status: 'left', left_at: new Date() };
    }
    return p;
  });

  const remainingActive = players.filter(p => p.status !== 'left');
  const updateData = {
    players,
    current_players: Math.max(0, remainingActive.length)
  };

  if (remainingActive.length < 2 && match.status === 'waiting') {
    updateData.status = 'cancelled';
    updateData.cancelled_at = new Date();
  }

  await updateMatchDoc(matchId, updateData);
}

async function updateMatchTelegramMessage(matchId, messageId) {
  return await updateMatchDoc(matchId, {
    telegram_message_id: messageId ? String(messageId) : null
  });
}

async function getWaitingMatchByGroup(telegramGroupId) {
  return await findWaitingMatchByGroup(telegramGroupId);
}

async function getActiveGroupMatches(telegramGroupId) {
  return await findActiveMatchesByGroup(telegramGroupId);
}

async function cancelMatch(matchId, userId, isAdmin = false) {
  const match = await findMatchById(matchId);
  if (!match) throw new Error('Match not found');

  if (!isAdmin && match.creator_id !== userId) {
    throw new Error('Only the host or an administrator can cancel this match');
  }

  if (match.status === 'completed' || match.status === 'cancelled') {
    throw new Error(`Match is already ${match.status}`);
  }

  const updatedMatch = await updateMatchDoc(matchId, {
    status: 'cancelled',
    cancelled_at: new Date()
  });

  activeGameStates.delete(matchId);
  return updatedMatch;
}

module.exports = {
  createMatch,
  joinMatch,
  startMatch,
  cancelMatch,
  getGameState,
  saveGameState,
  getPublicMatches,
  getMatchById,
  getMatchByRoomCode,
  saveMove,
  completeMatch,
  leaveMatch,
  updateMatchTelegramMessage,
  getWaitingMatchByGroup,
  getActiveGroupMatches,
  onMatchCompleted,
  onMatchStarted,
  activeGameStates
};
