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
exports.PNG_1PX_BASE64 = void 0;
exports.makeTempDir = makeTempDir;
exports.writeConfigFile = writeConfigFile;
exports.readyEndpoint = readyEndpoint;
exports.withEnv = withEnv;
const fs = __importStar(require("node:fs"));
const os = __importStar(require("node:os"));
const path = __importStar(require("node:path"));
const config_1 = require("../config/config");
/**
 * 测试件（从主仓 src/testing/fixtures.ts 拷贝并精简到本包用到的 helper，
 * 保持 mock 视觉端点 seam 一致——全程离线，无需真实 API key）。
 */
/** 1x1 透明 PNG（base64）。mock 端点不校验图片内容，用于测试图片字节 → data URL 构造。 */
exports.PNG_1PX_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
function makeTempDir(prefix = 'periscope-dsh-test-') {
    return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}
/** 在 dir 下写入一份 periscope 配置文件，返回路径与配置对象。 */
function writeConfigFile(dir, overrides = {}) {
    const config = { ...config_1.DEFAULT_CONFIG, ...overrides };
    const filePath = path.join(dir, 'config.json');
    fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
    return { path: filePath, config };
}
/** 测试用就绪端点（baseUrl 由调用方注入，如 mock server 动态端口；model 固定）。 */
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
