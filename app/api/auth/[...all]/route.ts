export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

import { auth } from '@/lib/auth-server'
import { toNextJsHandler } from 'better-auth/next-js'
export const { GET, POST } = toNextJsHandler(auth)
