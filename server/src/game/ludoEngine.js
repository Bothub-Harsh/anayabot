/**
 * Ludo Arena - Authoritative Game Engine
 * All game logic runs server-side. Clients are display-only.
 */

const COLORS = ['red', 'blue', 'green', 'yellow'];

// Board layout constants
const BOARD_SIZE = 52; // Total cells in the outer path
const HOME_STRETCH_SIZE = 6; // Cells in home column
const TOKENS_PER_PLAYER = 4;

// Starting positions (cell index where tokens enter the board)
const START_POSITIONS = {
  red: 0,
  blue: 13,
  green: 26,
  yellow: 39
};

// Safe cells (by board position index 0-51)
const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

// Home column entry points (last outer cell before home column)
const HOME_ENTRY = {
  red: 51,
  blue: 12,
  green: 25,
  yellow: 38
};

// Home column positions (positions 100-105 for each color)
const HOME_COLUMN_START = {
  red: 100,
  blue: 200,
  green: 300,
  yellow: 400
};

const TOKEN_STATUS = {
  HOME: 'home',       // In starting house, not on board
  ACTIVE: 'active',  // On the main board
  SAFE: 'safe',      // In home column
  FINISHED: 'finished' // Reached center
};

/**
 * Initialize a fresh game state for a match
 */
function initializeGameState(players) {
  if (!Array.isArray(players) || players.length < 2 || players.length > 4) {
    throw new Error('Invalid number of players (2-4 required)');
  }

  const colorAssignments = {};
  players.forEach((player, index) => {
    colorAssignments[player.userId] = COLORS[index];
  });

  const boardState = {};
  players.forEach((player, index) => {
    const color = COLORS[index];
    boardState[color] = {
      userId: player.userId,
      username: player.username,
      color,
      tokens: initializeTokens(color),
      finishedTokens: 0,
      isFinished: false,
      finishPosition: null
    };
  });

  return {
    phase: 'playing',
    players: players.map((p, i) => ({ ...p, color: COLORS[i] })),
    currentPlayerIndex: 0,
    turnNumber: 1,
    boardState,
    diceValue: null,
    diceRolled: false,
    consecutiveSixes: 0,
    winners: [],
    lastAction: null,
    createdAt: new Date().toISOString()
  };
}

function initializeTokens(color) {
  return Array.from({ length: TOKENS_PER_PLAYER }, (_, i) => ({
    id: i,
    color,
    status: TOKEN_STATUS.HOME,
    position: null, // null = in house
    boardPosition: null
  }));
}

/**
 * Roll dice - returns 1-6
 */
function rollDice() {
  return Math.floor(Math.random() * 6) + 1;
}

/**
 * Get the current player object
 */
function getCurrentPlayer(gameState) {
  return gameState.players[gameState.currentPlayerIndex];
}

/**
 * Check if a user is the current player
 */
function isCurrentPlayer(gameState, userId) {
  const currentPlayer = getCurrentPlayer(gameState);
  return currentPlayer && currentPlayer.userId === userId;
}

/**
 * Process a dice roll for the current player
 */
function processDiceRoll(gameState, userId) {
  if (gameState.phase !== 'playing') {
    return { success: false, error: 'Game is not in playing phase' };
  }

  if (!isCurrentPlayer(gameState, userId)) {
    return { success: false, error: 'Not your turn' };
  }

  if (gameState.diceRolled) {
    return { success: false, error: 'Dice already rolled this turn' };
  }

  const diceValue = rollDice();
  const newState = { ...gameState };
  newState.diceValue = diceValue;
  newState.diceRolled = true;

  const currentPlayer = getCurrentPlayer(newState);
  const color = currentPlayer.color;
  const validMoves = getValidMoves(newState, color, diceValue);

  // Auto-advance if no valid moves
  if (validMoves.length === 0) {
    // No valid moves - advance turn
    const advancedState = advanceTurn(newState, diceValue);
    return { 
      success: true, 
      diceValue, 
      validMoves: [], 
      autoAdvanced: true,
      gameState: advancedState 
    };
  }

  newState.lastAction = { type: 'dice_rolled', userId, diceValue };
  
  return { 
    success: true, 
    diceValue, 
    validMoves, 
    autoAdvanced: false,
    gameState: newState 
  };
}

/**
 * Get valid moves for a player given dice value
 */
