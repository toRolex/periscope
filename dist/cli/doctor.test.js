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
const config_1 = require("../config/config");
const fixtures_1 = require("../testing/fixtures");
const doctor_1 = require("./doctor");
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
function writeBlankConfig(dir, overrides = {}) {
    const config = { ...config_1.DEFAULT_CONFIG, ...overrides };
    const filePath = path.join(dir, 'config.json');
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    return filePath;
}
/** 写入「就绪」配置：激活协议 openai 的 baseUrl / model 非空（其余段沿用 DEFAULT_CONFIG 结构）。 */
function writeReadyConfig(dir) {
    const config = {
        ...config_1.DEFAULT_CONFIG,
        openai: { baseUrl: 'https://api.openai.com/v1', model: 'gpt-4o' },
    };
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
/** 测试用 fetchFn：永远失败 → schema 项确定性地降级为 ⚠️，避免触碰真实网络。 */
const OFFLINE_FETCH = async () => {
    throw new Error('offline');
};
/** 合规模板：与真实根 plugin.json（#10 产出）同形。 */
const VALID_PLUGIN_MANIFEST = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'periscope',
    version: '0.1.0',
    description: '给纯文本 coding agent 的视觉桥插件',
    author: { name: 'toRolex' },
};
/** 在 cacheDir 下写入一份新鲜的 schema 缓存。 */
function seedSchemaCache(cacheDir, schema) {
    fs.mkdirSync(cacheDir, { recursive: true });
    fs.writeFileSync(path.join(cacheDir, 'agent-plugins.schema.json'), JSON.stringify(schema, null, 2));
}
/** 在 dir 下写入 plugin.json，返回路径。 */
function writePluginJson(dir, manifest) {
    const filePath = path.join(dir, 'plugin.json');
    fs.writeFileSync(filePath, JSON.stringify(manifest, null, 2));
    return filePath;
}
(0, node_test_1.test)('doctor 全部检查通过 → stdout 含 5 行 ✅ + 一行通过结论 + 退出码 0', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-happy-');
    const configPath = writeReadyConfig(tmp); // 激活协议 openai 端点非空
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp, // dummy
        cacheDir: (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'),
        fetchFn: OFFLINE_FETCH,
    });
    assert.equal(code, 0);
    assert.equal(stderr.data, '');
    // 5 个 ✅ 检查行（不含结论行）。检查行格式：`<icon> <label>: <detail>`
    const checkLines = stdout.data
        .split('\n')
        .filter((l) => l.includes('✅') && !l.startsWith('结论:'));
    assert.equal(checkLines.length, 5, `应有 5 项 ✅ 检查行，实际：\n${stdout.data}`);
    // 一行结论
    assert.match(stdout.data, /结论:\s*✅\s*全部通过/);
});
(0, node_test_1.test)('doctor config 文件缺失 → 该项 ❌ + 结论列出问题 + 退出码非零（不触发懒创建）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-noconfig-');
    const configPath = path.join(tmp, 'absent.json'); // 故意不创建
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir: (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'),
        fetchFn: OFFLINE_FETCH,
    });
    assert.notEqual(code, 0);
    assert.ok(!fs.existsSync(configPath), 'doctor 不应懒创建 config 文件');
    assert.match(stdout.data, /❌/);
    assert.match(stdout.data, /配置文件/);
    assert.match(stdout.data, /init\.js 或 \/set-up/);
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
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir: (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'),
        fetchFn: OFFLINE_FETCH,
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
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir: (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'),
        fetchFn: OFFLINE_FETCH,
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
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir: (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'),
        fetchFn: OFFLINE_FETCH,
    });
    assert.notEqual(code, 0);
    assert.match(stdout.data, /responses[\s\S]*❌/);
});
(0, node_test_1.test)('doctor Node 版本低于 engines.node 下限 → 该项 ❌ + 结论非零', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-oldnode-');
    const configPath = writeBlankConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v18.0.0', // 低于 >=20
        distDir,
        repoRoot: tmp,
        cacheDir: (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'),
        fetchFn: OFFLINE_FETCH,
    });
    assert.notEqual(code, 0);
    assert.match(stdout.data, /Node[\s\S]*❌|node[\s\S]*❌/i);
    assert.match(stdout.data, /v18/);
});
(0, node_test_1.test)('doctor dist/ 缺少 cli/describe.js → 该项 ❌（提示需要 npm run build）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-nodist-');
    const configPath = writeBlankConfig(tmp);
    const distDir = tmpDist();
    // 故意只放 init/doctor，缺 cli/describe.js
    seedDist(distDir, ['cli/init.js', 'cli/doctor.js']);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir: (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'),
        fetchFn: OFFLINE_FETCH,
    });
    assert.notEqual(code, 0);
    assert.match(stdout.data, /dist[\s\S]*❌/);
    assert.match(stdout.data, /cli\/describe\.js/);
});
(0, node_test_1.test)('doctor 多项同时异常 → 结论列出总项数（每条异常贡献一次计数）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-multi-');
    const configPath = path.join(tmp, 'absent.json');
    const distDir = tmpDist(); // 空 dist
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v18.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir: (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'),
        fetchFn: OFFLINE_FETCH,
    });
    assert.notEqual(code, 0);
    // config 缺、Node 低、dist 空 → 至少 3 项 ❌ 检查行（不含结论行）
    const fails = stdout.data
        .split('\n')
        .filter((l) => l.includes('❌') && !l.startsWith('结论:')).length;
    assert.ok(fails >= 3, `应至少 3 项 ❌ 检查行，实际 ${fails}：\n${stdout.data}`);
    assert.match(stdout.data, /结论:\s*❌\s*(\d+)\s*项异常/);
});
(0, node_test_1.test)('doctor 命中 schema 缓存时全程零外部请求（fetchFn 不被调用）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-net-');
    const configPath = writeReadyConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    writePluginJson(tmp, VALID_PLUGIN_MANIFEST);
    const cacheDir = (0, fixtures_1.makeTempDir)('periscope-doctor-cache-');
    seedSchemaCache(cacheDir, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    let fetchCalls = 0;
    const recordingFetch = async () => {
        fetchCalls += 1;
        throw new Error('schema 缓存命中时不应发起外部请求');
    };
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir,
        fetchFn: recordingFetch,
    });
    // 行为约束：doctor 在 schema 缓存命中时不发起任何外部网络请求。
    assert.equal(code, 0);
    assert.equal(fetchCalls, 0, 'schema 缓存命中时不应调用 fetchFn');
    // doctor 输出不应出现任何 HTTP / fetch / timeout 关键字。
    assert.doesNotMatch(stdout.data, /fetch|HTTP|timeout|ECONN|ENOTFOUND/i);
    assert.doesNotMatch(stderr.data, /fetch|HTTP|timeout|ECONN|ENOTFOUND/i);
});
(0, node_test_1.test)('doctor 根 plugin.json 合规（schema 来源: 本地缓存）→ 该项 ✅ + 退出码 0', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-schema-ok-');
    const configPath = writeReadyConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    writePluginJson(tmp, VALID_PLUGIN_MANIFEST);
    const cacheDir = (0, fixtures_1.makeTempDir)('periscope-doctor-cache-');
    seedSchemaCache(cacheDir, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir,
        fetchFn: OFFLINE_FETCH,
    });
    assert.equal(code, 0);
    assert.match(stdout.data, /✅ 根 plugin\.json schema/);
    assert.match(stdout.data, /合规/);
    assert.match(stdout.data, /schema 来源: 本地缓存/);
});
(0, node_test_1.test)('doctor 根 plugin.json 不合规（name 大写）→ 该项 ❌ + 来源提示 + 退出码非零', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-schema-bad-');
    const configPath = writeBlankConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    writePluginJson(tmp, { ...VALID_PLUGIN_MANIFEST, name: 'Periscope' });
    const cacheDir = (0, fixtures_1.makeTempDir)('periscope-doctor-cache-');
    seedSchemaCache(cacheDir, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir,
        fetchFn: OFFLINE_FETCH,
    });
    assert.notEqual(code, 0);
    assert.match(stdout.data, /❌ 根 plugin\.json schema/);
    assert.match(stdout.data, /不合规/);
    assert.match(stdout.data, /\$\.name/); // 来源提示：定位到出错字段
    assert.match(stdout.data, /schema 来源: 本地缓存/);
});
(0, node_test_1.test)('doctor schema 获取失败（冷缓存）→ 该项 ⚠️ 降级 + 退出码 0', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-schema-degraded-');
    const configPath = writeReadyConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    // 不写 plugin.json、不种子缓存 → 冷缓存，fetchFn 抛错 → 降级 ⚠️
    const cacheDir = (0, fixtures_1.makeTempDir)('periscope-doctor-cache-');
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir,
        fetchFn: OFFLINE_FETCH,
    });
    assert.equal(code, 0);
    assert.match(stdout.data, /⚠️ 根 plugin\.json schema/);
    assert.match(stdout.data, /获取失败/);
});
(0, node_test_1.test)('doctor --offline 冷缓存时零外部请求（fetchFn 不被调用） + schema 项 ⚠️', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-offline-cold-');
    const configPath = writeReadyConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    // 不种子缓存 → 走冷缓存路径；--offline 必须拒绝调用 fetchFn
    const cacheDir = (0, fixtures_1.makeTempDir)('periscope-doctor-cache-');
    let fetchCalls = 0;
    const shouldNotFetch = async () => {
        fetchCalls += 1;
        throw new Error('--offline 模式下不应调用 fetchFn');
    };
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)(['--offline'], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir,
        fetchFn: shouldNotFetch,
    });
    // 关键断言：--offline 即便冷缓存也零 fetch。
    assert.equal(fetchCalls, 0, '--offline 模式下不应调用 fetchFn');
    assert.equal(code, 0);
    // schema 项降级为 ⚠️ 并提示离线模式 + 跳过原因
    assert.match(stdout.data, /⚠️ 根 plugin\.json schema/);
    assert.match(stdout.data, /离线模式/);
    // 其余 5 项本地自检不受 --offline 影响
    const otherLines = stdout.data
        .split('\n')
        .filter((l) => l.includes('✅') &&
        !l.startsWith('结论:') &&
        !l.includes('根 plugin.json schema'));
    assert.ok(otherLines.length >= 5, `--offline 不影响其余 5 项本地自检，实际：\n${stdout.data}`);
    assert.match(stdout.data, /结论:\s*✅\s*全部通过/);
    // 离线模式下输出不应出现 fetch/HTTP 等网络关键字
    assert.doesNotMatch(stdout.data, /fetch|HTTP|ECONN|ENOTFOUND/i);
});
(0, node_test_1.test)('doctor --offline 命中缓存时使用本地缓存校验（fetchFn 不被调用）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-offline-cached-');
    const configPath = writeReadyConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    writePluginJson(tmp, VALID_PLUGIN_MANIFEST);
    const cacheDir = (0, fixtures_1.makeTempDir)('periscope-doctor-cache-');
    seedSchemaCache(cacheDir, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    let fetchCalls = 0;
    const shouldNotFetch = async () => {
        fetchCalls += 1;
        throw new Error('缓存命中时不应调用 fetchFn');
    };
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)(['--offline'], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir,
        fetchFn: shouldNotFetch,
    });
    assert.equal(fetchCalls, 0, '缓存命中时不应调用 fetchFn');
    assert.equal(code, 0);
    // 缓存命中时仍走完整 schema 校验，不输出离线降级 ⚠️
    assert.match(stdout.data, /✅ 根 plugin\.json schema/);
    assert.match(stdout.data, /合规/);
    assert.doesNotMatch(stdout.data, /离线模式/);
});
(0, node_test_1.test)('doctor --offline 与其余 5 项异常可同时报告（offline 不抑制本地检查）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-offline-multi-');
    const configPath = path.join(tmp, 'absent.json'); // 故意不创建 → config ❌
    const distDir = tmpDist(); // 空 dist → dist ❌
    const cacheDir = (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'); // 冷缓存
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)(['--offline'], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v18.0.0', // → Node ❌
        distDir,
        repoRoot: tmp,
        cacheDir,
        fetchFn: OFFLINE_FETCH,
    });
    assert.notEqual(code, 0);
    // config / 协议段 / 激活协议 / Node / dist 五项 ❌，schema 项 ⚠️（离线降级）
    const fails = stdout.data
        .split('\n')
        .filter((l) => l.includes('❌') && !l.startsWith('结论:')).length;
    assert.ok(fails >= 5, `--offline 不抑制本地 ❌ 项，实际 ${fails}：\n${stdout.data}`);
    assert.match(stdout.data, /⚠️ 根 plugin\.json schema/);
    assert.match(stdout.data, /离线模式/);
});
(0, node_test_1.test)('doctor --offline 紧贴其他参数也能识别（位置无关）', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-offline-pos-');
    const configPath = writeReadyConfig(tmp);
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    const cacheDir = (0, fixtures_1.makeTempDir)('periscope-doctor-cache-');
    let fetchCalls = 0;
    const shouldNotFetch = async () => {
        fetchCalls += 1;
        throw new Error('should not fetch');
    };
    const stdout = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)(['--offline'], stdout, new fixtures_1.StringWritable(), {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir,
        fetchFn: shouldNotFetch,
    });
    assert.equal(code, 0);
    assert.equal(fetchCalls, 0);
});
(0, node_test_1.test)('doctor config 存在但激活协议端点为空 → 该项 ❌ + 引导 init + 不误报全绿', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-active-empty-');
    const configPath = writeBlankConfig(tmp); // 三协议段结构完整，但 baseUrl / model 全为空串
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir: (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'),
        fetchFn: OFFLINE_FETCH,
    });
    assert.notEqual(code, 0);
    // 三协议段结构完整 → 协议段检查通过；但激活协议（默认 openai）端点为空 → 激活协议项 ❌
    assert.match(stdout.data, /✅ 协议段/);
    assert.match(stdout.data, /❌ 激活协议/);
    assert.match(stdout.data, /openai/);
    assert.match(stdout.data, /init/); // 引导运行 init
    assert.doesNotMatch(stdout.data, /结论:\s*✅\s*全部通过/);
    assert.match(stdout.data, /结论:\s*❌/);
});
(0, node_test_1.test)('doctor 激活协议端点已配置 → 该项 ✅ + 退出码 0', async () => {
    const tmp = (0, fixtures_1.makeTempDir)('periscope-doctor-active-ok-');
    const configPath = writeReadyConfig(tmp); // 激活协议 openai 的 baseUrl / model 非空
    const distDir = tmpDist();
    seedDist(distDir, ['cli/describe.js', 'cli/init.js', 'cli/doctor.js']);
    const stdout = new fixtures_1.StringWritable();
    const stderr = new fixtures_1.StringWritable();
    const code = await (0, doctor_1.runDoctor)([], stdout, stderr, {
        HOME: tmp,
        PERISCOPE_CONFIG: configPath,
        nodeVersion: 'v20.0.0',
        distDir,
        repoRoot: tmp,
        cacheDir: (0, fixtures_1.makeTempDir)('periscope-doctor-cache-'),
        fetchFn: OFFLINE_FETCH,
    });
    assert.equal(code, 0);
    assert.match(stdout.data, /✅ 激活协议/);
    assert.match(stdout.data, /openai/);
    assert.match(stdout.data, /结论:\s*✅\s*全部通过/);
});
