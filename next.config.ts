import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "test-hozen-tak-sso-login.tbtech.jp",
    "stg-hozen-tak-sso-login.tbtech.jp",
    "hozen-tak-sso-login.tbtech.jp",
    "localhost"
  ],
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
