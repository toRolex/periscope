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
exports.PLUGIN_SCHEMA_1_0_0 = exports.PNG_1PX_BASE64 = exports.StringWritable = void 0;
exports.makeTempDir = makeTempDir;
exports.writeFixtureImage = writeFixtureImage;
exports.writeConfigFile = writeConfigFile;
exports.readyEndpoint = readyEndpoint;
exports.withEnv = withEnv;
exports.makeTestEnv = makeTestEnv;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const node_stream_1 = require("node:stream");
const config_1 = require("../config/config");
/** 测试用 Writable：把所有写入的字节以 utf8 拼到 data。多个 CLI 测试需复用此 helper。 */
class StringWritable extends node_stream_1.Writable {
    data = '';
    _write(chunk, _enc, cb) {
        this.data += chunk.toString('utf8');
        cb();
    }
}
exports.StringWritable = StringWritable;
/** 1x1 透明 PNG（base64）。mock 端点不校验图片内容，用于测试 payload 的 data URL 构造。 */
exports.PNG_1PX_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
function makeTempDir(prefix = 'periscope-test-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** 在 dir 下写入一张 fixture 图片，返回其绝对路径。 */
function writeFixtureImage(dir, name = 'fixture.png') {
    const filePath = path.join(dir, name);
    fs.writeFileSync(filePath, Buffer.from(exports.PNG_1PX_BASE64, 'base64'));
    return filePath;
}
/** 在 dir 下写入一份 periscope 配置文件，返回路径与配置对象。 */
function writeConfigFile(dir, overrides = {}) {
    const config = { ...config_1.DEFAULT_CONFIG, ...overrides };
    const filePath = path.join(dir, 'config.json');
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    return { path: filePath, config };
}
/** 测试用就绪端点（baseUrl 由调用方注入，如 mock server 动态端口；model 固定），describe/scripts/hook/delivery/plugin/cache 测试共用。 */
function readyEndpoint(baseUrl) {
    return { baseUrl, model: 'vision-model' };
}
/** 临时设置/删除若干环境变量，测试结束自动还原。 */
function withEnv(env, fn) {
    const saved = new Map();
    for (const key of Object.keys(env)) {
        saved.set(key, process.env[key]);
        if (env[key] === undefined) {
            delete process.env[key];
        }
        else {
            process.env[key] = env[key];
        }
    }
    try {
        fn();
    }
    finally {
        for (const [key, value] of saved) {
            if (value === undefined) {
                delete process.env[key];
            }
            else {
                process.env[key] = value;
            }
        }
    }
}
/**
 * Agent Plugins 1.0.0 根 plugin.json schema（固定本地 fixture）。
 * 内容从 https://agent-plugins.org/schemas/1.0.0/plugin.schema.json 复制，
 * 作为测试的固定权威来源——避免测试依赖真实 schema URL 造成 CI 抖动（issue #13）。
 */
exports.PLUGIN_SCHEMA_1_0_0 = {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
    title: 'Agent Plugins Manifest',
    description: 'Machine-readable schema for plugin.json in Agent Plugins 1.0.0. The Agent Plugins specification defines additional semantic and operational requirements.',
    type: 'object',
    properties: {
        $schema: {
            const: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
            description: 'Canonical identifier of the plugin manifest schema for the Agent Plugins version targeted by this document.',
        },
        name: {
            type: 'string',
            minLength: 1,
            maxLength: 64,
            pattern: '^(?!.*(?:--|\\.\\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$',
            description: 'Human-readable plugin name.',
        },
        version: { type: 'string' },
        description: { type: 'string' },
        author: {
            type: 'object',
            properties: {
                name: { type: 'string' },
                email: { type: 'string' },
                url: { type: 'string' },
            },
            additionalProperties: false,
        },
        homepage: { type: 'string' },
        repository: { type: 'string' },
        license: { type: 'string' },
        keywords: { type: 'array', items: { type: 'string' } },
        extensions: {
            type: 'object',
            description: 'Client-specific manifest data keyed by reverse-domain extension namespace. Agent Plugins assigns no semantics to namespace object contents.',
            additionalProperties: { type: 'object' },
        },
    },
    required: ['$schema', 'name'],
    additionalProperties: false,
};
/** 构造隔离的测试环境：继承 process.env，覆盖 PERISCOPE_CONFIG/API_KEY/HOME（及可选 CACHE_DIR）。 */
function makeTestEnv(configPath, options) {
    const env = {
        ...process.env,
        PERISCOPE_CONFIG: configPath,
        PERISCOPE_API_KEY: options.apiKey,
        HOME: makeTempDir(options.homePrefix),
    };
    if (options.cacheDir !== undefined) {
        env.PERISCOPE_CACHE_DIR = options.cacheDir;
    }
    return env;
}
