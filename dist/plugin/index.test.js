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
const config_1 = require("../config/config");
const mock_server_1 = require("../testing/mock-server");
const fixtures_1 = require("../testing/fixtures");
/**
 * 插件契约结构断言 + 契约执行冒烟。
 * 插件根 = 仓库根：编译后的本测试位于 dist/plugin/index.test.js，上溯两级即仓库根。
 * 覆盖 issue #7 AC1-AC3（结构断言）与 AC4 的 worktree 内可自动化部分（契约执行冒烟）。
 * 注意：红线约束下无 @types/node，fs.readFileSync 只声明 (p: string): ByteBuf，
 * 统一用 .toString('utf8') 读文本；assert.ok 不窄化，需显式 null/undefined 检查。
 */
/** 仓库根 = 插件根。 */
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const PLUGIN_MANIFEST = path.join(REPO_ROOT, '.claude-plugin', 'plugin.json');
const HOOKS_FILE = path.join(REPO_ROOT, 'hooks', 'hooks.json');
const SKILL_FILE = path.join(REPO_ROOT, 'skills', 'describe-image', 'SKILL.md');
function readText(filePath) {
    return fs.readFileSync(filePath).toString('utf8');
}
function readJson(filePath) {
    return JSON.parse(readText(filePath));
}
function parseFrontmatter(md) {
    const m = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(md);
    if (m === null) {
        throw new Error('SKILL.md 应以 --- frontmatter --- 开头');
    }
    return { frontmatter: m[1], body: md.slice(m[0].length) };
}
function runNode(args, stdin, env) {
    return new Promise((resolve, reject) => {
        const child = (0, node_child_process_1.spawn)(process.execPath, args, { env });
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
        if (stdin)
            child.stdin.write(stdin);
        child.stdin.end();
    });
}
function hookEnv(configPath) {
    return {
        ...process.env,
        PERISCOPE_CONFIG: configPath,
        PERISCOPE_API_KEY: 'sk-plugin',
        HOME: (0, fixtures_1.makeTempDir)('periscope-plugin-home-'),
        PERISCOPE_CACHE_DIR: (0, fixtures_1.makeTempDir)('periscope-plugin-cache-'),
    };
}
function cliEnv(configPath) {
    return {
        ...process.env,
        PERISCOPE_CONFIG: configPath,
        PERISCOPE_API_KEY: 'sk-plugin',
        HOME: (0, fixtures_1.makeTempDir)('periscope-plugin-home-'),
    };
}
(0, node_test_1.test)('AC1 插件清单：.claude-plugin/plugin.json 存在、合法 JSON、name 必填为 periscope', () => {
    assert.ok(fs.existsSync(PLUGIN_MANIFEST), 'plugin.json 必须存在');
    const manifest = readJson(PLUGIN_MANIFEST);
    assert.equal(manifest.name, 'periscope');
});
(0, node_test_1.test)('AC2 hooks exec form：UserPromptSubmit 用 command+args 数组经插件根变量调用编译产物', () => {
    assert.ok(fs.existsSync(HOOKS_FILE), 'hooks/hooks.json 必须存在');
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
    assert.ok(flatHooks.length > 0, 'UserPromptSubmit 应至少声明一个 hook');
    for (const h of flatHooks) {
        assert.equal(h.type, 'command');
        const args = h.args;
        if (!Array.isArray(args)) {
            throw new Error('exec form 必须有 args 数组（而非 shell 字符串）');
        }
        assert.ok(args.length > 0, 'args 非空');
        assert.match(args[0], /\$\{CLAUDE_PLUGIN_ROOT\}/, '首个参数应引用插件根变量');
        assert.ok(args[0].endsWith('/dist/hook/index.js'), '应指向编译产物 dist/hook/index.js');
    }
});
(0, node_test_1.test)('AC2 skill 自动可用：description + 插件根变量调用 CLI + allowed-tools 声明 Bash 规则', () => {
    assert.ok(fs.existsSync(SKILL_FILE), 'skills/describe-image/SKILL.md 必须存在');
    const md = readText(SKILL_FILE);
    const { frontmatter, body } = parseFrontmatter(md);
    assert.match(frontmatter, /^description:.+/m, 'frontmatter 应有 description（模型可自动调用 → 自动可用）');
    assert.match(frontmatter, /^allowed-tools:.+/m, 'frontmatter 应声明 allowed-tools');
    assert.match(frontmatter, /Bash\(node \$\{CLAUDE_PLUGIN_ROOT\}\/dist\/cli\/index\.js \*\)/, 'allowed-tools 应允许经插件根变量运行编译 CLI');
    assert.match(body, /\$\{CLAUDE_PLUGIN_ROOT\}\/dist\/cli\/index\.js describe/, 'body 应指令经插件根变量调用 CLI describe');
});
(0, node_test_1.test)('AC3 Codex 天然跳过：仓库不提供 .codex-plugin 清单，Codex 不加载 Claude Code hooks', () => {
    assert.equal(fs.existsSync(path.join(REPO_ROOT, '.codex-plugin')), false, '不应存在 .codex-plugin/，Codex 侧自然跳过');
});
(0, node_test_1.test)('AC4 契约执行冒烟：hooks.json 声明的 exec 命令可解析并注入 additionalContext', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const img = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const hooksFile = readJson(HOOKS_FILE);
    const flatHooks = hooksFile.hooks.UserPromptSubmit.flatMap((e) => e.hooks ?? []);
    const hook = flatHooks[0];
    const args = hook.args;
    if (args === undefined || args.length === 0) {
        throw new Error('声明应含非空 args（exec form）');
    }
    const resolvedArgs = args.map((a) => a.replace('${CLAUDE_PLUGIN_ROOT}', REPO_ROOT));
    const { stdout, code } = await runNode(resolvedArgs, JSON.stringify({
        hook_event_name: 'UserPromptSubmit',
        prompt: '看图',
        image_count: 1,
        image_paths: [img],
    }), hookEnv(configPath));
    assert.equal(code, 0);
    const parsed = JSON.parse(stdout);
    assert.equal(parsed.decision, 'approve');
    assert.match(parsed.hookSpecificOutput.additionalContext, /\[Image 1\] a\.png: mock 默认描述/);
});
(0, node_test_1.test)('AC4 契约执行冒烟：skill 指令的 CLI 命令可解析并输出描述', async (t) => {
    const server = await (0, mock_server_1.createMockServer)();
    t.after(() => server.close());
    const dir = (0, fixtures_1.makeTempDir)();
    const img = (0, fixtures_1.writeFixtureImage)(dir, 'a.png');
    const configPath = (0, fixtures_1.writeConfigFile)(dir, {
        openai: { ...config_1.DEFAULT_CONFIG.openai, baseUrl: server.baseUrl },
    }).path;
    const cliEntry = path.join(REPO_ROOT, 'dist', 'cli', 'index.js');
    assert.ok(fs.existsSync(cliEntry), '编译产物 dist/cli/index.js 应存在');
    const { stdout, stderr, code } = await runNode([cliEntry, 'describe', img], '', cliEnv(configPath));
    assert.equal(code, 0);
    assert.equal(stderr, '');
    assert.equal(stdout, 'mock 默认描述\n');
});
