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
/** 编译后位于 dist/set-up.test.js，仓库根即 __dirname 的上一级。 */
const REPO_ROOT = path.join(__dirname, '..');
const SETUP_PATH = path.join(REPO_ROOT, 'skills', 'set-up', 'SKILL.md');
function setupMd() {
    assert.ok(fs.existsSync(SETUP_PATH), `set-up skill 应存在: ${SETUP_PATH}`);
    return fs.readFileSync(SETUP_PATH).toString('utf8');
}
(0, node_test_1.test)('set-up 引导与 README 的 BYOM 定位一致（不绑定服务商）', () => {
    const md = setupMd();
    assert.match(md, /BYOM|bring your own model/i, 'set-up 应明示 BYOM 定位');
    assert.match(md, /不绑定任何服务商|不预绑任何服务商|不默认指向任何服务商|由你.*提供|自行填写/, 'set-up 应声明服务商由用户自带、不绑定任何服务商');
});
(0, node_test_1.test)('set-up 说明 apiKey 可留空（而非必填）', () => {
    const md = setupMd();
    assert.match(md, /apiKey/);
    assert.match(md, /可留空|留空|可选/, 'set-up 应说明 apiKey 可留空');
    assert.doesNotMatch(md, /apiKey[^\n]*必填/, 'set-up 不应宣称 apiKey 必填');
});
(0, node_test_1.test)('set-up 不应宣称 openai 默认指向任何服务商', () => {
    const md = setupMd();
    assert.doesNotMatch(md, /openai[^\n]*默认指向/, 'set-up 不应宣称 openai 默认指向某服务商');
});
(0, node_test_1.test)('set-up 的 doctor 核对清单包含激活协议（六项齐全）', () => {
    const md = setupMd();
    assert.match(md, /激活协议/, 'set-up doctor 核对清单应包含激活协议');
    assert.match(md, /config 文件/);
    assert.match(md, /协议段/);
    assert.match(md, /Node 版本/);
    assert.match(md, /dist\/|编译产物/);
    assert.match(md, /schema/);
});
