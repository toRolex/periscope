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
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const describe_1 = require("./describe");
const mock_server_1 = require("../testing/mock-server");
const fixtures_1 = require("../testing/fixtures");
/** 每用例独立的临时缓存目录 + fixture 图片 + 指向 mock 端点的配置。 */
function setup(server) {
    const dir = (0, fixtures_1.makeTempDir)();
    const cacheDir = path.join(dir, 'cache');
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const config = (0, fixtures_1.writeConfigFile)(dir, {
        apiKey: 'sk-cache',
        openai: { baseUrl: server.baseUrl, model: 'vision-model' },
    }).config;
    return { dir, cacheDir, imagePath, config };
}
(0, node_test_1.test)('缓存命中：同 key 第二次 describe 复用上次结果，不发起视觉 API 请求', async (t) => {
    let calls = 0;
    const server = await (0, mock_server_1.createMockServer)({
        handler: () => {
            calls += 1;
            return {
                status: 200,
                body: JSON.stringify({ choices: [{ message: { content: `第${calls}次描述` } }] }),
            };
        },
    });
    t.after(() => server.close());
    const { cacheDir, imagePath, config } = setup(server);
    const first = await (0, describe_1.describe)({ imagePath }, { config, cacheDir });
    assert.equal(first, '第1次描述');
    const second = await (0, describe_1.describe)({ imagePath }, { config, cacheDir });
    assert.equal(second, '第1次描述', '命中缓存应返回上次结果，而非第2次的响应');
    assert.equal(calls, 1, '同 key 不应重复请求视觉 API');
    assert.equal(server.requests.length, 1);
});
(0, node_test_1.test)('缓存持久化：缓存条目落盘，同一 key 的多次调用只请求一次', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const { cacheDir, imagePath, config } = setup(server);
    await (0, describe_1.describe)({ imagePath }, { config, cacheDir });
    await (0, describe_1.describe)({ imagePath }, { config, cacheDir });
    await (0, describe_1.describe)({ imagePath }, { config, cacheDir });
    assert.equal(server.requests.length, 1, '三次 describe 应只发起一次请求');
});
(0, node_test_1.test)('图片修改时间变化后重新调用视觉 API', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const { cacheDir, imagePath, config } = setup(server);
    await (0, describe_1.describe)({ imagePath }, { config, cacheDir });
    assert.equal(server.requests.length, 1);
    const past = new Date(Date.now() - 60_000);
    fs.utimesSync(imagePath, past, past);
    await (0, describe_1.describe)({ imagePath }, { config, cacheDir });
    assert.equal(server.requests.length, 2, 'mtime 变化后应重新请求');
});
(0, node_test_1.test)('图片大小变化后重新调用视觉 API', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const { cacheDir, imagePath, config } = setup(server);
    await (0, describe_1.describe)({ imagePath }, { config, cacheDir });
    assert.equal(server.requests.length, 1);
    fs.writeFileSync(imagePath, 'changed-content');
    await (0, describe_1.describe)({ imagePath }, { config, cacheDir });
    assert.equal(server.requests.length, 2, '大小变化后应重新请求');
});
(0, node_test_1.test)('不同路径的图片各自独立请求，不复用缓存', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const { dir, cacheDir, config } = setup(server);
    const a = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const b = (0, fixtures_1.writeFixtureImage)(dir, 'b.png');
    await (0, describe_1.describe)({ imagePath: a }, { config, cacheDir });
    await (0, describe_1.describe)({ imagePath: b }, { config, cacheDir });
    assert.equal(server.requests.length, 2, '路径不同应各自请求');
});
(0, node_test_1.test)('同图同 intent 命中缓存；不同 intent 视为不同 key 重新请求', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const { cacheDir, imagePath, config } = setup(server);
    await (0, describe_1.describe)({ imagePath, intent: '看颜色' }, { config, cacheDir });
    await (0, describe_1.describe)({ imagePath, intent: '看颜色' }, { config, cacheDir });
    assert.equal(server.requests.length, 1, '同图同意图第二次应命中缓存');
    await (0, describe_1.describe)({ imagePath, intent: '看形状' }, { config, cacheDir });
    assert.equal(server.requests.length, 2, '同图不同意图应重新请求');
});
