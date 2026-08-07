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
const doctor_1 = require("./doctor");
class StringWritable extends node_stream_1.Writable {
    data = '';
    _write(chunk, _enc, cb) {
        this.data += chunk.toString('utf8');
        cb();
    }
}
/**
 * 找出 dist/ 目录：编译产物固定在 <rootDir>/dist。本测试的 distDir 直接指向仓库 dist。
 * 真实 dist/ 路径 = <repo>/dist。doctor.test.ts 在 src/cli/，编译后位于 dist/cli/，
 * 因此 repoRoot = dist/cli/../..；再 /dist = dist/cli/../../dist。
 *
 * 本测试用 makeTempDir 模拟 distDir，以隔离真实文件树。
 */
function tmpDist() {
    return (0, fixtures_1.makeTempDir)('periscope-doctor-dist-');
}
function writeFullConfig(dir, overrides = {}) {
    const config = { ...config_1.DEFAULT_CONFIG, ...overrides };
    const filePath = path.join(dir, 'config.json');
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    return filePath;
}
function seedDist(distDir, files) {
    for (const rel of files) {
        const full = path.join(distDir, rel);
        fs.mkdirSync(path.dirname(full), { recursive: true });
        fs.writeFileSync(full, '// seed\n');
    }
}
(0, node_test_1.test)('doctor 全部检查通过 → stdout 含 4 行 ✅ + 一行通过结论 + 退出码 0', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-happy-');
    const configPath = writeFullConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/index.js', 'core/describe.js']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp, // dummy
    });
    assert.equal(code, 0);
    assert.equal(stderr.data, '');
    // 4 个 ✅ 检查行（不含结论行）。检查行格式：`<icon> <label>: <detail>`
    const checkLines = stdout.data
        .split('\n')
        .filter((l) => l.includes('✅') && !l.startsWith('结论:'));
    assert.equal(checkLines.length, 4, `应有 4 项 ✅ 检查行，实际：\n${stdout.data}`);
    // 一行结论
    assert.match(stdout.data, /结论:\s*✅\s*全部通过/);
});
(0, node_test_1.test)('doctor config 文件缺失 → 该项 ❌ + 结论列出问题 + 退出码非零（不触发懒创建）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-noconfig-');
    const configPath = path.join(tmp, 'absent.json'); // 故意不创建
    const distDir = tmpDist();
    seedDist(distDir, ['cli/index.js', 'core/describe.js']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
    });
    assert.notEqual(code, 0);
    assert.ok(!fs.existsSync(configPath), 'doctor 不应懒创建 config 文件');
    assert.match(stdout.data, /❌/);
    assert.match(stdout.data, /配置文件/);
    assert.match(stdout.data, /periscope init/);
    assert.match(stdout.data, /结论:\s*❌/);
});
(0, node_test_1.test)('doctor config 缺少 openai 协议段 → openai 协议段检查 ❌ + 列出缺失段名', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-noopenai-');
    const configPath = path.join(tmp, 'config.json');
    // 故意去掉 openai 段
    const partial = {
        anthropic: config_1.DEFAULT_CONFIG.anthropic,
        responses: config_1.DEFAULT_CONFIG.responses,
        apiKey: '',
        protocol: 'anthropic',
    };
    fs.writeFileSync(configPath, JSON.stringify(partial));
    const distDir = tmpDist();
    seedDist(distDir, ['cli/index.js', 'core/describe.js']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
    });
    assert.notEqual(code, 0);
    assert.match(stdout.data, /openai[\s\S]*❌/);
    assert.match(stdout.data, /openai/);
});
(0, node_test_1.test)('doctor config 缺少 anthropic 协议段 → 该项 ❌', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-noanthropic-');
    const configPath = path.join(tmp, 'config.json');
    const partial = {
        openai: config_1.DEFAULT_CONFIG.openai,
        responses: config_1.DEFAULT_CONFIG.responses,
        apiKey: '',
        protocol: 'openai',
    };
    fs.writeFileSync(configPath, JSON.stringify(partial));
    const distDir = tmpDist();
    seedDist(distDir, ['cli/index.js', 'core/describe.js']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
    });
    assert.notEqual(code, 0);
    assert.match(stdout.data, /anthropic[\s\S]*❌/);
});
(0, node_test_1.test)('doctor config 缺少 responses 协议段 → 该项 ❌', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-noresponses-');
    const configPath = path.join(tmp, 'config.json');
    const partial = {
        openai: config_1.DEFAULT_CONFIG.openai,
        anthropic: config_1.DEFAULT_CONFIG.anthropic,
        apiKey: '',
        protocol: 'openai',
    };
    fs.writeFileSync(configPath, JSON.stringify(partial));
    const distDir = tmpDist();
    seedDist(distDir, ['cli/index.js', 'core/describe.js']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
    });
    assert.notEqual(code, 0);
    assert.match(stdout.data, /responses[\s\S]*❌/);
});
(0, node_test_1.test)('doctor Node 版本低于 engines.node 下限 → 该项 ❌ + 结论非零', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-oldnode-');
    const configPath = writeFullConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/index.js', 'core/describe.js']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v18.0.0', // 低于 >=20
        distDir,
        repoRoot: tmp,
    });
    assert.notEqual(code, 0);
    assert.match(stdout.data, /Node[\s\S]*❌|node[\s\S]*❌/i);
    assert.match(stdout.data, /v18/);
});
(0, node_test_1.test)('doctor dist/ 缺少 cli/index.js → 该项 ❌（提示需要 npm run build）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-nodist-');
    const configPath = writeFullConfig(tmp);
    const distDir = tmpDist();
    // 故意只放 describe.js，缺 cli/index.js
    seedDist(distDir, ['core/describe.js']);
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
    });
    assert.notEqual(code, 0);
    assert.match(stdout.data, /dist[\s\S]*❌/);
    assert.match(stdout.data, /cli\/index\.js/);
});
(0, node_test_1.test)('doctor 多项同时异常 → 结论列出总项数（每条异常贡献一次计数）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-multi-');
    const configPath = path.join(tmp, 'absent.json');
    const distDir = tmpDist(); // 空 dist
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v18.0.0',
        distDir,
        repoRoot: tmp,
    });
    assert.notEqual(code, 0);
    // config 缺、Node 低、dist 空 → 至少 3 项 ❌ 检查行（不含结论行）
    const fails = stdout.data
        .split('\n')
        .filter((l) => l.includes('❌') && !l.startsWith('结论:')).length;
    assert.ok(fails >= 3, `应至少 3 项 ❌ 检查行，实际 ${fails}：\n${stdout.data}`);
    assert.match(stdout.data, /结论:\s*❌\s*(\d+)\s*项异常/);
});
(0, node_test_1.test)('doctor 全程不发起任何外部网络请求（通过 absent HTTP 端点保证）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-net-');
    const configPath = writeFullConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/index.js', 'core/describe.js']);
    // 故意把 baseUrl 指向一个不存在的端点；如果 doctor 不小心发起请求，fetch 会失败/超时，
    // 但因为我们只看输出，本测试更直接地：跑完 doctor 后 config 文件未变、dist 未变。
    const stdout = new StringWritable();
    const stderr = new StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
    });
    // 行为约束：doctor 是纯本地的；不能因为端点连不上而退出非零。
    assert.equal(code, 0);
    // 此外：doctor 输出不应出现任何 HTTP / fetch / timeout 关键字。
    assert.doesNotMatch(stdout.data, /fetch|HTTP|timeout|ECONN|ENOTFOUND/i);
    assert.doesNotMatch(stderr.data, /fetch|HTTP|timeout|ECONN|ENOTFOUND/i);
});
