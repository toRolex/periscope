import { test } from 'node:test';
import * as assert from 'node:assert';
import { normalizeImageBlock, translateContent } from './translate';

/**
 * 桥接核心 translateContent 测试：注入 fake readImage / describeImage，全程离线，不依赖 dsh 真实类型。
 * 只测外部行为：翻译结果、降级占位符、image/described 记录、缓存命中（父 PRD #24 Testing Decisions）。
 */

test('单图翻译：ImageBlock 替换为 [Image 1] 描述 文字，并产出一条 image/described 记录', async () => {
  const attachment = {
    attachmentId: 'sha256:aaa',
    mediaType: 'image/png',
    bytes: 3,
    width: 1,
    height: 1,
  };
  const bytes = Buffer.from('img-a', 'utf8');
  const describeCalls: { bytes: Uint8Array; intent?: string }[] = [];
  const readCalls: unknown[] = [];

  const result = await translateContent([{ type: 'image', attachment }], {
    readImage: async (att) => {
      readCalls.push(att);
      return bytes;
    },
    describeImage: async (b, intent) => {
      describeCalls.push({ bytes: b, intent });
      return '一座山';
    },
  });

  assert.deepEqual(result.content, [{ type: 'text', text: '[Image 1] 一座山' }]);
  assert.deepEqual(result.records, [
    { attachmentId: 'sha256:aaa', description: '一座山' },
  ]);
  assert.deepEqual(readCalls, [attachment], 'readImage 应收到原始 attachment 引用');
  assert.equal(describeCalls.length, 1);
  assert.equal(describeCalls[0].bytes, bytes, 'describeImage 应收到 readImage 读出的字节');
});

/** 构造最小图片 block（本包自定义结构，不依赖 dsh 真实类型）。 */
function imageBlock(attachmentId: string): unknown {
  return { type: 'image', attachment: { attachmentId } };
}

test('多图翻译：按序编号 [Image 1]/[Image 2]，逐图产出记录', async () => {
  const described = new Map([
    ['sha256:a', '描述甲'],
    ['sha256:b', '描述乙'],
  ]);
  const describeCalls: string[] = [];

  const r = await translateContent([imageBlock('sha256:a'), imageBlock('sha256:b')], {
    readImage: async (att) => Buffer.from(String((att as any).attachmentId), 'utf8'),
    describeImage: async (bytes) => {
      const id = Buffer.from(bytes).toString('utf8');
      describeCalls.push(id);
      return described.get(id)!;
    },
  });

  assert.deepEqual(r.content, [
    { type: 'text', text: '[Image 1] 描述甲' },
    { type: 'text', text: '[Image 2] 描述乙' },
  ]);
  assert.deepEqual(r.records, [
    { attachmentId: 'sha256:a', description: '描述甲' },
    { attachmentId: 'sha256:b', description: '描述乙' },
  ]);
  assert.deepEqual(describeCalls, ['sha256:a', 'sha256:b']);
});

test('图文混合：text/其它 block 原样透传，图片替换为文字，顺序保持，且不修改入参', async () => {
  const toolUse = { type: 'tool_use', id: 'tu_1', name: 'bash', input: { cmd: 'ls' } };
  const image = imageBlock('sha256:c');
  const input: unknown[] = [{ type: 'text', text: '看这张图' }, image, toolUse];

  const result = await translateContent(input, {
    readImage: async () => Buffer.from('c', 'utf8'),
    describeImage: async () => '一只猫',
  });

  assert.deepEqual(result.content, [
    { type: 'text', text: '看这张图' },
    { type: 'text', text: '[Image 1] 一只猫' },
    toolUse,
  ]);
  assert.equal(result.content[0], input[0], 'text block 应原样透传（同一引用）');
  assert.equal(result.content[2], toolUse, '非图 block 应原样透传（同一引用）');
  assert.deepEqual(result.records, [{ attachmentId: 'sha256:c', description: '一只猫' }]);
  assert.deepEqual(input[1], image, '入参 image block 不应被改写');
  assert.equal((input[1] as any).type, 'image', '入参仍保持 image 类型');
});

