import { ImageResponse } from 'next/og';

import {
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TITLE
} from '../lib/site/config';

export const alt = `${SITE_NAME}: ${SITE_TITLE}`;
export const contentType = 'image/png';
export const size = {
  width: 1200,
  height: 630
};

export default function Image() {
  return new ImageResponse(
    (
      <div
        style={{
          display: 'flex',
          height: '100%',
          width: '100%',
          flexDirection: 'column',
          justifyContent: 'space-between',
          background: '#f7faf8',
          color: '#111b20',
          padding: 72
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            color: '#12676d',
            fontSize: 30,
            fontWeight: 800,
            textTransform: 'uppercase'
          }}
        >
          <span>{SITE_NAME}</span>
          <span>Build-time route splitting</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          <div
            style={{
              display: 'flex',
              maxWidth: 960,
              fontSize: 92,
              fontWeight: 900,
              letterSpacing: -2,
              lineHeight: 0.96
            }}
          >
            {SITE_TITLE}
          </div>
          <div
            style={{
              display: 'flex',
              maxWidth: 900,
              color: '#415158',
              fontSize: 32,
              lineHeight: 1.28
            }}
          >
            {SITE_DESCRIPTION}
          </div>
        </div>
        <div
          style={{
            display: 'flex',
            gap: 18,
            color: '#126044',
            fontSize: 28,
            fontWeight: 800
          }}
        >
          <span>Less route JS</span>
          <span>-</span>
          <span>Less transport</span>
          <span>-</span>
          <span>Better page experience signals</span>
        </div>
      </div>
    ),
    size
  );
}
