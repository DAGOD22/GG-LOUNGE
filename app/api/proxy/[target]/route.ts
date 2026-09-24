/**
 * Next.js route: /api/proxy/<base64url-target>
 * Thin adapter — all logic lives in lib/proxy so tests call it directly.
 */
import { handleProxyRequest } from '../../../../lib/proxy/handler.ts'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

type Ctx = { params: Promise<{ target: string }> } // [target] is a single segment → string

async function run(request: Request, ctx: Ctx): Promise<Response> {
  try {
    const { target } = await ctx.params
    // Dynamic [target] params arrive as a plain string. (An earlier version
    // did target[0], which sliced the FIRST CHARACTER off every base64
    // segment and made every production request fail with BAD_TARGET — unit
    // tests called handleProxyRequest directly and could not catch this.)
    const segment = typeof target === 'string' ? target : String(target?.[0] ?? '')
    return await handleProxyRequest(request, segment)
  } catch (err) {
    // Next decodes route params with decodeURIComponent — a segment like
    // '%%%' throws URIError before our codec ever runs, which would surface
    // as a bare 500. Answer with an honest, non-leaky 400 instead.
    const code = err instanceof Error && err.name === 'URIError' ? 'BAD_TARGET' : 'INTERNAL'
    console.warn('[gg-proxy] route failure:', code, err instanceof Error ? err.message : String(err))
    if (code === 'BAD_TARGET') {
      return Response.json(
        { error: 'BAD_TARGET', message: 'That address could not be decoded.', status: 400, host: null },
        { status: 400, headers: { 'cache-control': 'no-store' } },
      )
    }
    return Response.json({ error: 'INTERNAL', message: 'Unexpected proxy failure.', status: 500, host: null }, { status: 500 })
  }
}

export { run as GET, run as POST, run as PUT, run as PATCH, run as DELETE, run as HEAD, run as OPTIONS }