test('嵌套 tool-result 图：递归翻译 tool_result.content 里的图，其余字段保留', async () => {
  const toolResult = {
    type: 'tool_result',
    tool_use_id: 'tu_1',
    is_error: false,
    content: [{ type: 'text', text: '截图如下' }, imageBlock('sha256:nested')],
  };
  const input: unknown[] = [
    { type: 'text', text: '之前' },
    imageBlock('sha256:top'),
    toolResult,
  ];

  const result = await translateContent(input, {
    readImage: async (att) => Buffer.from(String((att as any).attachmentId), 'utf8'),
    describeImage: async (bytes) => `desc:${Buffer.from(bytes).toString('utf8')}`,
  });

  assert.deepEqual(result.content, [
    { type: 'text', text: '之前' },
    { type: 'text', text: '[Image 1] desc:sha256:top' },
    {
      type: 'tool_result',
      tool_use_id: 'tu_1',
      is_error: false,
      content: [
        { type: 'text', text: '截图如下' },
        { type: 'text', text: '[Image 2] desc:sha256:nested' },
      ],
    },
  ]);
  assert.deepEqual(result.records, [
    { attachmentId: 'sha256:top', description: 'desc:sha256:top' },
    { attachmentId: 'sha256:nested', description: 'desc:sha256:nested' },
  ]);
  // 嵌套容器不应原地改写入参：原 tool_result.content 仍是图片 block。
  assert.equal((toolResult.content[1] as any).type, 'image', '入参嵌套图不应被改写');
  assert.notEqual(result.content[2], toolResult, '含嵌套图的容器应返回新对象');
});

test('describeImage 失败：降级为 [Image N] 描述不可用 占位符，不抛错，仍产出该图记录', async () => {
  const result = await translateContent([imageBlock('sha256:boom')], {
    readImage: async () => Buffer.from('x', 'utf8'),
    describeImage: async () => {
      throw new Error('视觉端点 500');
    },
  });

  assert.deepEqual(result.content, [{ type: 'text', text: '[Image 1] 描述不可用' }]);
  assert.deepEqual(result.records, [
    { attachmentId: 'sha256:boom', description: '描述不可用' },
  ]);
});

test('readImage 失败：同样降级为占位符，不抛错，仍产出记录', async () => {
  const result = await translateContent([imageBlock('sha256:noBy')], {
    readImage: async () => {
      throw new Error('attachment 读取失败');
    },
    describeImage: async () => '不应被调用',
  });

  assert.deepEqual(result.content, [{ type: 'text', text: '[Image 1] 描述不可用' }]);
  assert.deepEqual(result.records, [
    { attachmentId: 'sha256:noBy', description: '描述不可用' },
  ]);
});

test('单图失败不影响其余图：成功图保留描述，失败图降级占位符（逐图容错）', async () => {
  const result = await translateContent(
    [imageBlock('sha256:good'), imageBlock('sha256:bad')],
    {
      readImage: async (att) => Buffer.from(String((att as any).attachmentId), 'utf8'),
      describeImage: async (bytes) => {
        const id = Buffer.from(bytes).toString('utf8');
        if (id === 'sha256:bad') throw new Error('HTTP 500');
        return '好图描述';
      },
    },
  );

  assert.deepEqual(result.content, [
    { type: 'text', text: '[Image 1] 好图描述' },
    { type: 'text', text: '[Image 2] 描述不可用' },
  ]);
  assert.deepEqual(result.records, [
    { attachmentId: 'sha256:good', description: '好图描述' },
    { attachmentId: 'sha256:bad', description: '描述不可用' },
  ]);
});

test('缓存：同一 attachmentId 重复出现（含嵌套）→ describeImage 只调用一次，每条仍产出记录', async () => {
  let describeCalls = 0;
  const content: unknown[] = [
    imageBlock('sha256:same'),
    { type: 'tool_result', tool_use_id: 'tu_1', content: [imageBlock('sha256:same')] },
    imageBlock('sha256:same'),
  ];

  const result = await translateContent(content, {
    readImage: async () => Buffer.from('same', 'utf8'),
    describeImage: async () => {
      describeCalls += 1;
      return '同一张图';
    },
  });

  assert.equal(describeCalls, 1, '相同 attachmentId 应命中缓存，只请求一次下游');
  assert.deepEqual(result.content, [
    { type: 'text', text: '[Image 1] 同一张图' },
    {
      type: 'tool_result',
      tool_use_id: 'tu_1',
      content: [{ type: 'text', text: '[Image 2] 同一张图' }],
    },
    { type: 'text', text: '[Image 3] 同一张图' },
  ]);
  assert.deepEqual(result.records, [
    { attachmentId: 'sha256:same', description: '同一张图' },
    { attachmentId: 'sha256:same', description: '同一张图' },
    { attachmentId: 'sha256:same', description: '同一张图' },
  ]);
});

