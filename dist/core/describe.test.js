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
const path = __importStar(require("node:path"));
const describe_1 = require("./describe");
const config_1 = require("../config/config");
const mock_server_1 = require("../testing/mock-server");
const fixtures_1 = require("../testing/fixtures");
// describe 默认开启本地缓存，把 PERISCOPE_CACHE_DIR 指向临时目录，
// 避免本文件的网络路径测试把缓存条目写进真实 ~/.cache/periscope。
(0, node_test_1.before)(() => {
    process.env.PERISCOPE_CACHE_DIR = (0, fixtures_1.makeTempDir)('periscope-cache-test-');
});
(0, node_test_1.after)(() => {
    delete process.env.PERISCOPE_CACHE_DIR;
});
(0, node_test_1.test)('describe 通过 mock 端点发送 openai 协议请求并提取文本', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({ choices: [{ message: { content: '图片里有一座山' } }] }),
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        apiKey: 'sk-core',
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).config;
    const text = await (0, describe_1.describe)({ imagePath }, { config });
    assert.equal(text, '图片里有一座山');
    assert.equal(server.requests.length, 1);
    const req = server.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/chat/completions');
    assert.equal(req.headers['authorization'], 'Bearer sk-core');
    assert.equal(req.headers['content-type'], 'application/json');
    const body = req.jsonBody;
    assert.equal(body.model, 'qwen-vl-max');
    assert.equal(body.messages[0].content[1].type, 'image_url');
    assert.ok(body.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'));
});
(0, node_test_1.test)('describe 透传 intent 到 text 部分', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).config;
    await (0, describe_1.describe)({ imagePath, intent: '用中文描述颜色' }, { config });
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[0].text, '用中文描述颜色');
});
(0, node_test_1.test)('describe 端点返回非 2xx 时抛错', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 401,
        defaultBody: '{"error":"unauthorized"}',
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).config;
    await assert.rejects((0, describe_1.describe)({ imagePath }, { config }), /HTTP 401/);
});
(0, node_test_1.test)('describe 2xx 但响应非 JSON 时透传原始文本', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 200,
        defaultBody: '这是一个纯文本描述',
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).config;
    const text = await (0, describe_1.describe)({ imagePath }, { config });
    assert.equal(text, '这是一个纯文本描述');
});
(0, node_test_1.test)('describe 图片文件不存在时抛错', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const config = (0, fixtures_1.writeConfigFile)(dir, { apiKey: 'sk' }).config;
    await assert.rejects((0, describe_1.describe)({ imagePath: path.join(dir, 'missing.png') }, { config }), /无法读取图片文件/);
});
(0, node_test_1.test)('describe 接受 http(s) URL 图片：请求 body 的 image_url.url 透传该 URL', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        apiKey: 'sk-core',
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).config;
    const text = await (0, describe_1.describe)({ imagePath: 'https://example.com/cat.png' }, { config });
    assert.equal(text, 'mock 默认描述');
    assert.equal(server.requests.length, 1);
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[1].image_url.url, 'https://example.com/cat.png');
});
(0, node_test_1.test)('describeMany 并行请求多图并按输入顺序聚合', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)()).config;
    const fakeTransport = {
        async post(req) {
            const url = req.body.messages[0].content[1].image_url.url;
            const text = url.includes('first') ? '第一张描述' : '第二张描述';
            return {
                status: 200,
                ok: true,
                text: JSON.stringify({ choices: [{ message: { content: text } }] }),
            };
        },
    };
    const results = await (0, describe_1.describeMany)([
        { imagePath: 'https://example.com/first.png' },
        { imagePath: 'https://example.com/second.png' },
    ], { transport: fakeTransport, config });
    assert.equal(results.length, 2);
    assert.equal(results[0].source, 'https://example.com/first.png');
    assert.equal(results[0].description, '第一张描述');
    assert.equal(results[0].error, undefined);
    assert.equal(results[1].source, 'https://example.com/second.png');
    assert.equal(results[1].description, '第二张描述');
    assert.equal(results[1].error, undefined);
});
(0, node_test_1.test)('describeMany 逐图容错：单图失败不丢其余成功结果', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)()).config;
    const fakeTransport = {
        async post(req) {
            const url = req.body.messages[0].content[1].image_url.url;
            if (url.includes('bad')) {
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
        { imagePath: 'https://example.com/good.png' },
        { imagePath: 'https://example.com/bad.png' },
    ], { transport: fakeTransport, config });
    assert.equal(results.length, 2);
    assert.equal(results[0].source, 'https://example.com/good.png');
    assert.equal(results[0].description, '好图描述', '成功图应保留描述');
    assert.equal(results[1].source, 'https://example.com/bad.png');
    assert.equal(results[1].description, null, '失败图应标记为 null 而非整体抛错');
    assert.ok(results[1].error !== undefined, '失败图应携带失败原因');
    assert.match(results[1].error ?? '', /HTTP 500/);
});
(0, node_test_1.test)('describeMany 多图同时发起请求（并行度）', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)()).config;
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
        { imagePath: 'https://example.com/a.png' },
        { imagePath: 'https://example.com/b.png' },
    ], { transport: fakeTransport, config });
    assert.equal(results.length, 2);
    assert.equal(maxActive, 2, '两个请求应同时并发发出');
});
(0, node_test_1.test)('describe 未注入配置时走 loadConfig：环境变量优先于文件 apiKey', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        apiKey: 'sk-file',
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const pathBefore = process.env.PERISCOPE_CONFIG;
    const keyBefore = process.env.PERISCOPE_API_KEY;
    process.env.PERISCOPE_CONFIG = configPath;
    process.env.PERISCOPE_API_KEY = 'sk-env';
    try {
        const text = await (0, describe_1.describe)({ imagePath });
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
(0, node_test_1.test)('describe 通过 mock 端点发送 anthropic v1/messages 请求并提取文本', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({
            content: [{ type: 'text', text: '图片里有一座山' }],
        }),
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        protocol: 'anthropic',
        apiKey: 'sk-ant-core',
        anthropic: { ...config_1.DEFAULT_CONFIG.anthropic, baseUrl: server.baseUrl },
    }).config;
    const text = await (0, describe_1.describe)({ imagePath }, { config });
    assert.equal(text, '图片里有一座山');
    assert.equal(server.requests.length, 1);
    const req = server.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/v1/messages');
    assert.equal(req.headers['x-api-key'], 'sk-ant-core');
    assert.equal(req.headers['anthropic-version'], '2023-06-01');
    assert.equal(req.headers['content-type'], 'application/json');
    const body = req.jsonBody;
    assert.equal(body.model, config_1.DEFAULT_CONFIG.anthropic.model);
    assert.equal(body.messages[0].content[0].text, '描述这张图片');
    assert.equal(body.messages[0].content[1].type, 'image');
    assert.equal(body.messages[0].content[1].source.type, 'base64');
    assert.equal(body.messages[0].content[1].source.media_type, 'image/png');
    assert.ok(typeof body.messages[0].content[1].source.data === 'string' &&
        body.messages[0].content[1].source.data.length > 0, 'anthropic image data 应为 base64 字符串');
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
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        protocol: 'responses',
        apiKey: 'sk-resp-core',
        responses: { ...config_1.DEFAULT_CONFIG.responses, baseUrl: server.baseUrl },
    }).config;
    const text = await (0, describe_1.describe)({ imagePath }, { config });
    assert.equal(text, '图片里有一条河');
    assert.equal(server.requests.length, 1);
    const req = server.requests[0];
    assert.equal(req.method, 'POST');
    assert.equal(req.url, '/responses');
    assert.equal(req.headers['authorization'], 'Bearer sk-resp-core');
    assert.equal(req.headers['content-type'], 'application/json');
    const body = req.jsonBody;
    assert.equal(body.model, config_1.DEFAULT_CONFIG.responses.model);
    assert.equal(body.input[0].content[0].type, 'input_text');
    assert.equal(body.input[0].content[0].text, '描述这张图片');
    assert.equal(body.input[0].content[1].type, 'input_image');
    assert.ok(body.input[0].content[1].image_url.startsWith('data:image/png;base64,'));
});
(0, node_test_1.test)('describe 2xx 但 anthropic 响应非 JSON 时透传原始文本', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 200,
        defaultBody: '纯文本的 anthropic 描述',
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        protocol: 'anthropic',
        anthropic: { ...config_1.DEFAULT_CONFIG.anthropic, baseUrl: server.baseUrl },
    }).config;
    const text = await (0, describe_1.describe)({ imagePath }, { config });
    assert.equal(text, '纯文本的 anthropic 描述');
});
(0, node_test_1.test)('describe 2xx 但 responses 响应非 JSON 时透传原始文本', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 200,
        defaultBody: '纯文本的 responses 描述',
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        protocol: 'responses',
        responses: { ...config_1.DEFAULT_CONFIG.responses, baseUrl: server.baseUrl },
    }).config;
    const text = await (0, describe_1.describe)({ imagePath }, { config });
    assert.equal(text, '纯文本的 responses 描述');
});
(0, node_test_1.test)('describe anthropic 端点返回非 2xx 时抛错', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 429,
        defaultBody: '{"error":"rate limited"}',
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        protocol: 'anthropic',
        anthropic: { ...config_1.DEFAULT_CONFIG.anthropic, baseUrl: server.baseUrl },
    }).config;
    await assert.rejects((0, describe_1.describe)({ imagePath }, { config }), /HTTP 429/);
});
(0, node_test_1.test)('describe anthropic 协议 + http URL 远程图：请求 body 的 image source 为 url 类型', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({
            content: [{ type: 'text', text: 'URL 图描述' }],
        }),
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        protocol: 'anthropic',
        apiKey: 'sk-ant-core',
        anthropic: { ...config_1.DEFAULT_CONFIG.anthropic, baseUrl: server.baseUrl },
    }).config;
    const text = await (0, describe_1.describe)({ imagePath: 'https://example.com/cat.png' }, { config });
    assert.equal(text, 'URL 图描述');
    assert.equal(server.requests.length, 1);
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[1].type, 'image');
    assert.equal(body.messages[0].content[1].source.type, 'url');
    assert.equal(body.messages[0].content[1].source.url, 'https://example.com/cat.png');
});
