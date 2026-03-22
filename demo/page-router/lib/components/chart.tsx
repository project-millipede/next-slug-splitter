/**
 * Bar chart component — a "heavy" component in the demo.
 *
 * Imports `BALLAST_DATA` (~3 MB) to simulate a realistic dependency payload
 * such as a visualization library (e.g. D3, Recharts). The ballast is
 * referenced via a `data-ballast` attribute so it is not tree-shaken away,
 * making the bundle size impact visible in build output.
 *
 * Pages that use `<Chart />` in their MDX content are classified as heavy
 * routes and served by a dedicated auto-generated handler.
 */

import { BALLAST_DATA } from './chart-ballast';

const data = [
  { label: 'Jan', value: 65 },
  { label: 'Feb', value: 78 },
  { label: 'Mar', value: 90 },
  { label: 'Apr', value: 81 },
  { label: 'May', value: 95 },
  { label: 'Jun', value: 110 }
];

const maxValue = Math.max(...data.map(d => d.value));

export const Chart = () => (
  <div
    data-ballast={JSON.stringify(BALLAST_DATA).length}
    style={{
      padding: '1.5rem',
      border: '2px solid #10b981',
      borderRadius: '0.5rem',
      background: '#ecfdf5',
      margin: '1rem 0'
    }}
  >
    <div
      style={{
        display: 'flex',
        alignItems: 'flex-end',
        gap: '0.5rem',
        height: '150px'
      }}
    >
      {data.map(d => (
        <div key={d.label} style={{ flex: 1, textAlign: 'center' }}>
          <div
            style={{
              background: '#10b981',
              borderRadius: '0.25rem 0.25rem 0 0',
              height: `${(d.value / maxValue) * 120}px`,
              transition: 'height 0.3s'
            }}
          />
          <div
            style={{
              fontSize: '0.75rem',
              marginTop: '0.25rem',
              color: '#6b7280'
            }}
          >
            {d.label}
          </div>
        </div>
      ))}
    </div>
    <p
      style={{
        fontSize: '0.75rem',
        color: '#9ca3af',
        marginTop: '0.5rem',
        textAlign: 'center'
      }}
    >
      Revenue (simulated chart component — represents a heavy visualization
      library)
    </p>
  </div>
);
