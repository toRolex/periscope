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
const node_stream_1 = require("node:stream");
const config_1 = require("../config/config");
const fixtures_1 = require("../testing/fixtures");
const init_1 = require("./init");
function mockStdin(lines) {
    const r = new node_stream_1.Readable({ read() { } });
    for (const line of lines) {
        r.push(`${line}\n`);
    }
    r.push(null);
    return r;
}
class StringWritable extends node_stream_1.Writable {
    data = '';
    _write(chunk, _enc, cb) {
        this.data += chunk.toString('utf8');
        cb();
    }
}
function tmpEnv() {
    return {
        HOME: (0, fixtures_1.makeTempDir)('periscope-init-home-'),
    };
}
(0, node_test_1.test)('init 通过 stdin 接收选择题 → 写出完整 config.json（结构与 DEFAULT_CONFIG 一致）', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-init-out-');
    const configPath = path.join(dir, 'config.json');
    const stdin = mockStdin(['openai', 'https://my.example.com/v1', 'my-model', 'sk-test-key']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, init_1.runInit)([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });
    assert.equal(code, 0);
    assert.ok(fs.existsSync(configPath), '配置文件应被写出');
    const written = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
    assert.equal(written.protocol, 'openai');
    assert.equal(written.apiKey, 'sk-test-key');
    const openai = written.openai;
    assert.equal(openai.baseUrl, 'https://my.example.com/v1');
    assert.equal(openai.model, 'my-model');
    // 其他协议段保留 DEFAULT_CONFIG 完整 baseUrl + model
    assert.deepEqual(written.anthropic, config_1.DEFAULT_CONFIG.anthropic);
    assert.deepEqual(written.responses, config_1.DEFAULT_CONFIG.responses);
});
(0, node_test_1.test)('init 选择 anthropic 协议 → config.json 的 anthropic.baseUrl/model 写入用户选择', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-init-out-');
    const configPath = path.join(dir, 'config.json');
    const stdin = mockStdin(['anthropic', 'https://api.anthropic.com', 'claude-3-5-sonnet-latest', 'sk-anthropic']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, init_1.runInit)([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });
    assert.equal(code, 0);
    const written = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
    assert.equal(written.protocol, 'anthropic');
    const anthropic = written.anthropic;
    assert.equal(anthropic.baseUrl, 'https://api.anthropic.com');
    assert.equal(anthropic.model, 'claude-3-5-sonnet-latest');
    assert.equal(written.apiKey, 'sk-anthropic');
});
(0, node_test_1.test)('init 目标配置文件已存在 → 拒绝覆盖、stderr 提示原因、退出码非零', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-init-existing-');
    const configPath = path.join(dir, 'config.json');
    const originalContent = JSON.stringify({ ...config_1.DEFAULT_CONFIG, apiKey: 'preserved-key' }, null, 2);
    fs.writeFileSync(configPath, originalContent);
    const stdin = mockStdin(['openai', 'https://x', 'm', 'k']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, init_1.runInit)([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });
    assert.notEqual(code, 0);
    assert.match(stderr.data, /已存在/);
    // 拒绝时原文件字节不变
    const after = fs.readFileSync(configPath).toString('utf8');
    assert.equal(after, originalContent, '现有配置文件不应被修改');
    assert.match(after, /preserved-key/, '现有 apiKey 应原样保留');
});
(0, node_test_1.test)('init stdin EOF（无任何回答） → 报错到 stderr + 非零退出码', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-init-eof-');
    const configPath = path.join(dir, 'config.json');
    const stdin = mockStdin([]);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, init_1.runInit)([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });
    assert.notEqual(code, 0);
    assert.ok(stderr.data.length > 0, 'EOF 时应输出错误信息');
    assert.ok(!fs.existsSync(configPath), 'EOF 失败时不应写出配置文件');
});
(0, node_test_1.test)('init 协议输入非 openai/anthropic/responses → 报错 + 非零退出码', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-init-bad-proto-');
    const configPath = path.join(dir, 'config.json');
    const stdin = mockStdin(['bogus']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, init_1.runInit)([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });
    assert.notEqual(code, 0);
    assert.ok(!fs.existsSync(configPath), '协议无效时不应写出配置文件');
});
(0, node_test_1.test)('init 写入的 JSON 顶层字段齐全：protocol / apiKey / openai / anthropic / responses', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-init-shape-');
    const configPath = path.join(dir, 'config.json');
    const stdin = mockStdin(['responses', 'https://api.openai.com/v1', 'gpt-4o-mini', 'sk-r']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, init_1.runInit)([], stdin, stdout, stderr, { ...tmpEnv(), PERISCOPE_CONFIG: configPath });
    assert.equal(code, 0);
    const written = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
    for (const key of ['protocol', 'apiKey', 'openai', 'anthropic', 'responses']) {
        assert.ok(key in written, `顶层字段 ${key} 必须存在`);
    }
});
(0, node_test_1.test)('init 在 PERISCOPE_CONFIG 未设置时使用 HOME/.config/periscope/config.json', async () => {
    const home = (0, fixtures_1.makeTempDir)('periscope-init-homeonly-');
    const expected = path.join(home, '.config', 'periscope', 'config.json');
    const stdin = mockStdin(['openai', 'https://x', 'm', 'k']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, init_1.runInit)([], stdin, stdout, stderr, { HOME: home });
    assert.equal(code, 0);
    assert.ok(fs.existsSync(expected), `应写入 HOME 派生路径: ${expected}`);
});
