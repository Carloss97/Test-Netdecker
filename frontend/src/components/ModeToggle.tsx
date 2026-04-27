import React from 'react';

interface ModeToggleProps {
  checked: boolean;
  onToggle: () => void;
  disabled?: boolean;
  onLabel?: string;
  offLabel?: string;
}

export default function ModeToggle({ 
  checked, 
  onToggle, 
  disabled = false, 
  onLabel = 'ON', 
  offLabel = 'OFF' 
}: ModeToggleProps) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
      <button
        type="button"
        disabled={disabled}
        onClick={onToggle}
        style={{
          width: 50,
          height: 24,
          borderRadius: 25,
          background: checked ? '#10b981' : '#ccc',
          border: 'none',
          position: 'relative',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'background 0.3s ease',
          padding: 0
        }}
      >
        <div
          style={{
            width: 18,
            height: 18,
            background: 'white',
            borderRadius: '50%',
            position: 'absolute',
            top: 3,
            left: checked ? 29 : 3,
            transition: 'left 0.3s ease',
            boxShadow: '0 2px 4px rgba(0,0,0,0.2)'
          }}
        />
      </button>
      <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--store-text-muted)', textTransform: 'uppercase' }}>
        {checked ? onLabel : offLabel}
      </span>
    </div>
  );
}
