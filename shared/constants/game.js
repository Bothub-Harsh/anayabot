module.exports = {
  COLORS: ['red', 'blue', 'green', 'yellow'],
  COLOR_LABELS: {
    red: 'Red',
    blue: 'Blue',
    green: 'Green',
    yellow: 'Yellow'
  },
  TOKEN_STATUS: {
    HOME: 'home',
    ACTIVE: 'active',
    SAFE: 'safe',
    FINISHED: 'finished'
  },
  MATCH_STATUS: {
    WAITING: 'waiting',
    PLAYING: 'playing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
  },
  BOARD: {
    TOTAL_CELLS: 52,
    HOME_STRETCH: 6,
    TOKENS_PER_PLAYER: 4,
    SAFE_CELLS: [0, 8, 13, 21, 26, 34, 39, 47],
    START_POSITIONS: { red: 0, blue: 13, green: 26, yellow: 39 },
    HOME_ENTRY: { red: 51, blue: 12, green: 25, yellow: 38 },
    HOME_COLUMN_START: { red: 100, blue: 200, green: 300, yellow: 400 }
  },
  SOCKET_EVENTS: {
    JOIN_MATCH_ROOM: 'join_match_room',
    LEAVE_MATCH_ROOM: 'leave_match_room',
    MATCH_JOINED: 'match_joined',
    ROLL_DICE: 'roll_dice',
    DICE_ROLLED: 'dice_rolled',
    MOVE_TOKEN: 'move_token',
    TOKEN_MOVED: 'token_moved',
    TOKEN_CAPTURED: 'token_captured',
    TURN_CHANGED: 'turn_changed',
    MATCH_STARTED: 'match_started',
    MATCH_COMPLETED: 'match_completed',
    SPECTATOR_JOINED: 'spectator_joined',
    SPECTATOR_LEFT: 'spectator_left',
    SPECTATOR_COUNT_UPDATED: 'spectator_count_updated',
    SEND_COMMENT: 'send_comment',
    NEW_COMMENT: 'new_comment',
    ADD_REACTION: 'add_reaction',
    NEW_REACTION: 'new_reaction',
    PLAYER_READY: 'player_ready',
    PLAYER_STATUS_CHANGED: 'player_status_changed',
    ERROR: 'error',
    MOVE_ERROR: 'move_error'
  }
};

