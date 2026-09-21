/** @type {import('next').NextConfig} */
const nextConfig = {
  compress: true,
  devIndicators: false,
  poweredByHeader: false,
  skipTrailingSlashRedirect: true,
  allowedDevOrigins: ['localhost', '127.0.0.1', '0.0.0.0', '*.e2b.app'],
  typescript: {
    ignoreBuildErrors: false,
  },
  images: {
    unoptimized: false,
    remotePatterns: [
      { protocol: 'https', hostname: '**' },
      { protocol: 'http', hostname: '**' },
    ],
    dangerouslyAllowSVG: true,
    contentSecurityPolicy: "default-src 'self'; script-src 'none'; sandbox;",
  },
  serverExternalPackages: ['@nebula-services/bare-server-node'],
  async headers() {
    return [
      { source: '/proxy/sw.js', headers: [{ key: 'Service-Worker-Allowed', value: '/browse/' }, { key: 'Cache-Control', value: 'no-store' }] },
      { source: '/proxy-runtime/:path*', headers: [{ key: 'Cache-Control', value: 'public, max-age=0, must-revalidate' }] },
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
