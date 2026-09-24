/**
 * Server-side config for the proxy UI: allowlist summary + endpoint origin.
 * No secrets, no environment values.
 */
import { allowedHostSummary } from '../../../../lib/proxy/allowlist.ts'
import { originOf } from '../../../../lib/proxy/origin.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export function GET(request: Request) {
  const origin = originOf(request)
  return Response.json(
    {
      engine: 'server-proxy-v1',
      origin,
      allowlist: allowedHostSummary(),
      limitations: {
        websockets: 'Realtime WebSocket upgrades cannot be proxied on this host.',
        webrtc: 'WebRTC peer connections bypass the proxy and are blocked in sandboxed frames.',
        drm: 'DRM-protected video cannot be proxied.',
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
