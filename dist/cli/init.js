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
/**
 * 把 stdin 的 keypress / end / close 事件收敛成可 await 的按键队列。
 * 先到先得：按键到达时若无等待者则入队，等待者取队首。
 * 这样即使一次输入多个字符（同步 burst）也不会丢事件。
 */
function createKeySource(stdin) {
    const input = stdin;
    const queue = [];
    const waiters = [];
    let ended = false;
    const onKey = (str, key) => {
        const ev = {
            str,
            name: key?.name,
            ctrl: key?.ctrl === true,
            meta: key?.meta === true,
            eof: false,
        };
        const waiter = waiters.shift();
        if (waiter !== undefined)
            waiter(ev);
        else
            queue.push(ev);
    };
    const onEnd = () => {
        if (ended)
            return;
        ended = true;
        for (const waiter of waiters.splice(0)) {
            waiter({ str: '', name: undefined, ctrl: false, meta: false, eof: true });
        }
    };
    input.on('keypress', onKey);
    input.on('end', onEnd);
    input.on('close', onEnd);
    return () => {
        const pending = queue.shift();
        if (pending !== undefined)
            return Promise.resolve(pending);
        if (ended)
            return Promise.resolve({ str: '', name: undefined, ctrl: false, meta: false, eof: true });
        return new Promise((resolve) => waiters.push(resolve));
    };
}
/** Ctrl+C 视为用户主动中断：raw mode 下 SIGINT 被禁用，需按 keypress 显式识别。 */
function isInterrupt(ev) {
    return ev.ctrl === true && ev.name === 'c';
}
/**
 * 可回显的可打印字符：普通字符/空格/多字节字符。
 * 排除转义序列（方向键等 str 为 undefined）、ESC、Ctrl/Meta 组合，
 * 避免把 "undefined" 或控制字符追加进配置值。
 */
function appendable(ev) {
    return (ev.str !== undefined &&
        ev.str !== '' &&
        ev.str !== '\u001b' &&
        ev.ctrl !== true &&
        ev.meta !== true);
}
const RETURN_KEYS = new Set(['return', 'enter']);
/** 渲染协议选项：❯ 标记当前高亮项（默认 openai）。 */
function renderProtocols(stdout, index) {
    for (const [i, protocol] of PROTOCOLS.entries()) {
        stdout.write(`${i === index ? '❯' : ' '} ${protocol}\n`);
    }
}
/** 方向键选择协议：↑/↓ 循环移动、回车确认，默认高亮 openai；其余按键忽略。EOF 时返回 null。 */
async function selectProtocol(nextKey, stdout) {
    let index = 0;
    stdout.write('选择协议（↑/↓ 切换，回车确认）:\n');
    renderProtocols(stdout, index);
    while (true) {
        const ev = await nextKey();
        if (ev.eof || isInterrupt(ev))
            return null;
        if (ev.name === 'up') {
            index = (index - 1 + PROTOCOLS.length) % PROTOCOLS.length;
            renderProtocols(stdout, index);
        }
        else if (ev.name === 'down') {
            index = (index + 1) % PROTOCOLS.length;
            renderProtocols(stdout, index);
        }
        else if (ev.name !== undefined && RETURN_KEYS.has(ev.name)) {
            return PROTOCOLS[index];
        }
        // 其余按键（普通字符等）忽略——白名单之外输入不改变选择。
    }
}
/** 读取一行文本：普通字符累积回显、回车提交。EOF 时返回 null。 */
async function readField(nextKey, stdout, prompt) {
    stdout.write(prompt);
    let value = '';
    while (true) {
        const ev = await nextKey();
        if (ev.eof || isInterrupt(ev))
            return null;
        if (ev.name !== undefined && RETURN_KEYS.has(ev.name)) {
            stdout.write('\n');
            return value;
        }
        if (ev.name === 'backspace') {
            if (value.length > 0) {
                value = value.slice(0, -1);
                stdout.write('\b \b');
            }
        }
        else if (appendable(ev)) {
            value += ev.str;
            stdout.write(ev.str);
        }
    }
}
/**
 * init 脚本：交互式初始化向导（独立终端运行）。
 * 流程：方向键选择协议 → 填 baseUrl/model/apiKey（必填）→ 展示摘要 + 覆盖警告 → y/n 确认写入。
 * 写入路径 PERISCOPE_CONFIG 优先，否则 HOME 派生。stdin 非 TTY 时降级报错退出。
 */
async function runInit(_argv, stdin, stdout, stderr, env) {
    const configPath = (0, config_1.configPathForEnv)(env);
    if (!stdin.isTTY) {
        stderr.write('错误: init 需要在交互式终端（TTY）中运行，请勿在管道/重定向环境调用\n');
        return 1;
    }
    if (typeof stdin.setRawMode !== 'function') {
        stdin.setRawMode = () => { };
    }
    // 主动进入 raw mode，保证方向键转义序列逐键解码（readline 只在收到首个数据后才惰性 setRawMode）。
    stdin.setRawMode(true);
    readline.emitKeypressEvents(stdin);
    const nextKey = createKeySource(stdin);
    const protocol = await selectProtocol(nextKey, stdout);
    if (protocol === null) {
        stderr.write('错误: 输入流提前结束（EOF）\n');
        return 1;
    }
    const baseUrl = await readField(nextKey, stdout, '请输入 baseUrl: ');
    if (baseUrl === null) {
        stderr.write('错误: 输入流提前结束（EOF）\n');
        return 1;
    }
    if (baseUrl.trim() === '') {
        stderr.write('错误: baseUrl 不能为空\n');
        return 1;
    }
    const model = await readField(nextKey, stdout, '请输入 model: ');
    if (model === null) {
        stderr.write('错误: 输入流提前结束（EOF）\n');
        return 1;
    }
    if (model.trim() === '') {
        stderr.write('错误: model 不能为空\n');
        return 1;
    }
    const apiKey = await readField(nextKey, stdout, '请输入 apiKey: ');
    if (apiKey === null) {
        stderr.write('错误: 输入流提前结束（EOF）\n');
        return 1;
    }
    if (apiKey.trim() === '') {
        stderr.write('错误: apiKey 不能为空\n');
        return 1;
    }
    const exists = fs.existsSync(configPath);
    stdout.write('\n配置摘要:\n');
    stdout.write(`  协议: ${protocol}\n`);
    stdout.write(`  baseUrl: ${baseUrl}\n`);
    stdout.write(`  model: ${model}\n`);
    stdout.write(`  apiKey: ${apiKey}\n`);
    if (exists) {
        stdout.write('警告: 将覆盖现有配置\n');
    }
    stdout.write('确认写入？(y/n): ');
    const confirm = await readField(nextKey, stdout, '');
    if (confirm === null) {
        stderr.write('错误: 输入流提前结束（EOF）\n');
        return 1;
    }
    if (confirm.trim().toLowerCase() !== 'y') {
        stdout.write('已放弃写入，现有配置保持不变\n');
        return 0;
    }
    const next = {
        ...config_1.DEFAULT_CONFIG,
        protocol,
        apiKey,
        openai: { ...config_1.DEFAULT_CONFIG.openai },
        anthropic: { ...config_1.DEFAULT_CONFIG.anthropic },
        responses: { ...config_1.DEFAULT_CONFIG.responses },
    };
    next[protocol] = { baseUrl, model };
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
