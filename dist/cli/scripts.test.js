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
/** 编译后测试位于 dist/cli/，三个独立脚本入口即同目录的 describe.js / doctor.js / init.js（命令分发器 index.js 已删除）。 */
const DESCRIBE_ENTRY = path.join(__dirname, 'describe.js');
const DOCTOR_ENTRY = path.join(__dirname, 'doctor.js');
const INIT_ENTRY = path.join(__dirname, 'init.js');
function cliEnv(configPath) {
    const env = (0, fixtures_1.makeTestEnv)(configPath, { apiKey: 'sk-cli', homePrefix: 'periscope-cli-home-' });
    // 预置一份新鲜的 schema 缓存 → doctor 的 schema 检查走缓存，不发起真实网络请求。
    const cacheDir = path.join(env.HOME ?? '', '.cache', 'periscope');
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'agent-plugins.schema.json'), JSON.stringify(fixtures_1.PLUGIN_SCHEMA_1_0_0, null, 2));
    return { ...env, PERISCOPE_CACHE_DIR: cacheDir };
}
(0, node_test_1.test)('describe 脚本输出纯文本描述到 stdout 并以 0 退出', async (t) => {
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
        DESCRIBE_ENTRY,
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
(0, node_test_1.test)('describe 脚本首次运行自动生成默认配置文件（openai + DashScope 端点）', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = path.join(dir, 'fresh', 'config.json');
    const err = await execFileP(process.execPath, [
        DESCRIBE_ENTRY,
        path.join(dir, 'nope.png'),
    ], { env: cliEnv(configPath) }).catch((e) => e);
    assert.notEqual(err.code, 0);
    assert.ok(fs.existsSync(configPath), '配置文件应被懒创建');
    const written = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
    assert.equal(written.protocol, 'openai');
    assert.equal(written.apiKey, '');
    assert.equal(written.openai.baseUrl, 'https://dashscope.aliyuncs.com/compatible-mode/v1');
});
(0, node_test_1.test)('describe 脚本缺少图片路径 → stderr 报错 + 非零退出码', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = (0, fixtures_1.writeConfigFile)(dir).path;
    const err = await execFileP(process.execPath, [DESCRIBE_ENTRY], {
        env: cliEnv(configPath),
    }).catch((e) => e);
    assert.notEqual(err.code, 0);
    assert.match(err.stderr, /缺少图片路径/);
    assert.match(err.stderr, /用法/);
});
(0, node_test_1.test)('describe 脚本图片不存在 → stderr 报错 + 非零退出码', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = (0, fixtures_1.writeConfigFile)(dir, { apiKey: 'sk' }).path;
    const err = await execFileP(process.execPath, [
        DESCRIBE_ENTRY,
        path.join(dir, 'nope.png'),
    ], { env: cliEnv(configPath) }).catch((e) => e);
    assert.notEqual(err.code, 0);
    assert.match(err.stderr, /无法读取图片文件/);
});
(0, node_test_1.test)('describe 脚本端点返回 500 → stderr 报错 + 非零退出码', async (t) => {
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
    const err = await execFileP(process.execPath, [DESCRIBE_ENTRY, imagePath], {
        env: cliEnv(configPath),
    }).catch((e) => e);
    assert.notEqual(err.code, 0);
    assert.match(err.stderr, /HTTP 500/);
});
(0, node_test_1.test)('代码库中不存在 periscope 命令分发器（src/cli/index.ts 与编译产物 dist/cli/index.js 均不产出）', () => {
    const srcDispatcher = path.join(__dirname, '..', '..', 'src', 'cli', 'index.ts');
    const distDispatcher = path.join(__dirname, 'index.js');
    assert.equal(fs.existsSync(srcDispatcher), false, 'src/cli/index.ts 应已删除');
    assert.equal(fs.existsSync(distDispatcher), false, 'dist/cli/index.js 应已删除');
});
(0, node_test_1.test)('doctor 脚本 → 全 OK 时 stdout 5 项 ✅ + 通过结论 + 退出码 0', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = (0, fixtures_1.writeConfigFile)(dir).path;
    const { stdout, stderr } = await execFileP(process.execPath, [
        DOCTOR_ENTRY,
    ], { env: cliEnv(configPath) });
    assert.equal(stderr, '');
    const okLines = stdout.split('\n').filter((l) => l.includes('✅') && !l.startsWith('结论:'));
    assert.equal(okLines.length, 5, `应有 5 行 ✅，stdout：\n${stdout}`);
    assert.match(stdout, /结论:\s*✅\s*全部通过/);
});
(0, node_test_1.test)('doctor 脚本 → config 缺失时非零退出 + stdout 提示运行 init', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = path.join(dir, 'absent.json'); // 故意不创建
    const err = await execFileP(process.execPath, [DOCTOR_ENTRY], {
        env: cliEnv(configPath),
    }).catch((e) => e);
    assert.notEqual(err.code, 0);
    assert.match(err.stdout, /❌/);
    assert.match(err.stdout, /配置文件/);
    assert.match(err.stdout, /periscope init/);
});
(0, node_test_1.test)('doctor 脚本 --offline 冷缓存时仅本地自检 + schema 降级 ⚠️（不发起外部请求）', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = (0, fixtures_1.writeConfigFile)(dir).path;
    // 不种子缓存：构造一个隔离的 HOME，且不预置 schema 缓存 → 冷缓存
    const isolatedHome = (0, fixtures_1.makeTempDir)('periscope-cli-offline-');
    const env = {
        ...cliEnv(configPath),
        HOME: isolatedHome, // 覆盖预置 schema 缓存用的 HOME
    };
    delete env.PERISCOPE_CACHE_DIR;
    const { stdout, stderr } = await execFileP(process.execPath, [
        DOCTOR_ENTRY,
        '--offline',
    ], { env: env });
    assert.equal(stderr, '');
    // 4 项本地 ✅ + schema ⚠️ 离线降级（不输出 fetch/HTTP 等网络关键字）
    assert.doesNotMatch(stdout, /fetch|HTTP|timeout|ECONN|ENOTFOUND/i);
    assert.match(stdout, /离线模式/);
    assert.match(stdout, /⚠️ 根 plugin\.json schema/);
});
(0, node_test_1.test)('init 脚本：fork 管道输入（非 TTY）→ 降级报错 + 非零退出码，已存在配置不被修改（端到端）', async () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = (0, fixtures_1.writeConfigFile)(dir, { apiKey: 'preserved-key' }).path;
    const originalContent = fs.readFileSync(configPath).toString('utf8');
    const err = await execFileP(process.execPath, [INIT_ENTRY], {
        env: cliEnv(configPath),
        input: '\x1b[B\rhttps://x\r m\r k\r y\n',
    }).catch((e) => e);
    assert.notEqual(err.code, 0, '非 TTY 管道环境应降级报错退出');
    assert.match(err.stderr, /交互式终端|TTY/);
    const afterContent = fs.readFileSync(configPath).toString('utf8');
    assert.equal(afterContent, originalContent, 'fork 非 TTY 降级时已存在文件字节不变');
});
(0, node_test_1.test)('describe 脚本接受多张图片并按传入顺序聚合输出', async (t) => {
    const dir = (0, fixtures_1.makeTempDir)();
    const img1 = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const img2 = path.join(dir, 'b.png');
    const secondBase64 = Buffer.from('second-image-bytes', 'utf8').toString('base64');
    fs.writeFileSync(img2, Buffer.from('second-image-bytes', 'utf8'));
    const server = await (0, mock_server_1.createMockServer)({
        handler: (req) => {
            const url = req.jsonBody.messages[0].content[1].image_url.url;
            const content = url.includes(secondBase64) ? '第二张描述' : '第一张描述';
            return { status: 200, body: JSON.stringify({ choices: [{ message: { content } }] }) };
        },
    });
    t.after(() => server.close());
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const { stdout, stderr } = await execFileP(process.execPath, [
        DESCRIBE_ENTRY,
        img1,
        img2,
    ], { env: cliEnv(configPath) });
    assert.equal(stdout, `${img1}: 第一张描述\n${img2}: 第二张描述\n`);
    assert.equal(stderr, '');
    assert.equal(server.requests.length, 2);
});
(0, node_test_1.test)('describe 脚本多图一败一胜：stdout 保留成功描述，stderr 标注失败，退出码非零', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({ choices: [{ message: { content: '成功图描述' } }] }),
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const img1 = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const missing = path.join(dir, 'missing.png');
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const err = await execFileP(process.execPath, [
        DESCRIBE_ENTRY,
        img1,
        missing,
    ], { env: cliEnv(configPath) }).catch((e) => e);
    assert.notEqual(err.code, 0, '有失败项时退出码应非零');
    assert.match(err.stdout, new RegExp(`${img1}: 成功图描述`), '成功项描述应保留在 stdout');
    assert.match(err.stderr, /无法读取图片文件/, '失败信息应走 stderr');
    assert.equal(server.requests.length, 1, '缺失图不发起请求，成功图只请求一次');
});
(0, node_test_1.test)('describe 脚本接受 URL 远程图片并输出描述', async (t) => {
    const server = await (0, mock_server_1.createMockServer)({
        defaultBody: JSON.stringify({ choices: [{ message: { content: 'URL 图描述' } }] }),
    });
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const url = 'https://example.com/cat.png';
    const { stdout, stderr } = await execFileP(process.execPath, [
        DESCRIBE_ENTRY,
        url,
    ], { env: cliEnv(configPath) });
    assert.equal(stdout, 'URL 图描述\n');
    assert.equal(stderr, '');
    const body = server.requests[0].jsonBody;
    assert.equal(body.messages[0].content[1].image_url.url, url);
});
