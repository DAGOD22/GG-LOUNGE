/**
 * Public origin of the LOUNGE itself, as seen by the client.
 *
 * Used for: boot JSON (runtime postMessage), CORS preflight echo, config
 * endpoint. `new URL(request.url).origin` alone is WRONG behind Next's
 * server — it reported `http://localhost:3100` while the page lived at
 * `http://127.0.0.1:3100`, and the runtime then called
 * `postMessage(data, 'http://localhost:3100')`, which the browser silently
 * refuses to deliver (targetOrigin mismatch) — every status/error message
 * from the frame was lost. Behind Vercel the correct host/proto only arrive
 * via x-forwarded-* headers, so those win when present.
 */
export function originOf(request: Request): string {
  try {
    const url = new URL(request.url)
    const fwdHost = (request.headers.get('x-forwarded-host') || '').split(',')[0].trim()
    const host = fwdHost || (request.headers.get('host') || '').split(',')[0].trim() || url.host
    const fwdProto = (request.headers.get('x-forwarded-proto') || '').split(',')[0].trim()
    const proto = fwdProto || url.protocol.replace(':', '') || 'https'
    if (!host) return url.origin
    return `${proto}://${host}`
  } catch {
    return ''
  }
}
