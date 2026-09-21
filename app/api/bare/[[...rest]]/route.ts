import { createBareServer } from '@nebula-services/bare-server-node';
import { assertPublicTarget, publicLookup } from '@/lib/network-target';
import { createBareHandler } from '@/lib/bare-adapter';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
const bare = createBareServer('/api/bare/', { filterRemote: assertPublicTarget, lookup: publicLookup, logErrors: false });
const handle = createBareHandler(bare);
export { handle as GET, handle as POST, handle as PUT, handle as PATCH, handle as DELETE, handle as OPTIONS, handle as HEAD };
