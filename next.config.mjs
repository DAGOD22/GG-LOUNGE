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
      {
        // Baseline transport hardening for every response (pages and APIs).
        source: '/:path*',
        headers: [
          { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()' },
        ],
      },
      // 3.2 GB of game assets used to be served with no Cache-Control at all,
      // so every visitor re-downloaded every icon and every game payload on
      // every page view. Game files are content-addressed by directory (a game
      // directory only changes when we deliberately ship a new build), so a
      // long max-age with stale-while-revalidate is safe and saves the bulk of
      // the transfer cost. HTML entry points stay shorter-lived so a shipped
      // game update is picked up quickly.
      {
        source: '/games/:path*/index.html',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=300, stale-while-revalidate=86400' }],
      },
      {
        // Everything else inside a game directory: hashed or rarely-changing
        // payloads — textures, atlases, wasm, audio, level data.
        source: '/games/:path*',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=604800, stale-while-revalidate=2592000' },
          // These are user-generated game files, never execute them as a page.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
        ],
      },
      {
        source: '/game-icons/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/thumbnails/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
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
