import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  turbopack: {
    root: path.resolve(__dirname),
  },
  outputFileTracingRoot: path.resolve(__dirname),
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
  },
  images: {
    // Serve AVIF/WebP for optimized thumbnails (dashboard cards, sidebar) —
    // roughly 30-50% smaller than JPEG at the same quality. Full-size viewer
    // images bypass the optimizer (`unoptimized`) and are unaffected.
    formats: ['image/avif', 'image/webp'],
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'mjvthppljacmcftgcjeb.supabase.co',
        port: '',
        pathname: '/storage/v1/**',
      },
      {
        protocol: 'https',
        hostname: 'grukocsepesmslwfjnpk.supabase.co',
        port: '',
        pathname: '/storage/v1/**',
      },
    ],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [128, 256, 384],
  },
};

export default nextConfig;
