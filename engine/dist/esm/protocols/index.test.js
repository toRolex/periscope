import { test } from 'node:test';
import * as assert from 'node:assert';
import { getProtocol } from './index.js';
test('getProtocol 返回 openai 适配器', () => {
    assert.equal(getProtocol('openai').name, 'openai');
});
test('getProtocol 返回 anthropic 适配器', () => {
    assert.equal(getProtocol('anthropic').name, 'anthropic');
});
test('getProtocol 返回 responses 适配器', () => {
    assert.equal(getProtocol('responses').name, 'responses');
});
test('getProtocol 对未知协议抛错', () => {
    // 配置来自 JSON，运行时可能携带联合外的值；此路径仍须抛错。
    assert.throws(() => getProtocol('unknown'), /未知协议/);
});
