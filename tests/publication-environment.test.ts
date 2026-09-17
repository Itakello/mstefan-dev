import assert from 'node:assert/strict';
import test from 'node:test';
import { publicationEnvironment } from '../lib/publicationEnvironment';

test('self-hosted production requires valid publication sources unless explicitly private', () => {
  assert.equal(publicationEnvironment({ NODE_ENV: 'production' }), 'production');
  assert.equal(publicationEnvironment({ NODE_ENV: 'production', SITE_DEPLOYMENT: 'private' }), undefined);
  assert.equal(publicationEnvironment({ NODE_ENV: 'production', SITE_DEPLOYMENT: 'public' }), 'production');
  assert.equal(publicationEnvironment({ NODE_ENV: 'production', SITE_DEPLOYMENT: 'typo' }), 'production');
  assert.equal(publicationEnvironment({ NODE_ENV: 'development' }), undefined);
  assert.equal(publicationEnvironment({ NODE_ENV: 'production', VERCEL_ENV: 'preview' }), 'preview');
});
