import { pathToFileURL } from 'node:url';
import { clients, runPreview, validateProject } from './controller.mjs';

const assert = (condition, message) => { if (!condition) throw new Error(message); };

export async function sweepPreviews({ templateId, now = Date.now, ...api }) {
  const deadline = now() + 20 * 60 * 1000;
  for (const name of ['gh', 'ship', 'cf']) {
    const call = api[name];
    api[name] = (...args) => {
      assert(now() < deadline, 'Preview sweep time bound exceeded');
      return call(...args);
    };
  }
  assert(/^[a-zA-Z0-9_-]+$/.test(templateId ?? ''), 'Preview template identity invalid');
  const template = validateProject((await api.ship('get_projects_by_id', { id: templateId })).data);
  assert(template.id === templateId, 'Preview template identity mismatch');
  const children = (await api.ship('get_projects_by_id_environments', { id: templateId })).data;
  assert(Array.isArray(children) && children.length <= 100, 'Preview child list exceeds sweep bound');
  const numbers = new Set();
  for (const child of children) {
    if (child.id === templateId) {
      assert(child.slug === 'production' && child.type === 'production', 'Preview template environment mismatch');
      continue;
    }
    const match = /^pr-([1-9]\d*)$/.exec(child.slug);
    assert(match && child.type === 'preview' && Number.isSafeInteger(Number(match[1])), 'Preview child namespace invalid');
    assert(!numbers.has(Number(match[1])), 'Duplicate preview child');
    numbers.add(Number(match[1]));
  }
  const rows = [];
  for (let page = 1; ; page++) {
    assert(page <= 10, 'Preview project list exceeds sweep bound');
    const list = await api.ship('get_projects', { query: { page, perPage: 100 } });
    assert(Array.isArray(list.data) && list.data.length <= 100 && Number.isSafeInteger(list.total) && list.total >= 0, 'Preview project list invalid');
    rows.push(...list.data);
    if (page * 100 >= list.total) {
      assert(rows.length === list.total && new Set(rows.map(r => r.id)).size === rows.length, 'Preview project list incomplete');
      break;
    }
  }
  const gateways = new Set();
  for (const row of rows) {
    const match = /^mstefan-pr-preview-gateway-([1-9]\d*)$/.exec(row.slug);
    if (!match) continue;
    const number = Number(match[1]);
    assert(Number.isSafeInteger(number) && !gateways.has(number), 'Gateway namespace invalid or duplicate');
    gateways.add(number);
    numbers.add(number);
  }
  assert(numbers.size <= 100, 'Preview target count exceeds sweep bound');
  const results = [];
  for (const number of [...numbers].sort((a, b) => a - b)) {
    try {
      results.push({ number, ...await runPreview({ ...api, number, templateId, now, closeOnly: true, purgeGateway: true }) });
    } catch {
      results.push({ number, state: 'failed' });
    }
  }
  if (results.some(row => row.state === 'failed')) {
    const error = new Error(`Preview sweep failed for PRs: ${results.filter(row => row.state === 'failed').map(row => row.number).join(', ')}`);
    error.results = results;
    throw error;
  }
  return results;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    assert(process.env.GITHUB_REPOSITORY === 'Itakello/mstefan-dev'
      && ['schedule', 'workflow_dispatch'].includes(process.env.GITHUB_EVENT_NAME)
      && process.env.GITHUB_REF === 'refs/heads/master', 'Trusted default-branch sweep required');
    console.log(JSON.stringify(await sweepPreviews({ templateId: process.env.OPENSHIP_PREVIEW_TEMPLATE_ID,
      dataExpiry: process.env.PREVIEW_DATA_EXPIRY_ENABLED === 'true',
      backupDestinationId: process.env.OPENSHIP_PREVIEW_BACKUP_DESTINATION_ID, seed: process.env.PREVIEW_PAYLOAD_SECRET, ...clients(process.env) })));
  } catch (error) {
    if (error.results) console.error(JSON.stringify(error.results));
    console.error(error.message);
    process.exitCode = 1;
  }
}
