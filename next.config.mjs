/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: ['3000-ignif5oikazv4mtd4gk11.e2b.app', '*.e2b.app'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
