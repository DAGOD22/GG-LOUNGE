import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

/**
 * Member accounts, split out of lib/auth.ts: that module is imported by admin and
 * gate routes (and middleware-adjacent code), so it must stay free of pg and
 * better-auth. Same behaviour as main, plus the Vercel origins the deploy actually
 * uses instead of the old v0 sandbox host.
 */
const origin =
  process.env.NODE_ENV === 'development'
    ? 'http://localhost:3000'
    : (process.env.BETTER_AUTH_URL ??
       (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.V0_RUNTIME_URL))

const deployOrigins = [
  ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
  ...(process.env.VERCEL_PROJECT_PRODUCTION_URL ? [`https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`] : []),
  ...(process.env.NEXT_PUBLIC_SITE_URL ? [process.env.NEXT_PUBLIC_SITE_URL] : []),
]

export const auth = betterAuth({
  database: pool,
  baseURL: origin,
  emailAndPassword: { enabled: true, autoSignIn: true },
  trustedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    ...deployOrigins,
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
    ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  ...(process.env.NODE_ENV === 'development'
    ? { advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } }
    : {}),
})
