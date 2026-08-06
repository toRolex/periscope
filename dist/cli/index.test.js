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
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const config_1 = require("../config/config");
const mock_server_1 = require("../testing/mock-server");
const fixtures_1 = require("../testing/fixtures");
const execFileP = (0, node_util_1.promisify)(node_child_process_1.execFile);
/** 编译后测试位于 dist/cli/，CLI 入口即同目录的 index.js。 */
const CLI_ENTRY = path.join(__dirname, 'index.js');
function cliEnv(configPath) {
    return {
        ...process.env,
        PERISCOPE_CONFIG: configPath,
        PERISCOPE_API_KEY: 'sk-cli',
        // 隔离真实 HOME，避免 CLI 意外写入用户配置目录
        HOME: (0, fixtures_1.makeTempDir)('periscope-cli-home-'),
    };
}
(0, node_test_1.test)('CLI describe 输出纯文本描述到 stdout 并以 0 退出', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({ choices: [{ message: { content: '一只猫' } }] }),
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const { stdout, stderr } = await execFileP(process.execPath, [
        CLI_ENTRY,
        'describe',
        imagePath,
        '--intent',
        '看看猫',
    ], { env: cliEnv(configPath) });
    assert.equal(stdout, '一只猫\n');
    assert.equal(stderr, '');
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[0].text, '看看猫');
    assert.equal(body.messages[0].content[1].image_url.url.startsWith('data:image/png;base64,'), true);
});
(0, node_test_1.test)('CLI 首次运行自动生成默认配置文件（openai + DashScope 端点）', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = path.join(dir, 'fresh', 'config.json');
    const err = await execFileP(process.execPath, [
        CLI_ENTRY,
        'describe',
        path.join(dir, 'nope.png'),
    ], { env: cliEnv(configPath) }).catch((e) => e);
    assert.notEqual(err.code, 0);
    assert.ok(fs.existsSync(configPath), '配置文件应被懒创建');
    const written = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
    assert.equal(written.protocol, 'openai');
    assert.equal(written.apiKey, '');
    assert.equal(written.openai.baseUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
});
(0, node_test_1.test)('CLI 缺少图片路径 → stderr 报错 + 非零退出码', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = (0, fixtures_1.writeConfigFile)(dir).path;
    const err = await execFileP(process.execPath, [CLI_ENTRY, 'describe'], {
        env: cliEnv(configPath),
    }).catch((e) => e);
    assert.notEqual(err.code, 0);
    assert.match(err.stderr, /缺少图片路径/);
    assert.match(err.stderr, /用法/);
});
(0, node_test_1.test)('CLI 图片不存在 → stderr 报错 + 非零退出码', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = (0, fixtures_1.writeConfigFile)(dir, { apiKey: 'sk' }).path;
    const err = await execFileP(process.execPath, [
        CLI_ENTRY,
        'describe',
        path.join(dir, 'nope.png'),
    ], { env: cliEnv(configPath) }).catch((e) => e);
    assert.notEqual(err.code, 0);
    assert.match(err.stderr, /无法读取图片文件/);
});
(0, node_test_1.test)('CLI 端点返回 500 → stderr 报错 + 非零退出码', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultStatus: 500,
        defaultBody: 'server error',
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const imagePath = (0, fixtures_1.writeFixtureImage)(dir);
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const err = await execFileP(process.execPath, [CLI_ENTRY, 'describe', imagePath], {
        env: cliEnv(configPath),
    }).catch((e) => e);
    assert.notEqual(err.code, 0);
    assert.match(err.stderr, /HTTP 500/);
});
(0, node_test_1.test)('CLI 未知命令 → stderr 用法 + 非零退出码', async () => {
    const err = await execFileP(process.execPath, [CLI_ENTRY, 'foo'], {
        env: cliEnv((0, fixtures_1.makeTempDir)()),
    }).catch((e) => e);
    assert.notEqual(err.code, 0);
    assert.match(err.stderr, /用法/);
});
