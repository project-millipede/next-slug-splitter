/**
 * Interactive counter component — a "heavy" component in the demo.
 *
 * Imports `BALLAST_DATA` (~1 MB) to simulate a realistic dependency payload
 * such as a stateful UI library. The ballast is referenced via a `data-ballast`
 * attribute so it is not tree-shaken away, making the bundle size impact
 * visible in build output.
 *
 * Pages that use `<Counter />` in their MDX content are classified as heavy
 * routes and served by a dedicated auto-generated handler.
 */

import { useState } from 'react';
import { BALLAST_DATA } from './counter-ballast';

export const Counter = () => {
  const [count, setCount] = useState(0);

  return (
    <div
      data-ballast={JSON.stringify(BALLAST_DATA).length}
      style={{
        padding: '1.5rem',
        border: '2px solid #3b82f6',
        borderRadius: '0.5rem',
        background: '#eff6ff',
        margin: '1rem 0',
        textAlign: 'center'
      }}
    >
      <p style={{ fontSize: '2rem', fontWeight: 'bold', margin: '0 0 1rem 0' }}>
        {count}
      </p>
      <div style={{ display: 'flex', gap: '0.5rem', justifyContent: 'center' }}>
        <button
          onClick={() => setCount(c => c - 1)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.25rem',
            border: '1px solid #93c5fd',
            background: 'white',
            cursor: 'pointer'
          }}
        >
          -
        </button>
        <button
          onClick={() => setCount(0)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.25rem',
            border: '1px solid #93c5fd',
            background: 'white',
            cursor: 'pointer'
          }}
        >
          Reset
        </button>
        <button
          onClick={() => setCount(c => c + 1)}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '0.25rem',
            border: '1px solid #93c5fd',
            background: 'white',
            cursor: 'pointer'
          }}
        >
          +
        </button>
      </div>
    </div>
  );
};
