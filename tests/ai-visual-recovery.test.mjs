import assert from 'node:assert/strict';
import test from 'node:test';
import { mkdtempSync, writeFileSync, rmSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { main } from '../scripts/visual-review/recovery.mjs';
import { PAID_STEP } from '../scripts/visual-review/ai-review.mjs';
const repository = 'Itakello/mstefan-dev';
const sha = '984a18035e4a4cc354bf9ef40438f4fb03a6dc01';
const base = '9bbfa628b146d81abfb60f96b60617b88c5464ef';
const instant = Date.parse('2026-10-11T14:00:00Z');
const pr = {state:'open',number:140,head:{sha},base:{sha:base,repo:{full_name:repository}}};
const source = {id:7,repository:{full_name:repository},name:'Visual review',path:'.github/workflows/visual-review.yml',event:'pull_request',status:'completed',conclusion:'success',head_sha:sha,pull_requests:[{number:140,head:{sha},base:{sha:base}}]};
const step = (name = PAID_STEP, status = 'completed') => ({name,status,started_at:new Date(instant - 60000).toISOString()});
const historical = {id:8,status:'completed',updated_at:new Date(instant).toISOString()};
const current = {id:9,status:'in_progress',updated_at:new Date(instant).toISOString()};
async function fixture(run) {
  const directory = mkdtempSync(join(tmpdir(),'recovery-test-'));
  const eventPath = join(directory,'event.json');
  const preparedPath = join(directory,'ai-visual-request.json');
  const event = {inputs:{recovery:'true',source_run_id:'7'}};
  const prepared = {sha,base,sourceRun:7,reservedMicroUsd:1500000};
  const env = {GITHUB_REPOSITORY:repository,GITHUB_EVENT_NAME:'workflow_dispatch',GITHUB_ACTOR:'Itakello',GITHUB_TRIGGERING_ACTOR:'Itakello',GITHUB_RUN_ATTEMPT:'1',GITHUB_REF:'refs/heads/codex/visual-review-no-daily-cap',GITHUB_SHA:sha,GITHUB_RUN_ID:'9',GITHUB_EVENT_PATH:eventPath,RUNNER_TEMP:directory,GITHUB_TOKEN:'mock-only'};
  const replies = new Map([
    ['/pulls/140', structuredClone(pr)], ['/actions/runs/7',structuredClone(source)],
    [`/commits/${sha}/statuses?per_page=100`,[]],
    ['/actions/runs/8/jobs?filter=all&per_page=100',{total_count:1,jobs:[{steps:[step(),step(),step()]}]}],
    ['/actions/runs/9/jobs?filter=all&per_page=100',{total_count:1,jobs:[{steps:[step(PAID_STEP,'in_progress')]}]}],
  ]);
  let listing = {total_count:2,workflow_runs:[historical,current]};
  const calls = [];
  const fetcher = async (url,options) => {
    assert.equal(options.method,'GET'); assert.ok(options.signal);
    assert.ok(url.startsWith(`https://api.github.com/repos/${repository}/`));
    const path = url.slice(`https://api.github.com/repos/${repository}`.length); calls.push(path);
    const value = path.startsWith('/actions/workflows/') ? listing : replies.get(path);
    assert.notEqual(value,undefined,`Unexpected API path: ${path}`);
    return new Response(JSON.stringify(value));
  };
  const execute = async (options = {}) => {
    writeFileSync(eventPath,JSON.stringify(event));
    writeFileSync(preparedPath,JSON.stringify(prepared),{mode:0o600});
    return main({env,fetcher,now:()=>instant,...options});
  };
  try { await run({env,event,prepared,replies,calls,execute,fetcher,preparedPath,setListing:value=>{listing=value;}}); }
  finally { rmSync(directory,{recursive:true,force:true}); }
}
test('valid attended recovery reads only GitHub without model calls', () => fixture(async ({execute,calls,event}) => {
  await execute(); assert.equal(calls.length,3);
  event.inputs.recovery = true; await execute();
}));
test('recovery rejects wrong principal, route, rerun and expiry before reading APIs', async () => {
  for (const [key,value] of Object.entries({GITHUB_REPOSITORY:'other/repo',GITHUB_EVENT_NAME:'workflow_run',GITHUB_ACTOR:'other',GITHUB_TRIGGERING_ACTOR:'other',GITHUB_REF:'refs/heads/master',GITHUB_RUN_ATTEMPT:'2',GITHUB_SHA:'bad',GITHUB_RUN_ID:'0'})) {
    await fixture(async ({env,execute,calls}) => {env[key]=value; await assert.rejects(execute()); assert.equal(calls.length,0);});
  }
  await fixture(async ({execute,calls}) => {await assert.rejects(execute({now:()=>Date.parse('2026-10-12T20:59:00Z')}),/expired/); assert.equal(calls.length,0);});
});
test('expiry is checked again after live verification', async () => {
  await fixture(async ({execute}) => {
    let count=0;
    await assert.rejects(execute({now:()=>++count === 1 ? instant : Date.parse('2026-10-12T20:59:00Z')}),/expired/);
  });
});
test('recovery input is explicit and source IDs are positive decimal strings', async () => {
  for (const recovery of [false,'false','yes',1,undefined]) await fixture(async ({event,execute,calls}) => {event.inputs.recovery=recovery; await assert.rejects(execute(),/opt-in/); assert.equal(calls.length,0);});
  for (const id of ['0','-7','7/x','7.0',7,undefined]) await fixture(async ({event,execute,calls}) => {event.inputs.source_run_id=id; await assert.rejects(execute(),/source run/); assert.equal(calls.length,0);});
});
test('live PR and immutable producer must prove the exact dispatch head and authorized base', async () => {
  const variants = [
    ['/pulls/140',value=>{value.head.sha='old';}], ['/pulls/140',value=>{value.base.sha='old';}],
    ['/pulls/140',value=>{value.state='closed';}], ['/pulls/140',value=>{value.number=130;}],
    ['/pulls/140',value=>{value.base.repo.full_name='other/repo';}],
    ['/actions/runs/7',value=>{value.id=6;}], ['/actions/runs/7',value=>{value.head_sha='old';}],
    ['/actions/runs/7',value=>{value.pull_requests[0].base.sha='old';}],
    ['/actions/runs/7',value=>{value.pull_requests[0].number=130;}],
    ['/actions/runs/7',value=>{value.repository.full_name='other/repo';}],
    ['/actions/runs/7',value=>{value.path='.github/workflows/other.yml';}],
    ['/actions/runs/7',value=>{value.event='workflow_dispatch';}],
    ['/actions/runs/7',value=>{value.conclusion='failure';}],
  ];
  for (const [path,mutate] of variants) await fixture(async ({execute,replies}) => {mutate(replies.get(path)); await assert.rejects(execute());});
});
test('claimed tuple and incomplete status history prevent recovery', async () => {
  for (const statuses of [[{context:'AI visual review',description:`PR140 ${base}: request claimed; no retries`}],Array(100).fill({context:'x',description:'x'}),[{}]]) {
    await fixture(async ({execute,replies})=>{replies.set(`/commits/${sha}/statuses?per_page=100`,statuses); await assert.rejects(execute());});
  }
});
test('API failure messages exclude server bodies and request inputs', () => fixture(async ({execute}) => {
  await assert.rejects(execute({fetcher:async()=>new Response('sensitive server body',{status:403})}),{message:'GitHub request failed (403)'});
  await assert.rejects(execute({fetcher:async()=>{throw new Error('sensitive token');}}),{message:'GitHub request failed'});
}));

test('recovery rejects old PRs 138 and 135 and any source outside the sole PR 140 scope', async () => {
  for (const number of [138,135,141]) await fixture(async ({replies,execute}) => {
    replies.get('/actions/runs/7').pull_requests[0].number=number;
    await assert.rejects(execute(),/outside approved scope/);
  });
});
