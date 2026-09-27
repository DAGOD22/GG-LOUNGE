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
        youtube:
          'Browsing can pass through, but watch pages depend on signed playback URLs and embed rules this proxy never bypasses. The Apps → YouTube nocookie embed is the supported way to watch.',
        portals:
          'Poki & CrazyGames apply anti-bot checks, frame protections and off-site game CDNs that can refuse proxying. Refusals are reported honestly with a direct link; pages are never faked.',
        failures:
          'Errors are classified: network failure vs timeout vs security block vs unsupported target vs provider restriction vs site server error — never one vague connectivity claim.',
      },
    },
    { headers: { 'cache-control': 'no-store' } },
  )
}
