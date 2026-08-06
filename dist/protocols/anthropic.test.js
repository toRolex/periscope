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
const anthropic_1 = require("./anthropic");
(0, node_test_1.test)('buildRequest 构造 anthropic v1/messages 请求', () => {
    const req = anthropic_1.anthropicAdapter.buildRequest({
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-3-5-sonnet-latest',
        imageDataUrl: 'data:image/png;base64,AAAA',
        intent: '描述这张图片里的内容',
        apiKey: 'sk-ant-test',
    });
    assert.equal(req.url, 'https://api.anthropic.com/v1/messages');
    assert.equal(req.headers['x-api-key'], 'sk-ant-test');
    assert.equal(req.headers['anthropic-version'], '2023-06-01');
    assert.equal(req.headers['content-type'], 'application/json');
    const body = req.body;
    assert.equal(body.model, 'claude-3-5-sonnet-latest');
    assert.ok(body.max_tokens > 0, '应设置 max_tokens');
    assert.equal(body.messages.length, 1);
    assert.equal(body.messages[0].role, 'user');
    assert.equal(body.messages[0].content.length, 2);
    assert.equal(body.messages[0].content[0].type, 'text');
    assert.equal(body.messages[0].content[0].text, '描述这张图片里的内容');
    assert.equal(body.messages[0].content[1].type, 'image');
    assert.equal(body.messages[0].content[1].source.type, 'base64');
    assert.equal(body.messages[0].content[1].source.media_type, 'image/png');
    assert.equal(body.messages[0].content[1].source.data, 'AAAA');
});
(0, node_test_1.test)('buildRequest 未提供 intent 时使用默认提示词', () => {
    const req = anthropic_1.anthropicAdapter.buildRequest({
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-3-5-sonnet-latest',
        imageDataUrl: 'data:image/png;base64,AAAA',
    });
    const body = req.body;
    assert.equal(body.messages[0].content[0].text, '描述这张图片');
});
(0, node_test_1.test)('buildRequest 未提供 apiKey 时不设置 x-api-key 头', () => {
    const req = anthropic_1.anthropicAdapter.buildRequest({
        baseUrl: 'https://api.anthropic.com',
        model: 'claude-3-5-sonnet-latest',
        imageDataUrl: 'data:image/png;base64,AAAA',
    });
    assert.equal(req.headers['x-api-key'], undefined);
});
(0, node_test_1.test)('extractText 提取 content 中 text 块的拼接文本', () => {
    const raw = JSON.stringify({
        content: [
            { type: 'text', text: '左边是山' },
            { type: 'text', text: '，右边是河' },
        ],
    });
    assert.equal(anthropic_1.anthropicAdapter.extractText(raw), '左边是山，右边是河');
});
(0, node_test_1.test)('extractText 忽略非 text 块（如 tool_use）', () => {
    const raw = JSON.stringify({
        content: [
            { type: 'tool_use', id: 'toolu_01' },
            { type: 'text', text: '画面里有只猫' },
        ],
    });
    assert.equal(anthropic_1.anthropicAdapter.extractText(raw), '画面里有只猫');
});
(0, node_test_1.test)('extractText 对非 JSON 响应透传原始文本', () => {
    assert.equal(anthropic_1.anthropicAdapter.extractText('not-json-at-all'), 'not-json-at-all');
});
(0, node_test_1.test)('extractText 对缺少 content 的响应透传原始文本', () => {
    const raw = '{"error":{"message":"bad request"}}';
    assert.equal(anthropic_1.anthropicAdapter.extractText(raw), raw);
});
