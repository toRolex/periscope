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
