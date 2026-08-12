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
const config_1 = require("./config");
const fixtures_1 = require("../testing/fixtures");
(0, node_test_1.test)('首次运行懒创建：PERISCOPE_CONFIG 指向的路径自动生成空白模板配置', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = path.join(dir, 'nested', 'config.json');
    (0, fixtures_1.withEnv)({ PERISCOPE_CONFIG: configPath, PERISCOPE_API_KEY: undefined }, () => {
        const cfg = (0, config_1.loadConfig)();
        assert.equal(cfg.protocol, 'openai');
        assert.equal(cfg.apiKey, '');
        assert.equal(cfg.openai.baseUrl, '', 'openai.baseUrl 应为空串');
        assert.equal(cfg.openai.model, '', 'openai.model 应为空串');
        assert.ok(cfg.anthropic, '默认配置应含 anthropic 扩展位');
        assert.ok(cfg.responses, '默认配置应含 responses 扩展位');
        assert.ok(fs.existsSync(configPath), '配置文件应被自动创建');
        const written = JSON.parse(fs.readFileSync(configPath).toString('utf8'));
        assert.equal(written.protocol, 'openai');
        assert.equal(written.apiKey, '');
    });
});
(0, node_test_1.test)('空白模板：anthropic/responses 的 baseUrl 与 model 均为空串，不绑定任何服务商', () => {
    assert.equal(config_1.DEFAULT_CONFIG.anthropic.baseUrl, '');
    assert.equal(config_1.DEFAULT_CONFIG.anthropic.model, '');
    assert.equal(config_1.DEFAULT_CONFIG.responses.baseUrl, '');
    assert.equal(config_1.DEFAULT_CONFIG.responses.model, '');
});
(0, node_test_1.test)('配置文件不包含任何具体服务商默认值（无 DashScope / Anthropic / OpenAI 端点）', () => {
    const raw = JSON.stringify(config_1.DEFAULT_CONFIG);
    assert.doesNotMatch(raw, /dashscope|aliyuncs/i, '不应含 DashScope 域名');
    assert.doesNotMatch(raw, /qwen/i, '不应含 DashScope 模型名');
    assert.doesNotMatch(raw, /api\.anthropic\.com/i, '不应含 Anthropic 官方端点');
    assert.doesNotMatch(raw, /claude-/i, '不应含 Anthropic 官方模型名');
    assert.doesNotMatch(raw, /api\.openai\.com/i, '不应含 OpenAI 官方端点');
    assert.doesNotMatch(raw, /gpt-/i, '不应含 OpenAI 官方模型名');
});
(0, node_test_1.test)('默认配置路径为 HOME/.config/periscope/config.json，且可被 PERISCOPE_CONFIG 覆盖', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    (0, fixtures_1.withEnv)({ PERISCOPE_CONFIG: undefined, HOME: dir }, () => {
        assert.equal((0, config_1.defaultConfigPath)(), path.join(dir, '.config', 'periscope', 'config.json'));
    });
    const overridePath = path.join(dir, 'custom.json');
    (0, fixtures_1.withEnv)({ PERISCOPE_CONFIG: overridePath }, () => {
        assert.equal((0, config_1.defaultConfigPath)(), overridePath);
    });
});
(0, node_test_1.test)('configPathForEnv：PERISCOPE_CONFIG 优先，否则 HOME 派生', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    assert.equal((0, config_1.configPathForEnv)({ HOME: dir }), path.join(dir, '.config', 'periscope', 'config.json'));
    const override = path.join(dir, 'custom.json');
    assert.equal((0, config_1.configPathForEnv)({ HOME: dir, PERISCOPE_CONFIG: override }), override);
});
(0, node_test_1.test)('configPathForEnv：HOME 缺省时用 os.homedir() 兜底', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    (0, fixtures_1.withEnv)({ HOME: dir }, () => {
        assert.equal((0, config_1.configPathForEnv)({}), path.join(dir, '.config', 'periscope', 'config.json'));
    });
});
(0, node_test_1.test)('PERISCOPE_API_KEY 环境变量优先于配置文件中的 apiKey', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ ...config_1.DEFAULT_CONFIG, apiKey: 'file-key' }));
    (0, fixtures_1.withEnv)({ PERISCOPE_CONFIG: configPath, PERISCOPE_API_KEY: 'env-key' }, () => {
        assert.equal((0, config_1.loadConfig)().apiKey, 'env-key');
    });
});
(0, node_test_1.test)('未设置环境变量时使用配置文件中的 apiKey', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ ...config_1.DEFAULT_CONFIG, apiKey: 'file-key' }));
    (0, fixtures_1.withEnv)({ PERISCOPE_CONFIG: configPath, PERISCOPE_API_KEY: undefined }, () => {
        assert.equal((0, config_1.loadConfig)().apiKey, 'file-key');
    });
});
(0, node_test_1.test)('默认配置 apiKey 为空字符串', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify(config_1.DEFAULT_CONFIG));
    (0, fixtures_1.withEnv)({ PERISCOPE_CONFIG: configPath, PERISCOPE_API_KEY: undefined }, () => {
        assert.equal((0, config_1.loadConfig)().apiKey, '');
    });
});
(0, node_test_1.test)('配置文件只改 openai.baseUrl：openai.model 保留空白模板、其他协议段空白完整', () => {
    const dir = (0, fixtures_1.makeTempDir)();
    const configPath = path.join(dir, 'config.json');
    fs.writeFileSync(configPath, JSON.stringify({ openai: { baseUrl: 'https://my-gateway.example.com/v1' } }));
    (0, fixtures_1.withEnv)({ PERISCOPE_CONFIG: configPath, PERISCOPE_API_KEY: undefined }, () => {
        const cfg = (0, config_1.loadConfig)();
        assert.equal(cfg.openai.baseUrl, 'https://my-gateway.example.com/v1');
        assert.equal(cfg.openai.model, '', '未修改的 openai.model 应保留空白模板');
        assert.equal(cfg.protocol, 'openai', '顶层 protocol 保持默认');
        assert.equal(cfg.anthropic.baseUrl, config_1.DEFAULT_CONFIG.anthropic.baseUrl);
        assert.equal(cfg.anthropic.model, config_1.DEFAULT_CONFIG.anthropic.model);
        assert.equal(cfg.responses.baseUrl, config_1.DEFAULT_CONFIG.responses.baseUrl);
        assert.equal(cfg.responses.model, config_1.DEFAULT_CONFIG.responses.model);
    });
});
(0, node_test_1.test)('DEFAULT_CONFIG.protocol 为 Protocol 联合类型（openai/anthropic/responses）', () => {
    const p = config_1.DEFAULT_CONFIG.protocol;
    assert.ok(['openai', 'anthropic', 'responses'].includes(p));
});