test('缓存：注入共享 cache 可跨调用命中——第二次调用不再请求下游，记录仍产出', async () => {
  const cache = new Map<string, string>();
  let describeCalls = 0;
  const deps = {
    readImage: async () => Buffer.from('shared', 'utf8'),
    describeImage: async () => {
      describeCalls += 1;
      return '跨调用缓存描述';
    },
    cache,
  };

  const first = await translateContent([imageBlock('sha256:shared')], deps);
  const second = await translateContent([imageBlock('sha256:shared')], deps);

  assert.equal(describeCalls, 1, '第二次调用应命中注入缓存，不再请求下游');
  assert.deepEqual(first.records, [
    { attachmentId: 'sha256:shared', description: '跨调用缓存描述' },
  ]);
  assert.deepEqual(second.records, [
    { attachmentId: 'sha256:shared', description: '跨调用缓存描述' },
  ]);
  assert.deepEqual(second.content, [{ type: 'text', text: '[Image 1] 跨调用缓存描述' }]);
});

test('缓存：失败不写入缓存——同一 attachmentId 重试时仍重新请求下游', async () => {
  let describeCalls = 0;
  const deps = {
    readImage: async () => Buffer.from('retry', 'utf8'),
    describeImage: async () => {
      describeCalls += 1;
      if (describeCalls === 1) throw new Error('第一次失败');
      return '重试成功';
    },
  };

  const first = await translateContent([imageBlock('sha256:retry')], deps);
  const second = await translateContent([imageBlock('sha256:retry')], deps);

  assert.equal(describeCalls, 2, '失败不缓存，重试应再次请求下游');
  assert.deepEqual(first.records, [
    { attachmentId: 'sha256:retry', description: '描述不可用' },
  ]);
  assert.deepEqual(second.records, [
    { attachmentId: 'sha256:retry', description: '重试成功' },
  ]);
});

test('intent 透传：deps.intent 传给每次 describeImage 调用', async () => {
  const intents: (string | undefined)[] = [];
  await translateContent([imageBlock('sha256:i')], {
    readImage: async () => Buffer.from('i', 'utf8'),
    describeImage: async (_bytes, intent) => {
      intents.push(intent);
      return 'ocr 结果';
    },
    intent: 'ocr',
  });

  assert.deepEqual(intents, ['ocr']);
});

test('空 content：无图时原样返回空数组，无记录，不调用下游', async () => {
  let calls = 0;
  const result = await translateContent([], {
    readImage: async () => {
      calls += 1;
      return Buffer.from('x', 'utf8');
    },
    describeImage: async () => {
      calls += 1;
      return '';
    },
  });

  assert.deepEqual(result.content, []);
  assert.deepEqual(result.records, []);
  assert.equal(calls, 0);
});

test('normalizeImageBlock：识别 {type:image, attachment:{attachmentId}} 并透传原始 attachment', () => {
  const attachment = { attachmentId: 'sha256:n', mediaType: 'image/png', bytes: 1, width: 1, height: 1 };
  const normalized = normalizeImageBlock({ type: 'image', attachment });

  assert.deepEqual(normalized, { attachmentId: 'sha256:n', attachment });
  assert.equal(normalized!.attachment, attachment, '应透传原始 attachment 引用（供 readImage）');
});

test('normalizeImageBlock：非图片 / 缺 attachment / 缺 attachmentId / 非对象均返回 null', () => {
  assert.equal(normalizeImageBlock({ type: 'text', text: 'hi' }), null);
  assert.equal(normalizeImageBlock({ type: 'tool_use', id: 'x' }), null);
  assert.equal(normalizeImageBlock({ type: 'image' }), null, '缺 attachment');
  assert.equal(normalizeImageBlock({ type: 'image', attachment: null }), null);
  assert.equal(normalizeImageBlock({ type: 'image', attachment: {} }), null, '缺 attachmentId');
  assert.equal(
    normalizeImageBlock({ type: 'image', attachment: { attachmentId: '' } }),
    null,
    '空 attachmentId',
  );
  assert.equal(
    normalizeImageBlock({ type: 'image', attachment: { attachmentId: 123 } }),
    null,
    '非字符串 attachmentId',
  );
  assert.equal(normalizeImageBlock(null), null);
  assert.equal(normalizeImageBlock('image'), null);
  assert.equal(normalizeImageBlock(undefined), null);
});
