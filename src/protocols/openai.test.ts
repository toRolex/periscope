import { test } from 'node:test';
import * as assert from 'node:assert';
import { openaiAdapter } from './openai';

test('buildRequest 构造 openai chat/completions 请求', () => {
  const req = openaiAdapter.buildRequest({
    baseUrl: 'https://dashscope.example/v1',
    model: 'qwen-vl-max',
    imageDataUrl: 'data:image/png;base64,AAAA',
    intent: '描述这张图片里的内容',
    apiKey: 'sk-test',
  });
  assert.equal(req.url, 'https://dashscope.example/v1/chat/completions');
  assert.equal(req.headers['authorization'], 'Bearer sk-test');
  assert.equal(req.headers['content-type'], 'application/json');
  const body = req.body as any;
  assert.equal(body.model, 'qwen-vl-max');
  assert.equal(body.messages.length, 1);
  assert.equal(body.messages[0].role, 'user');
  assert.equal(body.messages[0].content.length, 2);
  assert.equal(body.messages[0].content[0].type, 'text');
  assert.equal(body.messages[0].content[0].text, '描述这张图片里的内容');
  assert.equal(body.messages[0].content[1].type, 'image_url');
  assert.equal(
    body.messages[0].content[1].image_url.url,
    'data:image/png;base64,AAAA',
  );
});

test('buildRequest 未提供 intent 时使用默认提示词', () => {
  const req = openaiAdapter.buildRequest({
    baseUrl: 'https://dashscope.example/v1',
    model: 'qwen-vl-max',
    imageDataUrl: 'data:image/png;base64,AAAA',
  });
  const body = req.body as any;
  assert.equal(body.messages[0].content[0].text, '描述这张图片');
});

test('buildRequest 未提供 apiKey 时不设置 Authorization 头', () => {
  const req = openaiAdapter.buildRequest({
    baseUrl: 'https://dashscope.example/v1',
    model: 'qwen-vl-max',
    imageDataUrl: 'data:image/png;base64,AAAA',
  });
  assert.equal(req.headers['authorization'], undefined);
});

test('extractText 提取字符串 content', () => {
  const text = openaiAdapter.extractText(
    '{"choices":[{"message":{"content":"画面里有一只猫"}}]}',
  );
  assert.equal(text, '画面里有一只猫');
});

test('extractText 拼接数组 content 中的文本片段', () => {
  const raw = JSON.stringify({
    choices: [
      {
        message: {
          content: [{ type: 'text', text: '左边是山' }, { type: 'text', text: '，右边是河' }],
        },
      },
    ],
  });
  assert.equal(openaiAdapter.extractText(raw), '左边是山，右边是河');
});

test('extractText 对非 JSON 响应透传原始文本', () => {
  assert.equal(openaiAdapter.extractText('not-json-at-all'), 'not-json-at-all');
});

test('extractText 对缺少 content 的响应透传原始文本', () => {
  const raw = '{"error":{"message":"bad request"}}';
  assert.equal(openaiAdapter.extractText(raw), raw);
});
