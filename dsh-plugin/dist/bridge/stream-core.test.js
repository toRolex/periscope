"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
const node_test_1 = require("node:test");
const assert = __importStar(require("node:assert"));
const stream_core_1 = require("./stream-core");
/**
 * stream() 接线的纯逻辑测试（issue #29）：视觉配置 → describeImage、消息历史翻译、
 * image/described 落点。全程离线，注入 fake describeEngine / readImage / sink，不触碰 dsh 运行时
 * （dsh 集成壳 adapter.ts / plugin.ts 归手工 E2E，见 plugin.ts 注释）。
 */
/** 就绪的视觉端点配置（baseUrl/model 非空）。 */
function readyVision(overrides = {}) {
    return {
        protocol: 'openai',
        baseUrl: 'https://vision.example.com/v1',
        model: 'vision-model',
        apiKeyEnv: 'PERISCOPE_API_KEY',
        apiKey: 'sk-test',
        ...overrides,
    };
}
/** 构造最小图片 block（本包自定义结构，不依赖 dsh 真实类型）。 */
function imageBlock(attachmentId) {
    return { type: 'image', attachment: { attachmentId } };
}
// ── visionEndpointReady ──────────────────────────────────────────────────────
(0, node_test_1.test)('visionEndpointReady：baseUrl 与 model 均非空白 → 就绪', () => {
    assert.equal((0, stream_core_1.visionEndpointReady)(readyVision()), true);
});
(0, node_test_1.test)('visionEndpointReady：baseUrl 或 model 空白/空白串 → 未就绪', () => {
    assert.equal((0, stream_core_1.visionEndpointReady)(readyVision({ baseUrl: '' })), false);
    assert.equal((0, stream_core_1.visionEndpointReady)(readyVision({ model: '' })), false);
    assert.equal((0, stream_core_1.visionEndpointReady)(readyVision({ baseUrl: '   ' })), false, '空白串视为未配置');
    assert.equal((0, stream_core_1.visionEndpointReady)(readyVision({ model: '  ' })), false);
});
// ── ENDPOINT_NOT_CONFIGURED_GUIDANCE ─────────────────────────────────────────
(0, node_test_1.test)('引导占位符指出 cordis.yml 与 env 两个配置位置', () => {
    assert.match(stream_core_1.ENDPOINT_NOT_CONFIGURED_GUIDANCE, /cordis\.yml/);
    assert.match(stream_core_1.ENDPOINT_NOT_CONFIGURED_GUIDANCE, /PERISCOPE_VISION_BASE_URL/);
    assert.match(stream_core_1.ENDPOINT_NOT_CONFIGURED_GUIDANCE, /PERISCOPE_API_KEY/, '应指出 apiKey 的 env 位置');
});
// ── toPeriscopeConfig ────────────────────────────────────────────────────────
(0, node_test_1.test)('toPeriscopeConfig：端点放进激活协议段，apiKey 透传，其余协议段留空', () => {
    const cfg = (0, stream_core_1.toPeriscopeConfig)(readyVision({ protocol: 'openai' }));
    assert.equal(cfg.protocol, 'openai');
    assert.equal(cfg.apiKey, 'sk-test');
    assert.deepEqual(cfg.openai, { baseUrl: 'https://vision.example.com/v1', model: 'vision-model' });
    assert.deepEqual(cfg.anthropic, { baseUrl: '', model: '' });
    assert.deepEqual(cfg.responses, { baseUrl: '', model: '' });
});
(0, node_test_1.test)('toPeriscopeConfig：激活 anthropic 时端点进 anthropic 段', () => {
    const cfg = (0, stream_core_1.toPeriscopeConfig)(readyVision({ protocol: 'anthropic', baseUrl: 'https://anth.example.com', model: 'claude-vision' }));
    assert.equal(cfg.protocol, 'anthropic');
    assert.deepEqual(cfg.anthropic, { baseUrl: 'https://anth.example.com', model: 'claude-vision' });
    assert.deepEqual(cfg.openai, { baseUrl: '', model: '' });
});
// ── buildDescribeImage ───────────────────────────────────────────────────────
(0, node_test_1.test)('buildDescribeImage：已配置 → 调 describe 引擎，bytes/intent 与映射配置正确透传', async () => {
    const bytes = Buffer.from('img', 'utf8');
    const calls = [];
    const describeImage = (0, stream_core_1.buildDescribeImage)(readyVision(), async (input, opts) => {
        calls.push({ input, opts });
        return '一只猫';
    });
    const out = await describeImage(bytes, 'ocr');
    assert.equal(out, '一只猫');
    assert.equal(calls.length, 1);
    const { input, opts } = calls[0];
    assert.equal(input.bytes, bytes, '字节原样透传给 describe');
    assert.equal(input.intent, 'ocr', 'intent 透传');
    assert.equal(opts.config.protocol, 'openai');
    assert.equal(opts.config.openai.baseUrl, 'https://vision.example.com/v1');
});
(0, node_test_1.test)('buildDescribeImage：未配置 → 返回引导占位符，绝不请求下游', async () => {
    let calls = 0;
    const describeImage = (0, stream_core_1.buildDescribeImage)(readyVision({ baseUrl: '' }), async () => {
        calls += 1;
        throw new Error('不应被调用');
    });
    const out = await describeImage(Buffer.from('x', 'utf8'));
    assert.equal(out, stream_core_1.ENDPOINT_NOT_CONFIGURED_GUIDANCE);
    assert.equal(calls, 0, '未配置时不应调用 describe 引擎');
});
(0, node_test_1.test)('buildDescribeImage：超时 → reject（由 translateContent 降级为占位符，绝不悬挂会话）', async () => {
    const describeImage = (0, stream_core_1.buildDescribeImage)(readyVision(), () => new Promise(() => { }), // 永不解决，模拟悬挂端点
    { timeoutMs: 20 });
    await assert.rejects(describeImage(Buffer.from('x', 'utf8')), /超时/);
});
(0, node_test_1.test)('buildDescribeImage：默认超时为 DESCRIBE_TIMEOUT_MS', () => {
    assert.ok(stream_core_1.DESCRIBE_TIMEOUT_MS > 0);
});
// ── translateMessages ────────────────────────────────────────────────────────
(0, node_test_1.test)('translateMessages：纯文本历史 → 原 messages 数组原样返回（零改动委托），无记录', async () => {
    const messages = [
        { role: 'user', content: [{ type: 'text', text: '你好' }] },
        { role: 'assistant', content: [{ type: 'text', text: '你好！' }] },
    ];
    const result = await (0, stream_core_1.translateMessages)(messages, {
        readImage: async () => Buffer.from('x', 'utf8'),
        describeImage: async () => '不应调用',
    });
    assert.equal(result.messages, messages, '无图时应返回原 messages 数组（同一引用）');
    assert.deepEqual(result.records, []);
});
(0, node_test_1.test)('translateMessages：单条带图消息 → 该消息重建为文字，其余消息原引用透传', async () => {
    const textMsg = { role: 'user', content: [{ type: 'text', text: '看这张图' }] };
    const imageMsg = { role: 'user', content: [imageBlock('sha256:a')] };
    const result = await (0, stream_core_1.translateMessages)([textMsg, imageMsg], {
        readImage: async () => Buffer.from('a', 'utf8'),
        describeImage: async () => '一座山',
    });
    assert.notEqual(result.messages, [textMsg, imageMsg]);
    assert.equal(result.messages[0], textMsg, '无图消息按原引用透传');
    assert.deepEqual(result.messages[1].content, [{ type: 'text', text: '[Image 1] 一座山' }]);
    assert.equal(result.messages[1].role, 'user', '其余字段保留');
    assert.deepEqual(result.records, [{ attachmentId: 'sha256:a', description: '一座山' }]);
});
(0, node_test_1.test)('translateMessages：多图多消息 + 嵌套 tool-result 图 → 记录按序聚合', async () => {
    const messages = [
        { role: 'user', content: [imageBlock('sha256:a'), { type: 'text', text: '和' }, imageBlock('sha256:b')] },
        {
            role: 'user',
            content: [{ type: 'tool_result', tool_use_id: 'tu', content: [imageBlock('sha256:c')] }],
        },
    ];
    const result = await (0, stream_core_1.translateMessages)(messages, {
        readImage: async (att) => Buffer.from(String(att.attachmentId), 'utf8'),
        describeImage: async (bytes) => `desc:${Buffer.from(bytes).toString('utf8')}`,
    });
    assert.deepEqual(result.messages[0].content, [
        { type: 'text', text: '[Image 1] desc:sha256:a' },
        { type: 'text', text: '和' },
        { type: 'text', text: '[Image 2] desc:sha256:b' },
    ]);
    assert.deepEqual(result.messages[1].content, [
        {
            type: 'tool_result',
            tool_use_id: 'tu',
            content: [{ type: 'text', text: '[Image 1] desc:sha256:c' }],
        },
    ]);
    assert.deepEqual(result.records, [
        { attachmentId: 'sha256:a', description: 'desc:sha256:a' },
        { attachmentId: 'sha256:b', description: 'desc:sha256:b' },
        { attachmentId: 'sha256:c', description: 'desc:sha256:c' },
    ]);
});
(0, node_test_1.test)('translateMessages：共享 cache 跨调用命中 → 下游只请求一次，两次仍各产出记录（历史重放仍落 log）', async () => {
    const cache = new Map();
    let describeCalls = 0;
    const deps = {
        readImage: async () => Buffer.from('shared', 'utf8'),
        describeImage: async () => {
            describeCalls += 1;
            return '缓存描述';
        },
        cache,
    };
    const messages = [{ role: 'user', content: [imageBlock('sha256:shared')] }];
    const first = await (0, stream_core_1.translateMessages)(messages, deps);
    const second = await (0, stream_core_1.translateMessages)(messages, deps);
    assert.equal(describeCalls, 1, '同图再发应命中缓存，不重复请求下游');
    assert.deepEqual(first.records, [{ attachmentId: 'sha256:shared', description: '缓存描述' }]);
    assert.deepEqual(second.records, [{ attachmentId: 'sha256:shared', description: '缓存描述' }], '缓存命中仍产出记录（落 log）');
});
(0, node_test_1.test)('translateMessages：describeImage 失败 → 该图降级 [Image N] 描述不可用，不抛错，仍产出记录', async () => {
    const messages = [{ role: 'user', content: [imageBlock('sha256:boom')] }];
    const result = await (0, stream_core_1.translateMessages)(messages, {
        readImage: async () => Buffer.from('x', 'utf8'),
        describeImage: async () => {
            throw new Error('视觉端点 500');
        },
    });
    assert.deepEqual(result.messages[0].content, [{ type: 'text', text: '[Image 1] 描述不可用' }]);
    assert.deepEqual(result.records, [{ attachmentId: 'sha256:boom', description: '描述不可用' }]);
});
// ── makeImageDescribedSink ───────────────────────────────────────────────────
(0, node_test_1.test)('makeImageDescribedSink：写诊断日志 + append 到 session log（attachmentId → 描述）', () => {
    const appended = [];
    const infos = [];
    const sink = (0, stream_core_1.makeImageDescribedSink)({
        appendToSession: (sessionId, record) => appended.push({ sessionId, record }),
        logInfo: (m) => infos.push(m),
        logWarn: () => { },
    });
    const record = { attachmentId: 'sha256:a', description: '一座山' };
    sink.describe('sess-1', record);
    assert.deepEqual(appended, [{ sessionId: 'sess-1', record }]);
    assert.equal(infos.length, 1, '应同时写一份诊断日志（重启后可查）');
    assert.match(infos[0], /sha256:a/);
    assert.match(infos[0], /一座山/);
});
(0, node_test_1.test)('makeImageDescribedSink：sessionId 缺省 → 只写诊断日志，不 append', () => {
    let appends = 0;
    const infos = [];
    const sink = (0, stream_core_1.makeImageDescribedSink)({
        appendToSession: () => {
            appends += 1;
        },
        logInfo: (m) => infos.push(m),
        logWarn: () => { },
    });
    sink.describe(undefined, { attachmentId: 'sha256:x', description: 'd' });
    assert.equal(appends, 0);
    assert.equal(infos.length, 1);
});
(0, node_test_1.test)('makeImageDescribedSink：session append 抛错 → 捕获告警，绝不向上抛（不中断会话）', () => {
    const warns = [];
    const sink = (0, stream_core_1.makeImageDescribedSink)({
        appendToSession: () => {
            throw new Error('session 不可用');
        },
        logInfo: () => { },
        logWarn: (m) => warns.push(m),
    });
    sink.describe('sess-1', { attachmentId: 'sha256:a', description: 'd' }); // 不应抛错
    assert.equal(warns.length, 1);
});
// ── emitImageDescribed ───────────────────────────────────────────────────────
(0, node_test_1.test)('emitImageDescribed：逐条把记录交给 sink（含缓存命中的记录），携带 sessionId', () => {
    const calls = [];
    const sink = { describe: (sessionId, record) => calls.push({ sessionId, record }) };
    const records = [
        { attachmentId: 'sha256:a', description: '甲' },
        { attachmentId: 'sha256:b', description: '乙' },
    ];
    (0, stream_core_1.emitImageDescribed)(sink, 'sess-9', records);
    assert.deepEqual(calls, [
        { sessionId: 'sess-9', record: records[0] },
        { sessionId: 'sess-9', record: records[1] },
    ]);
});
