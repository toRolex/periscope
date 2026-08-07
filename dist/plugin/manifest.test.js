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
/**
 * Agent Plugins 1.0.0 标准 manifest 断言（issue #10 AC1 / AC2）。
 * 仓库根 = 插件根：编译后的本测试位于 dist/plugin/manifest.test.js，
 * 上溯两级即仓库根。覆盖：
 *   - AC1：仓库根 plugin.json 存在，五字段齐全且 $schema 指向 1.0.0
 *   - AC2：现有 .claude-plugin/ 与 hooks/ 结构未被改动
 *
 * 注意：红线约束下无 @types/node，fs.readFileSync 只声明 (p: string): ByteBuf，
 * 统一用 .toString('utf8') 读文本；assert.ok 不窄化，需显式 null/undefined 检查。
 */
/** 仓库根 = 插件根。 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const AGENT_PLUGINS_MANIFEST = path.join(REPO_ROOT, 'plugin.json');
const CLAUDE_PLUGIN_MANIFEST = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const HOOKS_FILE = path.join(REPO_ROOT, 'hooks', 'hooks.json');
function readText(filePath) {
    return fs.readFileSync(filePath).toString('utf8');
}
function readJson(filePath) {
    return JSON.parse(readText(filePath));
}
(0, node_test_1.test)('AC1 根 plugin.json 存在且为合法 JSON', () => {
    assert.ok(fs.existsSync(AGENT_PLUGINS_MANIFEST), 'Agent Plugins 标准 manifest plugin.json 必须存在于仓库根');
    const raw = readText(AGENT_PLUGINS_MANIFEST);
    let parsed = undefined;
    try {
        parsed = JSON.parse(raw);
    }
    catch {
        throw new Error('plugin.json 必须为合法 JSON');
    }
    assert.ok(parsed !== undefined && typeof parsed === 'object' && parsed !== null, 'plugin.json 应为对象');
});
(0, node_test_1.test)('AC1 根 plugin.json 五字段齐全（$schema / name / version / description / author）', () => {
    const manifest = readJson(AGENT_PLUGINS_MANIFEST);
    assert.ok('$schema' in manifest, 'plugin.json 应包含 $schema 字段');
    assert.ok('name' in manifest, 'plugin.json 应包含 name 字段');
    assert.ok('version' in manifest, 'plugin.json 应包含 version 字段');
    assert.ok('description' in manifest, 'plugin.json 应包含 description 字段');
    assert.ok('author' in manifest, 'plugin.json 应包含 author 字段');
    assert.equal(typeof manifest['$schema'], 'string', '$schema 应为字符串');
    assert.equal(typeof manifest['name'], 'string', 'name 应为字符串');
    assert.equal(typeof manifest['version'], 'string', 'version 应为字符串');
    assert.equal(typeof manifest['description'], 'string', 'description 应为字符串');
    assert.ok(manifest['author'] !== null && typeof manifest['author'] === 'object', 'author 应为对象');
});
(0, node_test_1.test)('AC1 根 plugin.json：name 沿用 periscope', () => {
    const manifest = readJson(AGENT_PLUGINS_MANIFEST);
    assert.equal(manifest.name, 'periscope', 'name 应沿用 periscope');
});
(0, node_test_1.test)('AC1 根 plugin.json：$schema 指向 1.0.0 schema', () => {
    const manifest = readJson(AGENT_PLUGINS_MANIFEST);
    const schema = manifest['$schema'];
    if (typeof schema !== 'string') {
        throw new Error('$schema 应为非空字符串');
    }
    assert.match(schema, /agent-plugins\.org.*1\.0\.0|1\.0\.0.*agent-plugins/, '$schema 应指向 Agent Plugins 1.0.0 schema');
});
(0, node_test_1.test)('AC2 现有 .claude-plugin/plugin.json 未被改动', () => {
    assert.ok(fs.existsSync(CLAUDE_PLUGIN_MANIFEST), '.claude-plugin/plugin.json 必须保留（Claude Code 体验不变）');
    const manifest = readJson(CLAUDE_PLUGIN_MANIFEST);
    assert.equal(manifest.name, 'periscope', 'Claude Code 插件 name 应仍为 periscope');
});
(0, node_test_1.test)('AC2 现有 hooks/hooks.json 未被改动', () => {
    assert.ok(fs.existsSync(HOOKS_FILE), 'hooks/hooks.json 必须保留（Claude Code 体验不变）');
    const hooksFile = readJson(HOOKS_FILE);
    const hooksObj = hooksFile.hooks;
    if (hooksObj === undefined) {
        throw new Error('应包含顶层 hooks 对象');
    }
    const entries = hooksObj.UserPromptSubmit;
    if (!Array.isArray(entries)) {
        throw new Error('UserPromptSubmit 应为数组');
    }
    const flatHooks = entries.flatMap((e) => e.hooks ?? []);
    assert.ok(flatHooks.length > 0, 'UserPromptSubmit 应至少声明一个 hook（exec form）');
});
