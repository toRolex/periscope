import { test } from 'node:test';
import * as assert from 'node:assert';
import { responsesAdapter } from './responses';
import { TASK_TEMPLATES } from '../core/templates';

test('buildRequest 构造 responses v1/responses 请求', () => {
  const req = responsesAdapter.buildRequest({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    imageDataUrl: 'data:image/png;base64,AAAA',
    intent: '描述这张图片里的内容',
    apiKey: 'sk-test',
  });
  assert.equal(req.url, 'https://api.openai.com/v1/responses');
  assert.equal(req.headers['authorization'], 'Bearer sk-test');
  assert.equal(req.headers['content-type'], 'application/json');
  const body = req.body as any;
  assert.equal(body.model, 'gpt-4o-mini');
  assert.equal(body.input.length, 1);
  assert.equal(body.input[0].role, 'user');
  assert.equal(body.input[0].content.length, 2);
  assert.equal(body.input[0].content[0].type, 'input_text');
  assert.equal(body.input[0].content[0].text, '描述这张图片里的内容');
  assert.equal(body.input[0].content[1].type, 'input_image');
  assert.equal(body.input[0].content[1].image_url, 'data:image/png;base64,AAAA');
});

test('buildRequest 未提供 intent 时使用默认提示词', () => {
  const req = responsesAdapter.buildRequest({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    imageDataUrl: 'data:image/png;base64,AAAA',
  });
  const body = req.body as any;
  assert.equal(body.input[0].content[0].text, '描述这张图片');
});

test('buildRequest 未提供 apiKey 时不设置 Authorization 头', () => {
  const req = responsesAdapter.buildRequest({
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    imageDataUrl: 'data:image/png;base64,AAAA',
  });
  assert.equal(req.headers['authorization'], undefined);
});

test('extractText 提取 output 中 message 的 output_text 拼接文本', () => {
  const raw = JSON.stringify({
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [
          { type: 'output_text', text: '画面里有一只猫' },
          { type: 'refusal', text: 'no' },
        ],
      },
    ],
  });
  assert.equal(responsesAdapter.extractText(raw), '画面里有一只猫');
});

test('extractText 忽略非 message 的 output 项（如 reasoning）', () => {
  const raw = JSON.stringify({
    output: [
      { type: 'reasoning', summary: [{ type: 'summary_text', text: '思考中' }] },
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: '最终描述' }],
      },
    ],
  });
  assert.equal(responsesAdapter.extractText(raw), '最终描述');
});

test('extractText 对非 JSON 响应透传原始文本', () => {
  assert.equal(responsesAdapter.extractText('not-json-at-all'), 'not-json-at-all');
});

test('extractText 对缺少 output 的响应透传原始文本', () => {
  const raw = '{"error":{"message":"bad request"}}';
  assert.equal(responsesAdapter.extractText(raw), raw);
});

test('buildRequest 把 ocr/table/chart 模板 prompt 放进 input_text 位置', () => {
  for (const prompt of Object.values(TASK_TEMPLATES)) {
    const req = responsesAdapter.buildRequest({
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      imageDataUrl: 'data:image/png;base64,AAAA',
      intent: prompt,
    });
    const body = req.body as any;
    assert.equal(body.input[0].content[0].type, 'input_text');
    assert.equal(body.input[0].content[0].text, prompt);
  }
});
