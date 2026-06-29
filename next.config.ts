import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: ['3a1c-58-187-92-32.ngrok-free.app'],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-DNS-Prefetch-Control', value: 'on' },
        ],
      },
    ]
  },
};

export default nextConfig;
