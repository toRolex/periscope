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
const index_1 = require("./index");
const config_1 = require("../config/config");
const mock_server_1 = require("../testing/mock-server");
const fixtures_1 = require("../testing/fixtures");
/** 编译后 hook 入口与 CLI 同模式：位于 dist/hook/index.js。 */
const HOOK_ENTRY = path.join(__dirname, 'index.js');
function hookEnv(configPath, cacheDir) {
    return {
        ...process.env,
        PERISCOPE_CONFIG: configPath,
        PERISCOPE_API_KEY: 'sk-hook',
        // 隔离真实 HOME 与缓存目录，避免 hook 污染用户目录
        HOME: (0, fixtures_1.makeTempDir)('periscope-hook-home-'),
        PERISCOPE_CACHE_DIR: cacheDir ?? (0, fixtures_1.makeTempDir)('periscope-hook-cache-'),
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
(0, node_test_1.test)('describeImageEntries 并行逐图容错：单图失败置 null 不阻塞其余', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)()).config;
    let active = 0;
    let maxActive = 0;
    const fakeTransport = {
        async post(req) {
            const url = req.body.messages[0].content[1].image_url.url;
            active += 1;
            maxActive = Math.max(maxActive, active);
            await new Promise((resolve) => setTimeout(resolve, 20));
            active -= 1;
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
    const results = await (0, index_1.describeImageEntries)(['https://example.com/good.png', 'https://example.com/bad.png'], { transport: fakeTransport, config });
    assert.equal(results.length, 2);
    assert.equal(results[0].path, 'https://example.com/good.png');
    assert.equal(results[0].description, '好图描述');
    assert.equal(results[1].path, 'https://example.com/bad.png');
    assert.equal(results[1].description, null, '失败图应记为 null 而非抛错');
    assert.equal(maxActive, 2, '两图请求应同时并发发出');
});
(0, node_test_1.test)('buildImageContext 格式化注入行：成功描述与失败占位符', () => {
    const ctx = (0, index_1.buildImageContext)([
        { path: '/tmp/a.png', description: '一只猫在窗台' },
        { path: '/tmp/b.png', description: null },
    ]);
    assert.equal(ctx, '[Image 1] a.png: 一只猫在窗台\n[Image 2] b.png: 描述不可用');
});
(0, node_test_1.test)('buildImageContext URL 图片 basename 取路径最后一段', () => {
    const ctx = (0, index_1.buildImageContext)([
        { path: 'https://example.com/dir/cat.png', description: '一只猫' },
    ]);
    assert.equal(ctx, '[Image 1] cat.png: 一只猫');
});
(0, node_test_1.test)('buildImageContext 字符预算：接近 9000 截断并注明剩余未描述张数', () => {
    const longDescription = '这是一段很长的图片描述。'.repeat(30); // ~330 chars
    const results = Array.from({ length: 100 }, (_, i) => ({
        path: `/tmp/img${i}.png`,
        description: i % 10 === 0 ? null : `${longDescription}#${i}`,
    }));
    const ctx = (0, index_1.buildImageContext)(results);
    const included = (ctx.match(/\[Image \d+\]/g) ?? []).length;
    assert.ok(included < 100, '描述总量远超预算时应发生截断');
    assert.ok(ctx.length <= 9200, `截断后应贴近预算而非失控: ${ctx.length}`);
    const remaining = 100 - included;
    assert.match(ctx, new RegExp(`（另有 ${remaining} 张图片未描述）`));
});
(0, node_test_1.test)('handleHookInput 无图片时放行且 additionalContext 为空串（2.1.x schema 必填）', async () => {
    const output = await (0, index_1.handleHookInput)({
        hook_event_name: 'UserPromptSubmit',
        prompt: '你好',
        image_paths: [],
    });
    assert.equal(output.decision, 'approve');
    assert.equal(output.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.equal(output.hookSpecificOutput.additionalContext, '', '带 hookSpecificOutput 时 additionalContext 必填，无图片注入空串');
});
(0, node_test_1.test)('handleHookInput 注入 additionalContext 并放行', async () => {
    const config = (0, fixtures_1.writeConfigFile)((0, fixtures_1.makeTempDir)()).config;
    const fakeTransport = {
        async post(req) {
            const url = req.body.messages[0].content[1].image_url.url;
            const content = url.includes('a.png') ? '第一张描述' : '第二张描述';
            return {
                status: 200,
                ok: true,
                text: JSON.stringify({ choices: [{ message: { content } }] }),
            };
        },
    };
    const output = await (0, index_1.handleHookInput)({
        hook_event_name: 'UserPromptSubmit',
        prompt: '看图',
        image_count: 2,
        image_paths: ['https://example.com/a.png', 'https://example.com/b.png'],
    }, { transport: fakeTransport, config });
    assert.equal(output.decision, 'approve');
    assert.equal(output.hookSpecificOutput.additionalContext, '[Image 1] a.png: 第一张描述\n[Image 2] b.png: 第二张描述');
});
(0, node_test_1.test)('hook stdin fixture：含 image_paths 的事件注入 additionalContext', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({ choices: [{ message: { content: 'mock 默认描述' } }] }),
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const img1 = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const img2 = (0, fixtures_1.writeFixtureImage)(dir, 'b.png');
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const stdin = JSON.stringify({
        session_id: 'abc123',
        hook_event_name: 'UserPromptSubmit',
        prompt: '看看这些图片',
        cwd: dir,
        image_count: 2,
        image_paths: [img1, img2],
    });
    const { stdout, stderr, code } = await runHook(stdin, hookEnv(configPath));
    const parsed = JSON.parse(stdout);
    assert.equal(code, 0);
    assert.equal(stderr, '');
    assert.equal(parsed.decision, 'approve');
    assert.equal(parsed.hookSpecificOutput.hookEventName, 'UserPromptSubmit');
    assert.match(parsed.hookSpecificOutput.additionalContext, /\[Image 1\] a\.png: mock 默认描述/);
    assert.match(parsed.hookSpecificOutput.additionalContext, /\[Image 2\] b\.png: mock 默认描述/);
    assert.equal(server.requests.length, 2);
});
(0, node_test_1.test)('hook 失败 fixture：单图描述失败注入占位符且仍放行', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const img1 = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const stdin = JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        prompt: '看图',
        image_count: 2,
        image_paths: [img1, path.join(dir, 'missing.png')],
    });
    const { stdout, code } = await runHook(stdin, hookEnv(configPath));
    const parsed = JSON.parse(stdout);
    assert.equal(code, 0);
    assert.equal(parsed.decision, 'approve');
    assert.match(parsed.hookSpecificOutput.additionalContext, /\[Image 1\] a\.png: mock 默认描述/);
    assert.match(parsed.hookSpecificOutput.additionalContext, /\[Image 2\] missing\.png: 描述不可用/);
    assert.equal(server.requests.length, 1, '缺失图不发请求，成功图只请求一次');
});
(0, node_test_1.test)('hook 复用缓存：同一图两次 hook 只发一次视觉请求', async (t) => {
    let calls = 0;
    const server = await (0, mock_server_1.createMockServer)({
        handler: () => {
            calls += 1;
            return { status: 200, body: JSON.stringify({ choices: [{ message: { content: '缓存描述' } }] }) };
        },
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const img = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const cacheDir = (0, fixtures_1.makeTempDir)('periscope-hook-cache-');
    const env = hookEnv(configPath, cacheDir);
    const stdin = JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        image_count: 1,
        image_paths: [img],
    });
    const first = await runHook(stdin, env);
    const second = await runHook(stdin, env);
    assert.match(JSON.parse(first.stdout).hookSpecificOutput.additionalContext, /缓存描述/);
    assert.match(JSON.parse(second.stdout).hookSpecificOutput.additionalContext, /缓存描述/);
    assert.equal(calls, 1, '第二次应命中缓存，不再请求视觉 API');
});
