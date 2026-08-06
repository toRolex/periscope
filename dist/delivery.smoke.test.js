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
const node_child_process_1 = require("node:child_process");
const node_util_1 = require("node:util");
const config_1 = require("./config/config");
const mock_server_1 = require("./testing/mock-server");
const fixtures_1 = require("./testing/fixtures");
const execFileP = (0, node_util_1.promisify)(node_child_process_1.execFile);
/** 编译后测试位于 dist/，CLI 与 hook 入口即同目录产物。 */
const CLI_ENTRY = path.join(__dirname, 'cli', 'index.js');
const HOOK_ENTRY = path.join(__dirname, 'hook', 'index.js');
function smokeEnv(configPath) {
    return {
        ...process.env,
        PERISCOPE_CONFIG: configPath,
        PERISCOPE_API_KEY: 'sk-smoke',
        // 隔离真实 HOME 与缓存，避免 smoke 污染用户目录
        HOME: (0, fixtures_1.makeTempDir)('periscope-smoke-home-'),
        PERISCOPE_CACHE_DIR: (0, fixtures_1.makeTempDir)('periscope-smoke-cache-'),
    };
}
/** spawn 编译后 hook，写入 stdin JSON，返回 stdout/stderr/退出码。 */
function runHook(stdin, env) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(process.execPath, [HOOK_ENTRY], { env });
        let stdout = '';
        let stderr = '';
        child.stdout.on('data', (chunk) => {
            stdout += chunk.toString();
        });
        child.stderr.on('data', (chunk) => {
            stderr += chunk.toString();
        });
        child.on('error', reject);
        child.on('close', (code) => {
            resolve({ stdout, stderr, code: code ?? -1 });
        });
        child.stdin.write(stdin);
        child.stdin.end();
    });
}
(0, node_test_1.test)('smoke: README 描述的 CLI 单图用法端到端可运行（mock 端点）', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({ choices: [{ message: { content: '窗台上的猫' } }] }),
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
        '描述这张图片',
    ], { env: smokeEnv(configPath) });
    assert.equal(stdout, '窗台上的猫\n', '单图应输出纯文本描述');
    assert.equal(stderr, '');
});
(0, node_test_1.test)('smoke: CLI 多图 + URL 远程图逐行输出 ${source}: ${desc}', async (t) => {
    const dir = (0, fixtures_1.makeTempDir)();
    const img1 = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const server = await (0, mock_server_1.createMockServer)({
        handler: (req) => {
            const url = req.jsonBody.messages[0].content[1].image_url.url;
            const content = url.startsWith('data:image/png;base64,') ? '本地图描述' : 'URL 图描述';
            return { status: 200, body: JSON.stringify({ choices: [{ message: { content } }] }) };
        },
    });
    t.after(() => server.close());
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const url = 'https://example.com/cat.png';
    const { stdout, stderr } = await execFileP(process.execPath, [
        CLI_ENTRY,
        'describe',
        img1,
        url,
    ], { env: smokeEnv(configPath) });
    assert.equal(stdout, `${img1}: 本地图描述\n${url}: URL 图描述\n`, '多图应逐行 ${source}: ${desc}');
    assert.equal(stderr, '');
    assert.equal(server.requests.length, 2);
});
(0, node_test_1.test)('smoke: README 描述的 hook 贴图注入端到端可运行（mock 端点）', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({ choices: [{ message: { content: 'mock 描述' } }] }),
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const img1 = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const img2 = (0, fixtures_1.writeFixtureImage)(dir, 'b.png');
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const stdin = JSON.stringify({
        session_id: 'smoke-1',
        hook_event_name: 'UserPromptSubmit',
        prompt: '看图',
        image_count: 2,
        image_paths: [img1, img2],
    });
    const { stdout, stderr, code } = await runHook(stdin, smokeEnv(configPath));
    const parsed = JSON.parse(stdout);
    assert.equal(code, 0);
    assert.equal(stderr, '');
    assert.equal(parsed.decision, 'approve', 'hook 始终放行');
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(parsed.hookSpecificOutput.additionalContext, /\[Image 1\] a\.png: mock 描述/);
    assert.match(parsed.hookSpecificOutput.additionalContext, /\[Image 2\] b\.png: mock 描述/);
});
(0, node_test_1.test)('smoke: hook 无图片时放行且 additionalContext 为空串', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = (0, fixtures_1.writeConfigFile)(dir).path;
    const stdin = JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        prompt: '无图',
        image_paths: [],
    });
    const { stdout, code } = await runHook(stdin, smokeEnv(configPath));
    const parsed = JSON.parse(stdout);
    assert.equal(code, 0);
    assert.equal(parsed.decision, 'approve');
    assert.equal(parsed.hookSpecificOutput.additionalContext, '');
    assert.equal(server.requests.length, 0, '无图不应发视觉请求');
});
