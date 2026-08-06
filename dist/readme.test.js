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
/** 编译后位于 dist/readme.test.js，仓库根即 __dirname 的上一级。 */
const REPO_ROOT = path.join(__dirname, '..');
const README_PATH = path.join(REPO_ROOT, 'README.md');
function readme() {
    assert.ok(fs.existsSync(README_PATH), `README 应存在于仓库根: ${README_PATH}`);
    return fs.readFileSync(README_PATH).toString('utf8');
}
(0, node_test_1.test)('README 存在且覆盖安装步骤', () => {
    const md = readme();
    assert.match(md, /安装/);
    assert.match(md, /(pnpm|npm|yarn) (install|i)/);
    assert.match(md, /(git clone|git pull|build|dist)/);
});
(0, node_test_1.test)('README 配置说明覆盖三协议与字段（protocol / baseUrl / model）', () => {
    const md = readme();
    assert.match(md, /openai/);
    assert.match(md, /anthropic/);
    assert.match(md, /responses/);
    assert.match(md, /protocol/);
    assert.match(md, /baseUrl/);
    assert.match(md, /model/);
});
(0, node_test_1.test)('README 说明环境变量（apiKey / config / cacheDir）', () => {
    const md = readme();
    assert.match(md, /PERISCOPE_API_KEY/);
    assert.match(md, /PERISCOPE_CONFIG/);
    assert.match(md, /PERISCOPE_CACHE_DIR/);
});
(0, node_test_1.test)('README 说明 CLI 用法（describe / 多图 / URL / --intent）', () => {
    const md = readme();
    assert.match(md, /periscope describe/);
    assert.match(md, /--intent/);
    assert.match(md, /URL/);
});
(0, node_test_1.test)('README 说明 hook 贴图注入与放行语义', () => {
    const md = readme();
    assert.match(md, /UserPromptSubmit/);
    assert.match(md, /\[Image \d+\]/);
    assert.match(md, /approve/);
    assert.match(md, /additionalContext/);
});
(0, node_test_1.test)('README 含 marketplace 发布说明', () => {
    const md = readme();
    assert.match(md, /marketplace/i);
    assert.match(md, /发布/);
});
(0, node_test_1.test)('README 含常见问题（FAQ）', () => {
    const md = readme();
    assert.match(md, /常见问题|FAQ/i);
});
(0, node_test_1.test)('README 含真实视觉 LLM 人工实测指南', () => {
    const md = readme();
    assert.match(md, /人工实测|实测指南/);
});
