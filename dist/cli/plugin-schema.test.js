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
const fixtures_1 = require("../testing/fixtures");
const plugin_schema_1 = require("./plugin-schema");
/**
 * 手写 schema 解释器 + 缓存/TTL 的单元测试（issue #13）。
 * 全部使用固定本地 schema fixture + 注入 fetchFn，不依赖真实 schema URL（避免 CI 抖动）。
 */
/** 合规模板：与真实根 plugin.json（#10 产出）同形。 */
const VALID_MANIFEST = {
    $schema: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    name: 'periscope',
    version: '0.1.0',
    description: '给纯文本 coding agent 的视觉桥插件',
    author: { name: 'toRolex' },
};
function seedCacheFile(dir, schema) {
    fs.mkdirSync(dir, { recursive: true });
    const cachePath = (0, plugin_schema_1.pluginSchemaCachePath)(dir);
    fs.writeFileSync(cachePath, JSON.stringify(schema, null, 2));
    return cachePath;
}
// ---- validatePluginManifest：合规 / 不合规 + 来源提示 ----
(0, node_test_1.test)('validatePluginManifest 合规模板 → 无错误', () => {
    assert.deepStrictEqual((0, plugin_schema_1.validatePluginManifest)(VALID_MANIFEST, fixtures_1.PLUGIN_SCHEMA_1_0_0), []);
});
(0, node_test_1.test)('validatePluginManifest name 大写 → 报 $.name 不符合 pattern', () => {
    const errors = (0, plugin_schema_1.validatePluginManifest)({ ...VALID_MANIFEST, name: 'Periscope' }, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    assert.ok(errors.length > 0);
    assert.ok(errors.some((e) => e.includes('$.name')), `应提示 $.name 来源：\n${errors.join('\n')}`);
});
(0, node_test_1.test)('validatePluginManifest 缺少必填 $schema → 报缺少必填字段', () => {
    const broken = { ...VALID_MANIFEST };
    delete broken.$schema;
    const errors = (0, plugin_schema_1.validatePluginManifest)(broken, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    assert.ok(errors.some((e) => e.includes('$schema') && e.includes('缺少必填字段')), `应提示 $. 缺少必填字段 $schema：\n${errors.join('\n')}`);
});
(0, node_test_1.test)('validatePluginManifest 多余顶层字段 → 报不允许的字段', () => {
    const errors = (0, plugin_schema_1.validatePluginManifest)({ ...VALID_MANIFEST, foo: 1 }, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    assert.ok(errors.some((e) => e.includes('$.foo') && e.includes('不允许的字段')), `应提示 $.foo 不允许：\n${errors.join('\n')}`);
});
(0, node_test_1.test)('validatePluginManifest author 多余字段 → 报 $.author 不允许', () => {
    const errors = (0, plugin_schema_1.validatePluginManifest)({ ...VALID_MANIFEST, author: { name: 'toRolex', phone: 'x' } }, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    assert.ok(errors.some((e) => e.includes('$.author') && e.includes('不允许的字段')), `应提示 $.author 不允许的字段：\n${errors.join('\n')}`);
});
(0, node_test_1.test)('validatePluginManifest version 为数字 → 报 $.version 类型错误', () => {
    const errors = (0, plugin_schema_1.validatePluginManifest)({ ...VALID_MANIFEST, version: 1 }, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    assert.ok(errors.some((e) => e.includes('$.version') && e.includes('类型应为 string')), `应提示 $.version 类型错误：\n${errors.join('\n')}`);
});
(0, node_test_1.test)('validatePluginManifest name 空字符串 → 报 minLength', () => {
    const errors = (0, plugin_schema_1.validatePluginManifest)({ ...VALID_MANIFEST, name: '' }, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    assert.ok(errors.some((e) => e.includes('$.name') && e.includes('minLength')), `应提示 $.name minLength：\n${errors.join('\n')}`);
});
(0, node_test_1.test)('validatePluginManifest 非对象 manifest → 报 $ 类型错误', () => {
    const errors = (0, plugin_schema_1.validatePluginManifest)('periscope', fixtures_1.PLUGIN_SCHEMA_1_0_0);
    assert.ok(errors.some((e) => e.includes('类型应为 object')), `应提示根类型错误：\n${errors.join('\n')}`);
});
(0, node_test_1.test)('validatePluginManifest schema 非对象 → 报 schema 格式错误', () => {
    const errors = (0, plugin_schema_1.validatePluginManifest)(VALID_MANIFEST, 'not-a-schema');
    assert.ok(errors.some((e) => e.includes('schema 格式错误')), `应提示 schema 格式错误：\n${errors.join('\n')}`);
});
// ---- 缓存 TTL：7 天过期判定 ----
(0, node_test_1.test)('isSchemaCacheFresh：缺失 false / 新鲜 true / 过期 false', () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-schema-fresh-');
    const cachePath = (0, plugin_schema_1.pluginSchemaCachePath)(dir);
    assert.equal((0, plugin_schema_1.isSchemaCacheFresh)(cachePath), false, '缓存缺失应为 false');
    seedCacheFile(dir, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    assert.equal((0, plugin_schema_1.isSchemaCacheFresh)(cachePath), true, '刚写入的缓存应新鲜');
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000); // 8 天前
    fs.utimesSync(cachePath, past, past);
    assert.equal((0, plugin_schema_1.isSchemaCacheFresh)(cachePath), false, 'mtime 超过 7 天应过期');
});
// ---- loadPluginSchema：缓存命中 / 拉取 / 失败 ----
(0, node_test_1.test)('loadPluginSchema 缓存命中 → source=cache，fetchFn 不被调用', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-schema-hit-');
    seedCacheFile(dir, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    let calls = 0;
    const fetchFn = async () => {
        calls += 1;
        throw new Error('缓存命中时不应发起网络请求');
    };
    const loaded = await (0, plugin_schema_1.loadPluginSchema)(dir, fetchFn);
    assert.equal(loaded.source, 'cache');
    assert.equal(calls, 0);
    assert.deepStrictEqual(loaded.schema, fixtures_1.PLUGIN_SCHEMA_1_0_0);
});
(0, node_test_1.test)('loadPluginSchema 缓存缺失 → 拉取远程 + 写回缓存 + source=remote', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-schema-miss-');
    const urls = [];
    const fetchFn = async (url) => {
        urls.push(url);
        return { ok: true, status: 200, json: async () => fixtures_1.PLUGIN_SCHEMA_1_0_0 };
    };
    const loaded = await (0, plugin_schema_1.loadPluginSchema)(dir, fetchFn);
    assert.equal(loaded.source, 'remote');
    assert.deepStrictEqual(urls, [plugin_schema_1.PLUGIN_SCHEMA_URL]);
    assert.deepStrictEqual(loaded.schema, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    const written = JSON.parse(fs.readFileSync((0, plugin_schema_1.pluginSchemaCachePath)(dir)).toString('utf8'));
    assert.deepStrictEqual(written, fixtures_1.PLUGIN_SCHEMA_1_0_0);
});
(0, node_test_1.test)('loadPluginSchema 缓存过期 → 重新拉取并更新缓存', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-schema-stale-');
    const cachePath = seedCacheFile(dir, { stale: true });
    const past = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000);
    fs.utimesSync(cachePath, past, past);
    let calls = 0;
    const fetchFn = async () => {
        calls += 1;
        return { ok: true, status: 200, json: async () => fixtures_1.PLUGIN_SCHEMA_1_0_0 };
    };
    const loaded = await (0, plugin_schema_1.loadPluginSchema)(dir, fetchFn);
    assert.equal(loaded.source, 'remote');
    assert.equal(calls, 1);
    assert.deepStrictEqual(loaded.schema, fixtures_1.PLUGIN_SCHEMA_1_0_0);
    const written = JSON.parse(fs.readFileSync(cachePath).toString('utf8'));
    assert.deepStrictEqual(written, fixtures_1.PLUGIN_SCHEMA_1_0_0);
});
(0, node_test_1.test)('loadPluginSchema 拉取抛错 → reject（调用方降级 ⚠️）', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-schema-fail-');
    const fetchFn = async () => {
        throw new Error('offline');
    };
    await assert.rejects((0, plugin_schema_1.loadPluginSchema)(dir, fetchFn));
});
(0, node_test_1.test)('loadPluginSchema 拉取返回非 2xx → reject（调用方降级 ⚠️）', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-schema-status-');
    const fetchFn = async () => ({
        ok: false,
        status: 500,
        json: async () => ({}),
    });
    await assert.rejects((0, plugin_schema_1.loadPluginSchema)(dir, fetchFn));
});
(0, node_test_1.test)('loadPluginSchema 拉取返回非法 JSON → reject（调用方降级 ⚠️）', async () => {
    const dir = (0, fixtures_1.makeTempDir)('periscope-schema-badjson-');
    const fetchFn = async () => ({
        ok: true,
        status: 200,
        json: async () => {
            throw new Error('invalid json');
        },
    });
    await assert.rejects((0, plugin_schema_1.loadPluginSchema)(dir, fetchFn));
});
