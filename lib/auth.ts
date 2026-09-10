import { betterAuth } from 'better-auth'
import { pool } from '@/lib/db'

const origin = process.env.NODE_ENV === 'development' ? 'http://localhost:3000' : (process.env.BETTER_AUTH_URL ?? (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.V0_RUNTIME_URL))

export const auth = betterAuth({
  database: pool,
  baseURL: origin,
  emailAndPassword: { enabled: true, autoSignIn: true },
  trustedOrigins: [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://sb-9uxij242plud.vercel.run',
    ...(process.env.V0_RUNTIME_URL ? [process.env.V0_RUNTIME_URL] : []),
    ...(process.env.V0_DEV_APP_URL ? [process.env.V0_DEV_APP_URL] : []),
    ...(process.env.V0_BUILD_URL ? [process.env.V0_BUILD_URL] : []),
  ],
  session: { expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
  ...(process.env.NODE_ENV === 'development' ? { advanced: { defaultCookieAttributes: { sameSite: 'none' as const, secure: true } } } : {}),
})
