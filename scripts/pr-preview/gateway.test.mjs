import test from 'node:test';
import assert from 'node:assert/strict';
import { gatewayService, GATEWAY_IMAGE, ORIGIN_TOKEN_ENV, ORIGIN_TOKEN_HEADER } from './gateway.mjs';

test('gateway recipe rejects inputs that could escape the PR origin or nginx configuration', () => {
  for (const number of [0, -1, 1.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1, '12', '12; return 200;', null]) {
    assert.throws(() => gatewayService(number), /PR number invalid/);
  }
});

test('gateway is a pinned independent image with only a container port and no app mounts', () => {
  const recipe = gatewayService(98);
  assert.match(GATEWAY_IMAGE, /^nginx@sha256:[0-9a-f]{64}$/);
  assert.equal(recipe.image, GATEWAY_IMAGE);
  assert.equal(recipe.customDomain, 'preview-origin-pr-98.mstefan.dev');
  assert.deepEqual(recipe.ports, ['8080']);
  assert.deepEqual(recipe.volumes, []);
  assert.equal(recipe.build, undefined);
  assert.equal(recipe.dockerfile, undefined);
  assert.equal(recipe.command, undefined);
});

test('persisted recipe contains a credential placeholder and leaves runtime variables to scoped environment storage', () => {
  const recipe = gatewayService(98);
  assert.equal(ORIGIN_TOKEN_HEADER, 'X-Preview-Origin-Token');
  assert.equal(ORIGIN_TOKEN_ENV, 'PREVIEW_ORIGIN_TOKEN');
  assert.deepEqual(recipe.environment, {});
  assert.equal(recipe.advanced.files[0].path, '/etc/nginx/templates/default.conf.template');
  const config = recipe.advanced.files[0].content;
  assert.match(config, /if \(\$http_x_preview_origin_token = ""\) \{ return 404; \}/);
  assert.match(config, /if \(\$http_x_preview_origin_token != "\$\{PREVIEW_ORIGIN_TOKEN\}"\) \{ return 404; \}/);
  assert.match(config, /proxy_set_header X-Preview-Origin-Token "";/);
  assert.match(config, /access_log off;/);
  assert.match(config, /resolver 127\.0\.0\.11 valid=5s ipv6=off;/);
  assert.match(config, /set \$preview_upstream "http:\/\/mstefan-pr-previews-pr-98:3000";/);
  assert.match(config, /proxy_pass \$preview_upstream\$request_uri;/);
  assert.equal(config.includes('mstefan-pr-previews-pr-99'), false);
});

test('each invocation returns independent mutable service configuration', () => {
  const first = gatewayService(98);
  first.advanced.files[0].content = 'changed';
  first.environment.PREVIEW_ORIGIN_TOKEN = 'synthetic-test-value';
  const next = gatewayService(99);
  assert.equal(JSON.stringify(next).includes('synthetic-test-value'), false);
  assert.match(next.advanced.files[0].content, /mstefan-pr-previews-pr-99:3000/);
});