function getValidMoves(gameState, color, diceValue) {
  const playerState = gameState.boardState[color];
  if (!playerState) return [];

  const validMoves = [];

  playerState.tokens.forEach(token => {
    if (token.status === TOKEN_STATUS.FINISHED) return;

    if (token.status === TOKEN_STATUS.HOME) {
      // Can only leave home with a 6
      if (diceValue === 6) {
        validMoves.push({
          tokenId: token.id,
          type: 'enter_board',
          from: null,
          to: START_POSITIONS[color]
        });
      }
      return;
    }

    if (token.status === TOKEN_STATUS.ACTIVE) {
      const newPos = calculateNewPosition(color, token.boardPosition, diceValue);
      if (newPos !== null) {
        validMoves.push({
          tokenId: token.id,
          type: newPos >= HOME_COLUMN_START[color] ? 'enter_home_column' : 'move',
          from: token.boardPosition,
          to: newPos
        });
      }
    }

    if (token.status === TOKEN_STATUS.SAFE) {
      // In home column
      const homeColPos = token.boardPosition - HOME_COLUMN_START[color];
      const newHomeColPos = homeColPos + diceValue;
      
      if (newHomeColPos === HOME_STRETCH_SIZE) {
        // Exact finish
        validMoves.push({
          tokenId: token.id,
          type: 'finish',
          from: token.boardPosition,
          to: 'center'
        });
      } else if (newHomeColPos < HOME_STRETCH_SIZE) {
        validMoves.push({
          tokenId: token.id,
          type: 'home_column_move',
          from: token.boardPosition,
          to: HOME_COLUMN_START[color] + newHomeColPos
        });
      }
      // If newHomeColPos > HOME_STRETCH_SIZE, cannot move (overshoot)
    }
  });

  return validMoves;
}

/**
 * Calculate new board position after moving by diceValue steps
 */
function calculateNewPosition(color, currentPos, diceValue) {
  const entryPoint = START_POSITIONS[color];
  const homeEntry = HOME_ENTRY[color];
  const homeColStart = HOME_COLUMN_START[color];

  // Calculate steps from start
  let stepsFromStart;
  if (currentPos >= entryPoint) {
    stepsFromStart = currentPos - entryPoint;
  } else {
    stepsFromStart = (BOARD_SIZE - entryPoint) + currentPos;
  }

  const newStepsFromStart = stepsFromStart + diceValue;

  // Check if entering home column (last 6 steps before center)
  const stepsToHomeEntry = ((homeEntry - entryPoint + BOARD_SIZE) % BOARD_SIZE) + 1;
  
  if (newStepsFromStart > stepsToHomeEntry + HOME_STRETCH_SIZE) {
    return null; // Overshoot
  }

  if (newStepsFromStart > stepsToHomeEntry) {
    // Entering home column
    const homeColStep = newStepsFromStart - stepsToHomeEntry;
    if (homeColStep <= HOME_STRETCH_SIZE) {
      return homeColStart + homeColStep;
    }
    return null;
  }

  // Regular board movement
  const newPos = (entryPoint + newStepsFromStart) % BOARD_SIZE;
  return newPos;
}

/**
 * Process a token move
 */
