/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['*.e2b.app'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
