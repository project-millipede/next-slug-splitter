import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: false,
  devIndicators: false,
  // The local benchmark stack is reached via 127.0.0.1, so the dev server
  // must accept that origin for its own chunks and HMR websocket.
  allowedDevOrigins: ['127.0.0.1', 'localhost']
};

export default nextConfig;
