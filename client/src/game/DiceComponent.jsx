import React, { useState } from 'react';

const DICE_DOTS = {
  1: [[50, 50]],
  2: [[25, 25], [75, 75]],
  3: [[25, 25], [50, 50], [75, 75]],
  4: [[25, 25], [75, 25], [25, 75], [75, 75]],
  5: [[25, 25], [75, 25], [50, 50], [25, 75], [75, 75]],
  6: [[25, 20], [75, 20], [25, 50], [75, 50], [25, 80], [75, 80]]
};

function DiceComponent({ value, canRoll, onRoll, isRolling }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '0.75rem' }}>
      {/* Dice face */}
      <div
        onClick={canRoll && !isRolling ? onRoll : undefined}
        className={isRolling ? 'dice-rolling' : ''}
        style={{
          width: '70px',
          height: '70px',
          background: canRoll && !isRolling
            ? 'linear-gradient(135deg, #fff 0%, #e0e0e0 100%)'
            : 'linear-gradient(135deg, #2a2a4a 0%, #1a1a2e 100%)',
          borderRadius: '14px',
          border: canRoll && !isRolling
            ? '3px solid #ffd700'
            : '3px solid rgba(255,255,255,0.1)',
          cursor: canRoll && !isRolling ? 'pointer' : 'default',
          position: 'relative',
          boxShadow: canRoll && !isRolling
            ? '0 0 20px rgba(255, 215, 0, 0.5), 0 4px 15px rgba(0,0,0,0.3)'
            : '0 4px 15px rgba(0,0,0,0.3)',
          transition: 'all 0.2s ease',
          userSelect: 'none'
        }}
      >
        {value ? (
          DICE_DOTS[value]?.map(([x, y], i) => (
            <div
              key={i}
              style={{
                position: 'absolute',
                width: '12px',
                height: '12px',
                borderRadius: '50%',
                background: canRoll && !isRolling ? '#1a1a2e' : '#e0e0e0',
                left: `${x}%`,
                top: `${y}%`,
                transform: 'translate(-50%, -50%)'
              }}
            />
          ))
        ) : (
          <div style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '1.5rem'
          }}>
            🎲
          </div>
        )}
      </div>

      {/* Roll button or status */}
      {canRoll && !isRolling && (
        <button
          onClick={onRoll}
          className="btn btn-gold"
          style={{ padding: '0.5rem 1.5rem', fontSize: '0.9rem' }}
        >
          🎲 Roll Dice
        </button>
      )}
      {isRolling && (
        <span style={{ color: '#ffd700', fontSize: '0.85rem', fontWeight: '600' }}>
          Rolling...
        </span>
      )}
      {!canRoll && !isRolling && (
        <span style={{ color: 'var(--color-muted)', fontSize: '0.8rem' }}>
          Waiting for turn...
        </span>
      )}
    </div>
  );
}

export default DiceComponent;

