import React from 'react';
import { PLAYER_COLOR_STYLES, TOKEN_STATUS } from '../constants/game';

// Board layout: 15x15 grid
// Each cell is represented by its path index

const BOARD_SIZE = 15;

// Map board path positions (0-51) to [row, col] on 15x15 grid
// Standard Ludo board layout
const PATH_TO_GRID = {
  // Bottom row (red start area - going right to left on row 14)
  0: [6, 1], 1: [6, 2], 2: [6, 3], 3: [6, 4], 4: [6, 5],
  5: [5, 5], 6: [4, 5], 7: [3, 5], 8: [2, 5], // Going up
  9: [1, 5], 10: [0, 5], // Top area
  // Top row
  11: [0, 6], 12: [0, 7], // Crossing top
  13: [0, 8], 14: [0, 9], // Blue start
  15: [1, 9], 16: [2, 9], 17: [3, 9], 18: [4, 9], 19: [5, 9],
  20: [6, 9], 21: [6, 10], 22: [6, 11], 23: [6, 12], 24: [6, 13], 25: [6, 14],
  26: [7, 14], 27: [8, 14], // Right side
  28: [8, 13], 29: [8, 12], 30: [8, 11], 31: [8, 10], 32: [8, 9],
  33: [9, 9], 34: [10, 9], 35: [11, 9], 36: [12, 9], 37: [13, 9], 38: [14, 9],
  39: [14, 8], 40: [14, 7], // Bottom
  41: [14, 6], 42: [14, 5], // Yellow start
  43: [13, 5], 44: [12, 5], 45: [11, 5], 46: [10, 5], 47: [9, 5],
  48: [8, 5], 49: [8, 4], 50: [8, 3], 51: [8, 2],
};

// Home column paths
const HOME_COLS = {
  red:    [[7, 1], [7, 2], [7, 3], [7, 4], [7, 5], [7, 6]],
  blue:   [[1, 7], [2, 7], [3, 7], [4, 7], [5, 7], [6, 7]],
  green:  [[7, 13], [7, 12], [7, 11], [7, 10], [7, 9], [7, 8]],
  yellow: [[13, 7], [12, 7], [11, 7], [10, 7], [9, 7], [8, 7]],
};

// Home base positions (the colored squares at corners)
const HOME_BASES = {
  red:    { rows: [0, 5], cols: [0, 5], color: 'red' },
  blue:   { rows: [0, 5], cols: [9, 14], color: 'blue' },
  green:  { rows: [9, 14], cols: [9, 14], color: 'green' },
  yellow: { rows: [9, 14], cols: [0, 5], color: 'yellow' },
};

const SAFE_CELLS = new Set([0, 8, 13, 21, 26, 34, 39, 47]);

