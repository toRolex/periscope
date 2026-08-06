import { test } from 'node:test';
import * as assert from 'node:assert';
import { anthropicAdapter } from './anthropic';

test('buildRequest 构造 anthropic v1/messages 请求', () => {
  const req = anthropicAdapter.buildRequest({
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-latest',
    imageDataUrl: 'data:image/png;base64,AAAA',
    intent: '描述这张图片里的内容',
    apiKey: 'sk-ant-test',
  });
  assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
  assert.equal(req.headers['x-api-key'], 'sk-ant-test');
  assert.equal(req.headers['anthropic-version'], '2023-06-01');
  assert.equal(req.headers['content-type'], 'application/json');
  const body = req.body as any;
  assert.equal(body.model, 'claude-3-5-sonnet-latest');
  assert.ok(body.max_tokens > 0, '应设置 max_tokens');
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, 'user');
  assert.equal(body.messages[0].content.length, 2);
  assert.equal(body.messages[0].content[0].type, 'text');
  assert.equal(body.messages[0].content[0].text, '描述这张图片里的内容');
  assert.equal(body.messages[0].content[1].type, 'image');
  assert.equal(body.messages[0].content[1].source.type, 'base64');
  assert.equal(body.messages[0].content[1].source.media_type, 'image/png');
  assert.equal(body.messages[0].content[1].source.data, 'AAAA');
});

test('buildRequest 未提供 intent 时使用默认提示词', () => {
  const req = anthropicAdapter.buildRequest({
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-latest',
    imageDataUrl: 'data:image/png;base64,AAAA',
  });
  const body = req.body as any;
  assert.equal(body.messages[0].content[0].text, '描述这张图片');
});

test('buildRequest 未提供 apiKey 时不设置 x-api-key 头', () => {
  const req = anthropicAdapter.buildRequest({
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-latest',
    imageDataUrl: 'data:image/png;base64,AAAA',
  });
  assert.equal(req.headers['x-api-key'], undefined);
});

test('extractText 提取 content 中 text 块的拼接文本', () => {
  const raw = JSON.stringify({
    content: [
      { type: 'text', text: '左边是山' },
      { type: 'text', text: '，右边是河' },
    ],
  });
  assert.equal(anthropicAdapter.extractText(raw), '左边是山，右边是河');
});

test('extractText 忽略非 text 块（如 tool_use）', () => {
  const raw = JSON.stringify({
    content: [
      { type: 'tool_use', id: 'toolu_01' },
      { type: 'text', text: '画面里有只猫' },
    ],
  });
  assert.equal(anthropicAdapter.extractText(raw), '画面里有只猫');
});

test('extractText 对非 JSON 响应透传原始文本', () => {
  assert.equal(anthropicAdapter.extractText('not-json-at-all'), 'not-json-at-all');
});

test('extractText 对缺少 content 的响应透传原始文本', () => {
  const raw = '{"error":{"message":"bad request"}}';
  assert.equal(anthropicAdapter.extractText(raw), raw);
});