function processMove(gameState, userId, tokenId, targetPosition) {
  if (gameState.phase !== 'playing') {
    return { success: false, error: 'Game is not in playing phase' };
  }

  if (!isCurrentPlayer(gameState, userId)) {
    return { success: false, error: 'Not your turn' };
  }

  if (!gameState.diceRolled) {
    return { success: false, error: 'Must roll dice first' };
  }

  const currentPlayer = getCurrentPlayer(gameState);
  const color = currentPlayer.color;
  const validMoves = getValidMoves(gameState, color, gameState.diceValue);

  // Validate move
  const isValid = validMoves.some(m => m.tokenId === tokenId && m.to === targetPosition);
  if (!isValid) {
    return { success: false, error: 'Invalid move' };
  }

  const newState = JSON.parse(JSON.stringify(gameState)); // Deep clone
  const playerState = newState.boardState[color];
  const token = playerState.tokens.find(t => t.id === tokenId);
  const moveData = validMoves.find(m => m.tokenId === tokenId && m.to === targetPosition);

  let captured = null;
  let rolledSix = newState.diceValue === 6;
  let anotherTurn = rolledSix;

  // Execute move
  if (moveData.type === 'enter_board') {
    token.status = TOKEN_STATUS.ACTIVE;
    token.boardPosition = targetPosition;
    token.position = targetPosition;
  } else if (moveData.type === 'finish') {
    token.status = TOKEN_STATUS.FINISHED;
    token.boardPosition = null;
    token.position = null;
    playerState.finishedTokens++;
    anotherTurn = true; // Always get another turn when finishing
  } else if (moveData.type === 'home_column_move' || moveData.type === 'enter_home_column') {
    token.status = TOKEN_STATUS.SAFE;
    token.boardPosition = targetPosition;
    token.position = targetPosition;
  } else {
    // Regular move
    token.boardPosition = targetPosition;
    token.position = targetPosition;

    // Check for captures (only on non-safe cells)
    if (!SAFE_CELLS.has(targetPosition)) {
      Object.entries(newState.boardState).forEach(([otherColor, otherPlayer]) => {
        if (otherColor === color) return;
        otherPlayer.tokens.forEach(otherToken => {
          if (otherToken.status === TOKEN_STATUS.ACTIVE && 
              otherToken.boardPosition === targetPosition) {
            // Capture!
            captured = { color: otherColor, tokenId: otherToken.id };
            otherToken.status = TOKEN_STATUS.HOME;
            otherToken.boardPosition = null;
            otherToken.position = null;
            anotherTurn = true; // Get another turn for capture
          }
        });
      });
    }
  }

  // Check if this player has finished all tokens
  if (playerState.finishedTokens === TOKENS_PER_PLAYER && !playerState.isFinished) {
    playerState.isFinished = true;
    playerState.finishPosition = newState.winners.length + 1;
    newState.winners.push({ userId, color, position: playerState.finishPosition });
    anotherTurn = false; // Turn passes after finishing
  }

  newState.lastAction = {
    type: 'token_moved',
    userId,
    color,
    tokenId,
    from: moveData.from,
    to: targetPosition,
    moveType: moveData.type,
    captured,
    diceValue: newState.diceValue
  };

  // Check if game is over (all but one player finished)
  const activePlayers = newState.players.filter(
    p => !newState.boardState[p.color].isFinished
  );

  if (activePlayers.length <= 1) {
    newState.phase = 'completed';
    if (activePlayers.length === 1) {
      const lastPlayer = activePlayers[0];
      newState.boardState[lastPlayer.color].isFinished = true;
      newState.boardState[lastPlayer.color].finishPosition = newState.winners.length + 1;
      newState.winners.push({ 
        userId: lastPlayer.userId, 
        color: lastPlayer.color, 
        position: newState.winners.length + 1 
      });
    }
    return {
      success: true,
      gameState: newState,
      captured,
      gameOver: true,
      winners: newState.winners
    };
  }

  // Advance turn
  if (!anotherTurn || newState.consecutiveSixes >= 3) {
    newState.consecutiveSixes = 0;
    const finalState = advanceTurn(newState, newState.diceValue);
    return { success: true, gameState: finalState, captured, gameOver: false };
  } else {
    if (rolledSix) {
      newState.consecutiveSixes++;
    }
    newState.diceRolled = false;
    newState.diceValue = null;
    return { success: true, gameState: newState, captured, gameOver: false };
  }
}

/**
 * Advance to the next player's turn
 */
function advanceTurn(gameState, lastDiceValue) {
  const newState = { ...gameState };
  newState.diceRolled = false;
  newState.diceValue = null;
  newState.consecutiveSixes = 0;

  // Skip finished players
  let nextIndex = (newState.currentPlayerIndex + 1) % newState.players.length;
  let attempts = 0;
  while (
    newState.boardState[newState.players[nextIndex].color].isFinished &&
    attempts < newState.players.length
  ) {
    nextIndex = (nextIndex + 1) % newState.players.length;
    attempts++;
  }

  newState.currentPlayerIndex = nextIndex;
  newState.turnNumber++;

  return newState;
}

/**
 * Get a summary of the game state safe to send to clients
 */
function getPublicGameState(gameState) {
  return {
    phase: gameState.phase,
    currentPlayerIndex: gameState.currentPlayerIndex,
    currentPlayerId: getCurrentPlayer(gameState)?.userId,
    turnNumber: gameState.turnNumber,
    diceValue: gameState.diceValue,
    diceRolled: gameState.diceRolled,
    boardState: gameState.boardState,
    winners: gameState.winners,
    lastAction: gameState.lastAction
  };
}

module.exports = {
  initializeGameState,
  processDiceRoll,
  processMove,
  getValidMoves,
  getPublicGameState,
  getCurrentPlayer,
  isCurrentPlayer,
  COLORS,
  TOKEN_STATUS,
  SAFE_CELLS,
  START_POSITIONS,
  HOME_COLUMN_START
};
