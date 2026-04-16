/**
 * Data table component — a "heavy" component in the demo.
 *
 * Imports `BALLAST_DATA` (~6 MB) to simulate a realistic dependency payload
 * such as a data-grid library (e.g. AG Grid, TanStack Table). The ballast
 * is referenced via a `data-ballast` attribute so it is not tree-shaken
 * away, making the bundle size impact visible in build output.
 *
 * Pages that use `<DataTable />` in their MDX content are classified as
 * heavy routes and served by a dedicated auto-generated handler.
 */

'use client';

import { useState } from 'react';
import { BALLAST_DATA } from './data-table-ballast';

const rows = [
  { id: 1, date: '2025-03-15', description: 'Widget Pro', amount: '$249.00' },
  { id: 2, date: '2025-03-14', description: 'Starter Plan', amount: '$29.00' },
  {
    id: 3,
    date: '2025-03-14',
    description: 'Enterprise License',
    amount: '$1,499.00'
  },
  { id: 4, date: '2025-03-13', description: 'Widget Pro', amount: '$249.00' },
  { id: 5, date: '2025-03-12', description: 'Team Plan', amount: '$99.00' }
];

const cellStyle: React.CSSProperties = {
  padding: '0.5rem 1rem',
  borderBottom: '1px solid #e5e7eb',
  textAlign: 'left'
};

export const DataTable = () => {
  const [testState, setTestState] = useState(0);

  return (
    <div
      data-ballast={JSON.stringify(BALLAST_DATA).length}
      style={{
        border: '2px solid #f59e0b',
        borderRadius: '0.5rem',
        background: '#fffbeb',
        margin: '1rem 0',
        overflow: 'hidden'
      }}
    >
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ background: '#fef3c7' }}>
            <th style={cellStyle}>Date</th>
            <th style={cellStyle}>Description</th>
            <th style={{ ...cellStyle, textAlign: 'right' }}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.id}>
              <td style={cellStyle}>{row.date}</td>
              <td style={cellStyle}>{row.description}</td>
              <td
                style={{
                  ...cellStyle,
                  textAlign: 'right',
                  fontFamily: 'monospace'
                }}
              >
                {row.amount}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p
        style={{
          fontSize: '0.75rem',
          color: '#9ca3af',
          padding: '0.5rem 1rem',
          textAlign: 'center'
        }}
      >
        Simulated data table component — represents a heavy table/grid library
      </p>
    </div>
  );
};
