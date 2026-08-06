import { test } from 'node:test';
import * as assert from 'node:assert';
import { getProtocol } from './index';

test('getProtocol 返回 openai 适配器', () => {
  assert.equal(getProtocol('openai').name, 'openai');
});

test('getProtocol 对未实现的协议抛错（为 anthropic/responses 留扩展位）', () => {
  assert.throws(() => getProtocol('anthropic'), /未知协议/);
  assert.throws(() => getProtocol('responses'), /未知协议/);
});
