import { createServer } from 'node:http';
import { browserTools } from './explore.mjs';
import { actualUsage } from './ai-review.mjs';

export const RUN_LIMIT = 2_000_000;
const OUTPUT_LIMIT = 12_000;
export function reserveCost(inputTokens, remaining) {
  if (!Number.isSafeInteger(inputTokens) || inputTokens < 1) throw new Error('Invalid input token count');
  const amount = inputTokens * 5 + OUTPUT_LIMIT * 15;
  if (amount > remaining) throw new Error('Exploration dollar limit reached');
  return amount;
}

// The secret stays in this trusted process; Codex and its browser receive a dummy key.
export async function startModelRelay({ key, fetcher = fetch, limit = RUN_LIMIT, origin, beforeRequest }) {
  if (!key || limit !== RUN_LIMIT) throw new Error('A scoped key and the fixed run limit are required');
  let remaining = limit, calls = 0, busy = false, terminal = false;
  const receipts = [];
  const server = createServer(async (req, res) => {
    let reserved = 0;
    try {
      if (req.method !== 'POST' || req.url !== '/v1/responses' || busy || terminal || calls >= 20) throw new Error('Model route unavailable');
      busy = true;
      let size = 0;
      const chunks = [];
      for await (const chunk of req) {
        size += chunk.length;
        if (size > 32 * 1024 * 1024) throw new Error('Model request too large');
        chunks.push(chunk);
      }
      const body = JSON.parse(Buffer.concat(chunks).toString());
      if (body.model !== 'gpt-6.1-sol') throw new Error('Unexpected model');
      const validTool = tool => tool?.type === 'function' && browserTools.some(name => tool.name === name || tool.name === `mcp__browser__${name}`);
      const browserNamespace = tool => tool?.type === 'namespace' && ['mcp__browser', 'mcp__browser__'].includes(tool.name) && Array.isArray(tool.tools) && tool.tools.length && tool.tools.every(validTool);
      if (body.tools && !Array.isArray(body.tools)) throw new Error('Unexpected model tool catalog');
      body.tools = (body.tools || []).filter(tool => validTool(tool) || browserNamespace(tool));
      if (!body.tools.length) throw new Error('No usable browser tool catalog; no model request');
      body.max_output_tokens = OUTPUT_LIMIT;
      body.store = false;
      body.service_tier = 'default';
      body.reasoning = { ...body.reasoning, effort: 'medium' };
      const upstream = async (suffix, payload) => fetcher(`https://api.openai.com/v1/responses${suffix}`, {
        method: 'POST', headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
        body: JSON.stringify(payload), signal: AbortSignal.timeout(120_000), redirect: 'error',
      });
      const countBody = Object.fromEntries(['model', 'input', 'instructions', 'tools', 'tool_choice', 'previous_response_id', 'text', 'reasoning'].filter(name => body[name] !== undefined).map(name => [name, body[name]]));
      const count = await upstream('/input_tokens', countBody);
      if (!count.ok) throw new Error('Model input admission failed');
      const admission = await count.json();
      if (admission.object !== 'response.input_tokens') throw new Error('Unverified input admission');
      await beforeRequest?.();
      reserved = reserveCost(admission.input_tokens, remaining);
      remaining -= reserved;
      calls++;
      const receipt = { call: calls, reservedMicroUsd: reserved, chargedMicroUsd: reserved, settled: false };
      receipts.push(receipt);
      const response = await upstream('', body);
      if (!response.ok) throw new Error('Model request failed; no retry');
      let text = '', bytes = 0;
      for await (const chunk of response.body) {
        bytes += chunk.length;
        if (bytes > 32 * 1024 * 1024) throw new Error('Model response too large');
        text += Buffer.from(chunk).toString();
      }
      let completed;
      const streamItems = [];
      if (body.stream) {
        for (const line of text.split('\n')) {
          if (!line.startsWith('data: ')) continue;
          try { const event = JSON.parse(line.slice(6)); if (event.item) streamItems.push({ item: event.item, partial: event.type === 'response.output_item.added' }); if (event.type === 'response.completed') completed = event.response; } catch {}
        }
      } else completed = JSON.parse(text);
      const safeCall = (item, partial) => {
        const name = browserTools.find(name => item.name === `mcp__browser__${name}` || (item.name === name && ['mcp__browser', 'mcp__browser__'].includes(item.namespace)));
        if (!name) return false;
        if (partial && item.arguments === '') return true;
        let args;
        try { args = JSON.parse(item.arguments || '{}'); } catch { return false; }
        if (name === 'browser_navigate' && origin) {
          try { const url = new URL(args.url); if (url.origin !== origin || url.username || url.password) return false; } catch { return false; }
        }
        if (args.filename !== undefined && !/^[A-Za-z0-9][A-Za-z0-9_.-]{0,120}\.(?:png|jpe?g|trace|zip)$/.test(args.filename)) return false;
        return true;
      };
      const safeItem = (item, partial = false) => ['message', 'reasoning'].includes(item.type) || (item.type === 'function_call' && safeCall(item, partial));
      if (!Array.isArray(completed?.output) || !completed.output.every(item => safeItem(item)) || !streamItems.every(({ item, partial }) => safeItem(item, partial))) throw new Error('Model requested a tool outside browser review');
      if (completed?.status !== 'completed') throw new Error('Incomplete model response; no retry');
      const usage = actualUsage(completed, reserved);
      const actual = usage.microUsd;
      remaining += reserved - actual;
      Object.assign(receipt, { chargedMicroUsd: actual, settled: true, response: usage, inputTokens: usage.usage.input_tokens, outputTokens: usage.usage.output_tokens });
      res.writeHead(200, { 'content-type': response.headers.get('content-type') || 'text/event-stream' });
      res.end(text);
    } catch {
      terminal = true;
      if (!res.headersSent) res.writeHead(503, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ error: { message: 'Exploration model access or budget failed; no retry' } }));
    } finally { busy = false; }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  return {
    baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
    usage: () => ({ limitMicroUsd: limit, chargedMicroUsd: limit - remaining, calls, terminal, receipts }),
    close: () => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }),
  };
}
