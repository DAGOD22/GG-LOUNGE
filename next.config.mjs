/** @type {import('next').NextConfig} */
const nextConfig = {
  skipTrailingSlashRedirect: true,
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
      { source: '/uv/uv.sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/uv.sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/service/uv.sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/' }] },
      { source: '/uv/:path*', headers: [{ key: 'Service-Worker-Allowed', value: '/' }, { key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
    ];
  },
  async rewrites() {
    return [
      { source: '/api/edu/:path*', destination: '/api/bare/:path*' },
      { source: '/api/learn/:path*', destination: '/api/bare/:path*' },
      { source: '/api/t/:path*', destination: '/api/bare/:path*' },
    ];
  },
}

export default nextConfig
