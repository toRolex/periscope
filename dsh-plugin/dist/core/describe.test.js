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
const describe_1 = require("./describe");
const templates_1 = require("./templates");
const mock_server_1 = require("../testing/mock-server");
const fixtures_1 = require("../testing/fixtures");
/**
 * describe 引擎（dsh 版）测试：输入为图片字节（Uint8Array），其余行为对齐主仓 describe.test.ts。
 * 复用同一 mock 视觉端点 seam（本地 127.0.0.1 mock server + transport/config 注入），全程离线。
 */
/** fixture 图片字节（1x1 PNG）；mock 端点不校验图片内容，用于验证字节 → data URL 的精确回传。 */
const PNG_BYTES = Buffer.from(fixtures_1.PNG_1PX_BASE64, 'base64');
(0, node_test_1.test)('describe 通过 mock 端点发送 openai 协议请求并提取文本（图片字节 → data URL 精确回传）', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({ choices: [{ message: { content: '图片里有一座山' } }] }),
    });
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        apiKey: 'sk-core',
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    const text = await (0, describe_1.describe)({ bytes: PNG_BYTES }, { config });
    assert.equal(text, '图片里有一座山');
    assert.equal(server.requests.length, 1);
    const req = server.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/chat/completions');
    assert.equal(req.headers['authorization'], 'Bearer sk-core');
    assert.equal(req.headers['content-type'], 'application/json');
    const body = req.jsonBody;
    assert.equal(body.model, 'vision-model');
    assert.equal(body.messages[0].content[1].type, 'image_url');
    assert.equal(body.messages[0].content[1].image_url.url, `data:image/png;base64,${fixtures_1.PNG_1PX_BASE64}`, '图片字节应精确 base64 回传进 data URL');
});
(0, node_test_1.test)('describe 空 apiKey（本地无鉴权端点）→ 请求不携带鉴权头', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        apiKey: '',
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    const text = await (0, describe_1.describe)({ bytes: PNG_BYTES }, { config });
    assert.equal(text, 'mock 默认描述');
    assert.equal(server.requests.length, 1);
    const req = server.requests[0];
    assert.equal(req.headers['authorization'], undefined, '空 apiKey 不应发送 authorization 头');
    assert.equal(req.headers['x-api-key'], undefined, '空 apiKey 不应发送 x-api-key 头');
});
(0, node_test_1.test)('describe 注入空白模板 config（baseUrl/model 为空串）时抛出可操作报错并提示运行 init', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)()).config; // 空白模板：三协议 baseUrl/model 均为空串
    await assert.rejects((0, describe_1.describe)({ bytes: PNG_BYTES }, { config }), /协议 openai 未配置 baseUrl\/model，请运行 init/);
});
(0, node_test_1.test)('describe 空端点 config 时不发起任何请求（transport 不被调用）', async () => {
    let calls = 0;
    const fakeTransport = {
        async post() {
            calls += 1;
            return { status: 200, ok: true, text: '{}' };
        },
    };
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)()).config; // 空白模板
    await assert.rejects((0, describe_1.describe)({ bytes: PNG_BYTES }, { config, transport: fakeTransport }), /未配置 baseUrl\/model/);
    assert.equal(calls, 0, '空端点不应发出请求');
});
(0, node_test_1.test)('describe 只缺 baseUrl 时同样报错并提示运行 init', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        openai: { baseUrl: '', model: 'vision-model' },
    }).config;
    await assert.rejects((0, describe_1.describe)({ bytes: PNG_BYTES }, { config }), /协议 openai 未配置 baseUrl\/model，请运行 init/);
});
(0, node_test_1.test)('describe 透传 intent 到 text 部分', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    await (0, describe_1.describe)({ bytes: PNG_BYTES, intent: '用中文描述颜色' }, { config });
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[0].text, '用中文描述颜色');
});
(0, node_test_1.test)('describe intent 为 ocr 时请求体使用 OCR 模板 prompt', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    await (0, describe_1.describe)({ bytes: PNG_BYTES, intent: 'ocr' }, { config });
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[0].text, templates_1.TASK_TEMPLATES.ocr);
});
(0, node_test_1.test)('describe intent 为 table 时请求体使用 table 模板 prompt', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    await (0, describe_1.describe)({ bytes: PNG_BYTES, intent: 'table' }, { config });
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[0].text, templates_1.TASK_TEMPLATES.table);
});
(0, node_test_1.test)('describe intent 为 chart 时请求体使用 chart 模板 prompt', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    await (0, describe_1.describe)({ bytes: PNG_BYTES, intent: 'chart' }, { config });
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[0].text, templates_1.TASK_TEMPLATES.chart);
});
(0, node_test_1.test)('describe 自定义 intent 原样透传：模板名保留字之外的文本不被模板化', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    await (0, describe_1.describe)({ bytes: PNG_BYTES, intent: '把图片中的表格整理成要点' }, { config });
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[0].text, '把图片中的表格整理成要点');
    assert.notEqual(body.messages[0].content[0].text, templates_1.TASK_TEMPLATES.table);
});
(0, node_test_1.test)('describe intent 为 ocr 在 anthropic 协议请求体使用 OCR 模板 prompt', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        protocol: 'anthropic',
        anthropic: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    await (0, describe_1.describe)({ bytes: PNG_BYTES, intent: 'ocr' }, { config });
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[0].text, templates_1.TASK_TEMPLATES.ocr);
});
(0, node_test_1.test)('describe intent 为 table 在 responses 协议请求体使用 table 模板 prompt', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        protocol: 'responses',
        responses: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    await (0, describe_1.describe)({ bytes: PNG_BYTES, intent: 'table' }, { config });
    const body = server.requests[0].jsonBody;
    assert.equal(body.input[0].content[0].text, templates_1.TASK_TEMPLATES.table);
});
(0, node_test_1.test)('describe 端点返回非 2xx 时抛错', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 401,
        defaultBody: '{"error":"unauthorized"}',
    });
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    await assert.rejects((0, describe_1.describe)({ bytes: PNG_BYTES }, { config }), /HTTP 401/);
});
(0, node_test_1.test)('describe 2xx 但响应非 JSON 时透传原始文本', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 200,
        defaultBody: '这是一个纯文本描述',
    });
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    const text = await (0, describe_1.describe)({ bytes: PNG_BYTES }, { config });
    assert.equal(text, '这是一个纯文本描述');
});
(0, node_test_1.test)('describe 尊重调用方 mimeType：image/jpeg 字节 → data URL 前缀为 image/jpeg', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    await (0, describe_1.describe)({ bytes: PNG_BYTES, mimeType: 'image/jpeg' }, { config });
    const body = server.requests[0].jsonBody;
    assert.ok(body.messages[0].content[1].image_url.url.startsWith('data:image/jpeg;base64,'));
});
(0, node_test_1.test)('describe 通过 mock 端点发送 anthropic v1/messages 请求并提取文本', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({
            content: [{ type: 'text', text: '图片里有一座山' }],
        }),
    });
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        protocol: 'anthropic',
        apiKey: 'sk-ant-core',
        anthropic: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    const text = await (0, describe_1.describe)({ bytes: PNG_BYTES }, { config });
    assert.equal(text, '图片里有一座山');
    assert.equal(server.requests.length, 1);
    const req = server.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/messages');
    assert.equal(req.headers['x-api-key'], 'sk-ant-core');
    assert.equal(req.headers['anthropic-version'], '2023-06-01');
    assert.equal(req.headers['content-type'], 'application/json');
    const body = req.jsonBody;
    assert.equal(body.model, 'vision-model');
    assert.equal(body.messages[0].content[0].text, '描述这张图片');
    assert.equal(body.messages[0].content[1].type, 'image');
    assert.equal(body.messages[0].content[1].source.type, 'base64');
    assert.equal(body.messages[0].content[1].source.media_type, 'image/png');
    assert.equal(body.messages[0].content[1].source.data, fixtures_1.PNG_1PX_BASE64, 'anthropic image data 应为图片字节的精确 base64');
});
(0, node_test_1.test)('describe 通过 mock 端点发送 responses v1/responses 请求并提取文本', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({
            output: [
                {
                    type: 'message',
                    role: 'assistant',
                    content: [{ type: 'output_text', text: '图片里有一条河' }],
                },
            ],
        }),
    });
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        protocol: 'responses',
        apiKey: 'sk-resp-core',
        responses: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    const text = await (0, describe_1.describe)({ bytes: PNG_BYTES }, { config });
    assert.equal(text, '图片里有一条河');
    assert.equal(server.requests.length, 1);
    const req = server.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/responses');
    assert.equal(req.headers['authorization'], 'Bearer sk-resp-core');
    assert.equal(req.headers['content-type'], 'application/json');
    const body = req.jsonBody;
    assert.equal(body.model, 'vision-model');
    assert.equal(body.input[0].content[0].type, 'input_text');
    assert.equal(body.input[0].content[0].text, '描述这张图片');
    assert.equal(body.input[0].content[1].type, 'input_image');
    assert.equal(body.input[0].content[1].image_url, `data:image/png;base64,${fixtures_1.PNG_1PX_BASE64}`);
});
(0, node_test_1.test)('describe 2xx 但 anthropic 响应非 JSON 时透传原始文本', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 200,
        defaultBody: '纯文本的 anthropic 描述',
    });
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        protocol: 'anthropic',
        anthropic: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    const text = await (0, describe_1.describe)({ bytes: PNG_BYTES }, { config });
    assert.equal(text, '纯文本的 anthropic 描述');
});
(0, node_test_1.test)('describe 2xx 但 responses 响应非 JSON 时透传原始文本', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 200,
        defaultBody: '纯文本的 responses 描述',
    });
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        protocol: 'responses',
        responses: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    const text = await (0, describe_1.describe)({ bytes: PNG_BYTES }, { config });
    assert.equal(text, '纯文本的 responses 描述');
});
(0, node_test_1.test)('describe anthropic 端点返回非 2xx 时抛错', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 429,
        defaultBody: '{"error":"rate limited"}',
    });
    t.after(() => server.close());
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), {
        protocol: 'anthropic',
        anthropic: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).config;
    await assert.rejects((0, describe_1.describe)({ bytes: PNG_BYTES }, { config }), /HTTP 429/);
});
(0, node_test_1.test)('describeMany 并行请求多图并按输入顺序聚合；未传 source 时回退为「图片 N」', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), { openai: (0, fixtures_1.readyEndpoint)('https://example.com') }).config;
    const fakeTransport = {
        async post(req) {
            const url = req.body.messages[0].content[1].image_url.url;
            // Buffer.from('first'/'second', 'utf8') 的 base64 前缀分别为 'Zmlyc3Q' / 'c2Vjb25k'
            const text = url.includes('Zmlyc3Q') ? '第一张描述' : '第二张描述';
            return {
                status: 200,
                ok: true,
                text: JSON.stringify({ choices: [{ message: { content: text } }] }),
            };
        },
    };
    const results = await (0, describe_1.describeMany)([
        { bytes: Buffer.from('first', 'utf8') },
        { bytes: Buffer.from('second', 'utf8') },
    ], { transport: fakeTransport, config });
    assert.equal(results.length, 2);
    assert.equal(results[0].source, '图片 1');
    assert.equal(results[0].description, '第一张描述');
    assert.equal(results[0].error, undefined);
    assert.equal(results[1].source, '图片 2');
    assert.equal(results[1].description, '第二张描述');
    assert.equal(results[1].error, undefined);
});
(0, node_test_1.test)('describeMany 回显调用方 source 标识（供桥接层定位图片 / attachment）', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), { openai: (0, fixtures_1.readyEndpoint)('https://example.com') }).config;
    const fakeTransport = {
        async post() {
            return {
                status: 200,
                ok: true,
                text: JSON.stringify({ choices: [{ message: { content: '描述' } }] }),
            };
        },
    };
    const results = await (0, describe_1.describeMany)([
        { bytes: Buffer.from('a', 'utf8'), source: 'attach-0' },
        { bytes: Buffer.from('b', 'utf8'), source: 'attach-1' },
    ], { transport: fakeTransport, config });
    assert.equal(results[0].source, 'attach-0');
    assert.equal(results[1].source, 'attach-1');
});
(0, node_test_1.test)('describeMany 逐图容错：单图失败不丢其余成功结果', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), { openai: (0, fixtures_1.readyEndpoint)('https://example.com') }).config;
    const fakeTransport = {
        async post(req) {
            const url = req.body.messages[0].content[1].image_url.url;
            // Buffer.from('bad', 'utf8') 的 base64 为 'YmFk'
            if (url.includes('YmFk')) {
                return { status: 500, ok: false, text: 'boom' };
            }
            return {
                status: 200,
                ok: true,
                text: JSON.stringify({ choices: [{ message: { content: '好图描述' } }] }),
            };
        },
    };
    const results = await (0, describe_1.describeMany)([
        { bytes: Buffer.from('good', 'utf8'), source: '好图' },
        { bytes: Buffer.from('bad', 'utf8'), source: '坏图' },
    ], { transport: fakeTransport, config });
    assert.equal(results.length, 2);
    assert.equal(results[0].source, '好图');
    assert.equal(results[0].description, '好图描述', '成功图应保留描述');
    assert.equal(results[1].source, '坏图');
    assert.equal(results[1].description, null, '失败图应标记为 null 而非整体抛错');
    assert.ok(results[1].error !== undefined, '失败图应携带失败原因');
    assert.match(results[1].error ?? '', /HTTP 500/);
});
(0, node_test_1.test)('describeMany 多图同时发起请求（并行度）', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)(), { openai: (0, fixtures_1.readyEndpoint)('https://example.com') }).config;
    let active = 0;
    let maxActive = 0;
    const fakeTransport = {
        async post() {
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 30));
            active -= 1;
            return {
                status: 200,
                ok: true,
                text: JSON.stringify({ choices: [{ message: { content: '描述' } }] }),
            };
        },
    };
    const results = await (0, describe_1.describeMany)([
        { bytes: Buffer.from('a', 'utf8') },
        { bytes: Buffer.from('b', 'utf8') },
    ], { transport: fakeTransport, config });
    assert.equal(results.length, 2);
    assert.equal(maxActive, 2, '两个请求应同时并发发出');
});
(0, node_test_1.test)('describe 未注入配置时走 loadConfig：环境变量优先于文件 apiKey', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        apiKey: 'sk-file',
        openai: (0, fixtures_1.readyEndpoint)(server.baseUrl),
    }).path;
    const pathBefore = process.env.PERISCOPE_CONFIG;
    const keyBefore = process.env.PERISCOPE_API_KEY;
    process.env.PERISCOPE_CONFIG = configPath;
    process.env.PERISCOPE_API_KEY = 'sk-env';
    try {
        const text = await (0, describe_1.describe)({ bytes: PNG_BYTES });
        assert.equal(text, 'mock 默认描述');
        assert.equal(server.requests[0].headers['authorization'], 'Bearer sk-env');
    }
    finally {
        if (pathBefore === undefined)
            delete process.env.PERISCOPE_CONFIG;
        else
            process.env.PERISCOPE_CONFIG = pathBefore;
        if (keyBefore === undefined)
            delete process.env.PERISCOPE_API_KEY;
        else
            process.env.PERISCOPE_API_KEY = keyBefore;
    }
});
