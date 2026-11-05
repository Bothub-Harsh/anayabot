/**
 * @typedef {'red' | 'blue' | 'green' | 'yellow'} PlayerColor
 * @typedef {'home' | 'active' | 'safe' | 'finished'} TokenStatus
 * @typedef {'waiting' | 'playing' | 'completed' | 'cancelled'} MatchStatus
 * 
 * @typedef {Object} Token
 * @property {number} id
 * @property {PlayerColor} color
 * @property {TokenStatus} status
 * @property {number|null} position
 * @property {number|null} boardPosition
 * 
 * @typedef {Object} GamePlayer
 * @property {string} userId
 * @property {string} username
 * @property {PlayerColor} color
 * @property {number} position
 * 
 * @typedef {Object} GameState
 * @property {string} phase
 * @property {GamePlayer[]} players
 * @property {number} currentPlayerIndex
 * @property {number} turnNumber
 * @property {Object.<string, any>} boardState
 * @property {number|null} diceValue
 * @property {boolean} diceRolled
 * @property {number} consecutiveSixes
 * @property {Array} winners
 */

module.exports = {};

