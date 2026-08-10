#!/usr/bin/env node
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
exports.runInit = runInit;
const fs = __importStar(require("node:fs"));
const path = __importStar(require("node:path"));
const readline = __importStar(require("node:readline"));
const config_1 = require("../config/config");
const shared_1 = require("./shared");
const PROTOCOLS = ['openai', 'anthropic', 'responses'];
function defaultConfigPathForEnv(env) {
    return (env.PERISCOPE_CONFIG ??
        path.join(env.HOME ?? '', '.config', 'periscope', 'config.json'));
}
function nonEmptyValidator(label) {
    return (v) => (v.trim().length === 0 ? `${label} 不能为空` : null);
}
function protocolValidator() {
    return (v) => PROTOCOLS.includes(v) ? null : `协议必须是 openai/anthropic/responses 之一`;
}
/**
 * periscope init：以选择题方式引导用户完成配置，写到默认路径。
 * 目标文件已存在 → 拒绝覆盖（避免误删 API key）。
 * stdin/stdout/stderr/env 全部可注入，便于测试直接调函数而非 fork 子进程。
 */
async function runInit(_argv, stdin, stdout, stderr, env) {
    const configPath = defaultConfigPathForEnv(env);
    if (fs.existsSync(configPath)) {
        stderr.write(`错误: 配置文件已存在 (${configPath})，拒绝覆盖以避免误删已有 API key\n`);
        stderr.write('提示: 如需重新生成，请先手动删除该文件再运行 periscope init\n');
        return 1;
    }
    const input = readline.createInterface({ input: stdin, crlfDelay: Infinity });
    const lines = input[Symbol.asyncIterator]();
    const ask = async (question, validate) => {
        stdout.write(question);
        const result = await lines.next();
        if (result.done) {
            stderr.write('错误: 输入流提前结束（EOF）\n');
            return null;
        }
        const line = result.value;
        const err = validate(line);
        if (err !== null) {
            stderr.write(`错误: ${err}\n`);
            return null;
        }
        return line;
    };
    const protocol = await ask(`选择协议 (openai/anthropic/responses): `, protocolValidator());
    if (protocol === null)
        return 1;
    const baseUrl = await ask(`${protocol} baseUrl: `, nonEmptyValidator('baseUrl'));
    if (baseUrl === null)
        return 1;
    const model = await ask(`${protocol} model: `, nonEmptyValidator('model'));
    if (model === null)
        return 1;
    const apiKey = await ask(`apiKey (可空): `, () => null);
    if (apiKey === null)
        return 1;
    const userProtocol = protocol;
    const next = {
        ...config_1.DEFAULT_CONFIG,
        protocol: userProtocol,
        apiKey,
        openai: { ...config_1.DEFAULT_CONFIG.openai },
        anthropic: { ...config_1.DEFAULT_CONFIG.anthropic },
        responses: { ...config_1.DEFAULT_CONFIG.responses },
    };
    next[userProtocol] = { baseUrl, model };
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(next, null, 2) + '\n');
    stdout.write(`已写入配置: ${configPath}\n`);
    return 0;
}
if (require.main === module) {
    runInit(process.argv.slice(2), process.stdin, process.stdout, process.stderr, {
        HOME: process.env.HOME,
        PERISCOPE_CONFIG: process.env.PERISCOPE_CONFIG,
    }).then((code) => {
        process.exitCode = code;
    }, (err) => {
        process.stderr.write(`错误: ${(0, shared_1.errorMessage)(err)}\n`);
        process.exitCode = 1;
    });
}