function LudoBoard({ gameState, currentUserId, onTokenClick, validMoves = [], myColor }) {
  if (!gameState) return null;

  const { boardState } = gameState;
  
  // Build a grid with token placements
  const grid = Array.from({ length: BOARD_SIZE }, () => 
    Array.from({ length: BOARD_SIZE }, () => ({ tokens: [], type: 'empty', safe: false }))
  );

  // Mark path cells
  Object.entries(PATH_TO_GRID).forEach(([pos, [row, col]]) => {
    if (grid[row] && grid[row][col]) {
      grid[row][col].type = 'path';
      grid[row][col].pathIndex = parseInt(pos);
      grid[row][col].safe = SAFE_CELLS.has(parseInt(pos));
    }
  });

  // Mark home columns
  Object.entries(HOME_COLS).forEach(([color, cells]) => {
    cells.forEach(([row, col], step) => {
      if (grid[row] && grid[row][col]) {
        grid[row][col].type = 'home_col';
        grid[row][col].color = color;
        grid[row][col].homeStep = step;
      }
    });
  });

  // Place tokens on board
  if (boardState) {
    Object.entries(boardState).forEach(([color, player]) => {
      player.tokens?.forEach(token => {
        if (token.status === TOKEN_STATUS.ACTIVE && token.boardPosition !== null) {
          const cell = PATH_TO_GRID[token.boardPosition];
          if (cell && grid[cell[0]] && grid[cell[0]][cell[1]]) {
            grid[cell[0]][cell[1]].tokens.push({ ...token, color });
          }
        } else if (token.status === TOKEN_STATUS.SAFE && token.boardPosition !== null) {
          const basePos = { red: 100, blue: 200, green: 300, yellow: 400 }[color];
          const step = token.boardPosition - basePos;
          const homeCell = HOME_COLS[color]?.[step - 1];
          if (homeCell && grid[homeCell[0]] && grid[homeCell[0]][homeCell[1]]) {
            grid[homeCell[0]][homeCell[1]].tokens.push({ ...token, color });
          }
        }
      });
    });
  }

  const validTokenIds = new Set(validMoves.map(m => `${m.tokenId}`));

  const getTokensInBase = (color) => {
    const player = boardState?.[color];
    return player?.tokens?.filter(t => t.status === TOKEN_STATUS.HOME) || [];
  };

  const cellSize = 'calc((min(100vw - 2rem, 460px)) / 15)';

  return (
    <div className="ludo-board-wrapper" style={{
      width: '100%',
      maxWidth: '460px',
      margin: '0 auto',
      position: 'relative'
    }}>
      <div
        className="ludo-board"
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${BOARD_SIZE}, 1fr)`,
          gridTemplateRows: `repeat(${BOARD_SIZE}, 1fr)`,
          width: '100%',
          aspectRatio: '1',
          background: '#1a1a2e',
          border: '2px solid rgba(255,255,255,0.1)',
          borderRadius: '0.5rem',
          overflow: 'hidden',
          gap: '1px'
        }}
      >
        {Array.from({ length: BOARD_SIZE }).map((_, row) =>
          Array.from({ length: BOARD_SIZE }).map((_, col) => {
            const cell = grid[row][col];
            return (
              <GridCell
                key={`${row}-${col}`}
                row={row}
                col={col}
                cell={cell}
                validTokenIds={validTokenIds}
                onTokenClick={onTokenClick}
                myColor={myColor}
                currentUserId={currentUserId}
                validMoves={validMoves}
                boardState={boardState}
                getTokensInBase={getTokensInBase}
              />
            );
          })
        )}
      </div>
      
      {/* Home bases overlay */}
      <div style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}>
        {Object.entries(HOME_BASES).map(([color, base]) => (
          <HomeBase
            key={color}
            color={color}
            base={base}
            tokens={getTokensInBase(color)}
            myColor={myColor}
            validMoves={validMoves}
            onTokenClick={onTokenClick}
            validTokenIds={validTokenIds}
          />
        ))}
        {/* Center */}
        <div style={{
          position: 'absolute',
          top: '33.33%',
          left: '33.33%',
          width: '33.34%',
          height: '33.34%',
          background: '#16213e',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '2rem'
        }}>
          🎲
        </div>
      </div>
    </div>
  );
}

function GridCell({ row, col, cell, validTokenIds, onTokenClick, myColor, validMoves }) {
  const isCenter = row >= 6 && row <= 8 && col >= 6 && col <= 8;
  if (isCenter) return <div style={{ background: '#0f0f1a' }} />;
  
  // Home base areas
  if ((row <= 5 && col <= 5) || (row <= 5 && col >= 9) ||
      (row >= 9 && col >= 9) || (row >= 9 && col <= 5)) {
    // These are covered by home base overlay
    return <div style={{ background: 'transparent' }} />;
  }

  let bg = '#1e2040';
  let border = 'rgba(255,255,255,0.05)';
  
  if (cell.type === 'path') {
    bg = cell.safe ? 'rgba(255,255,255,0.08)' : '#1e2040';
    if (cell.safe) border = 'rgba(255,215,0,0.3)';
  } else if (cell.type === 'home_col') {
    const colors = {
      red: 'rgba(229,62,62,0.3)',
      blue: 'rgba(49,130,206,0.3)',
      green: 'rgba(56,161,105,0.3)',
      yellow: 'rgba(214,158,46,0.3)'
    };
    bg = colors[cell.color] || bg;
  }

  return (
    <div style={{
      background: bg,
      border: `1px solid ${border}`,
      position: 'relative',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden'
    }}>
      {cell.safe && (
        <span style={{ position: 'absolute', fontSize: '8px', opacity: 0.5 }}>⭐</span>
      )}
      {cell.tokens?.map((token, i) => (
        <Token
          key={`${token.color}-${token.id}`}
          token={token}
          isValid={validTokenIds.has(`${token.id}`) && token.color === myColor}
          onTokenClick={onTokenClick}
          small={cell.tokens.length > 1}
          index={i}
          total={cell.tokens.length}
        />
      ))}
    </div>
  );
}

function HomeBase({ color, base, tokens, myColor, validMoves, onTokenClick, validTokenIds }) {
  const styles = PLAYER_COLOR_STYLES[color];
  const positionStyle = {
    red: { top: 0, left: 0 },
    blue: { top: 0, right: 0 },
    green: { bottom: 0, right: 0 },
    yellow: { bottom: 0, left: 0 }
  };

  return (
    <div style={{
      position: 'absolute',
      width: '40%',
      height: '40%',
      ...positionStyle[color],
      background: `${styles.bg}22`,
      border: `2px solid ${styles.bg}44`,
      display: 'grid',
      gridTemplateColumns: '1fr 1fr',
      gridTemplateRows: '1fr 1fr',
      gap: '8px',
      padding: '10px',
      pointerEvents: 'auto'
    }}>
      {Array.from({ length: 4 }).map((_, i) => {
        const token = tokens[i];
        const isValid = token && validTokenIds.has(`${token.id}`) && color === myColor;
        return (
          <div key={i} style={{
            background: `${styles.bg}33`,
            border: `1px solid ${styles.bg}66`,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center'
          }}>
            {token && (
              <Token
                token={{ ...token, color }}
                isValid={isValid}
                onTokenClick={onTokenClick}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Token({ token, isValid, onTokenClick, small = false, index = 0, total = 1 }) {
  const styles = PLAYER_COLOR_STYLES[token.color];
  const size = small ? '60%' : '80%';

  return (
    <div
      onClick={() => isValid && onTokenClick && onTokenClick(token)}
      style={{
        width: size,
        height: size,
        maxWidth: '24px',
        maxHeight: '24px',
        borderRadius: '50%',
        background: styles.bg,
        border: `2px solid ${isValid ? '#ffd700' : 'rgba(255,255,255,0.3)'}`,
        cursor: isValid ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: '8px',
        fontWeight: 'bold',
        color: 'white',
        boxShadow: isValid 
          ? `0 0 8px ${styles.bg}, 0 0 16px rgba(255,215,0,0.5)` 
          : `0 2px 4px rgba(0,0,0,0.4)`,
        transition: 'all 0.2s ease',
        animation: isValid ? 'pulse-glow 1.5s ease-in-out infinite' : 'none',
        position: total > 1 ? 'absolute' : 'relative',
        transform: total > 1 ? `translate(${(index % 2) * 6 - 3}px, ${Math.floor(index / 2) * 6 - 3}px)` : 'none',
        zIndex: isValid ? 10 : 1
      }}
      title={isValid ? `Move token ${token.id + 1}` : `${token.color} token ${token.id + 1}`}
    >
      {token.id + 1}
    </div>
  );
}

export default LudoBoard;

