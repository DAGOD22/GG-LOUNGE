import { POST as handleRequest } from '../../route';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
// Both endpoints share exactly one cooldown/rate-limit implementation.
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const headers = new Headers(request.headers);
  headers.set('Content-Type', 'application/json');
  headers.delete('Content-Length');
  return handleRequest(new Request(request.url, { method: 'POST', headers, body: JSON.stringify({ upvoteId: id }) }));
}
