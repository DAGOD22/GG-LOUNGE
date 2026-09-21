import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, mkdir } from 'node:fs/promises';
import path from 'node:path';
test('simultaneous duplicate requests share one stored row; votes remain real', async t => {
  await mkdir('.cache',{recursive:true});const dir=await mkdtemp(path.resolve('.cache/request-test-'));
  process.env.DATA_DIR=dir;delete process.env.DATABASE_URL;
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const {createSimpleRequest,listRequests,upvoteRequest}=await import('../lib/db');
  const results=await Promise.all(Array.from({length:10},(_,i)=>createSimpleRequest(i%2?'Cat Pizza':'cat pizza')));
  assert.equal(new Set(results.map(row=>row.id)).size,1);
  assert.equal((await listRequests()).length,1);
  assert.equal((await listRequests())[0].votes,1);
  await upvoteRequest(results[0].id);
  assert.equal((await listRequests())[0].votes,2);
});
