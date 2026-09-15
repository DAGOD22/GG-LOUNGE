/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['3000-ignif5oikazv4mtd4gk11.e2b.app', '*.e2b.app'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  serverExternalPackages: ['@nebula-services/bare-server-node'],
  async headers() {
    return [
      {
        source: '/uv/uv.sw.js',
        headers: [{ key: 'Service-Worker-Allowed', value: '/' }],
      },
    ];
  },
}

export default nextConfig
