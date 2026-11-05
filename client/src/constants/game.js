// Shared Ludo game constants - used by both client and server logic
export const COLORS = ['red', 'blue', 'green', 'yellow'];

export const COLOR_LABELS = {
  red: 'Red',
  blue: 'Blue',
  green: 'Green',
  yellow: 'Yellow'
};

export const COLOR_EMOJI = {
  red: '🔴',
  blue: '🔵',
  green: '🟢',
  yellow: '🟡'
};

export const PLAYER_COLOR_STYLES = {
  red: { bg: '#e53e3e', text: '#fff', light: 'rgba(229,62,62,0.15)', border: '#e53e3e' },
  blue: { bg: '#3182ce', text: '#fff', light: 'rgba(49,130,206,0.15)', border: '#3182ce' },
  green: { bg: '#38a169', text: '#fff', light: 'rgba(56,161,105,0.15)', border: '#38a169' },
  yellow: { bg: '#d69e2e', text: '#fff', light: 'rgba(214,158,46,0.15)', border: '#d69e2e' }
};

export const TOKEN_STATUS = {
  HOME: 'home',
  ACTIVE: 'active',
  SAFE: 'safe',
  FINISHED: 'finished'
};

export const MATCH_STATUS = {
  WAITING: 'waiting',
  PLAYING: 'playing',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled'
};

export const SOCKET_EVENTS = {
  // Match room
  JOIN_MATCH_ROOM: 'join_match_room',
  LEAVE_MATCH_ROOM: 'leave_match_room',
  MATCH_JOINED: 'match_joined',
  
  // Game events
  ROLL_DICE: 'roll_dice',
  DICE_ROLLED: 'dice_rolled',
  MOVE_TOKEN: 'move_token',
  TOKEN_MOVED: 'token_moved',
  TOKEN_CAPTURED: 'token_captured',
  TURN_CHANGED: 'turn_changed',
  MATCH_STARTED: 'match_started',
  MATCH_COMPLETED: 'match_completed',
  
  // Spectators
  SPECTATOR_JOINED: 'spectator_joined',
  SPECTATOR_LEFT: 'spectator_left',
  SPECTATOR_COUNT_UPDATED: 'spectator_count_updated',
  
  // Chat
  SEND_COMMENT: 'send_comment',
  NEW_COMMENT: 'new_comment',
  ADD_REACTION: 'add_reaction',
  NEW_REACTION: 'new_reaction',
  
  // Lobby
  PLAYER_READY: 'player_ready',
  PLAYER_STATUS_CHANGED: 'player_status_changed',
  
  // Errors
  ERROR: 'error',
  MOVE_ERROR: 'move_error'
};

export const BOARD_POSITIONS = {
  // Safe star cells on the main path
  SAFE_CELLS: [0, 8, 13, 21, 26, 34, 39, 47]
};

export const LEVEL_THRESHOLDS = [
  0, 100, 300, 600, 1000, 1500, 2100, 2800, 3600, 4500, 5500
];

export function getLevelFromXP(xp) {
  for (let i = LEVEL_THRESHOLDS.length - 1; i >= 0; i--) {
    if (xp >= LEVEL_THRESHOLDS[i]) return i + 1;
  }
  return 1;
}

export function getXPProgressToNextLevel(xp, level) {
  const current = LEVEL_THRESHOLDS[level - 1] || 0;
  const next = LEVEL_THRESHOLDS[level] || current + 1000;
  return Math.min(100, ((xp - current) / (next - current)) * 100);
}

