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
const responses_js_1 = require("./responses.js");
const templates_js_1 = require("../core/templates.js");
(0, node_test_1.test)('buildRequest 构造 responses v1/responses 请求', () => {
    const req = responses_js_1.responsesAdapter.buildRequest({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        imageDataUrl: 'data:image/png;base64,AAAA',
        intent: '描述这张图片里的内容',
        apiKey: 'sk-test',
    });
    assert.equal(req.url, 'https://api.openai.com/v1/responses');
    assert.equal(req.headers['authorization'], 'Bearer sk-test');
    assert.equal(req.headers['content-type'], 'application/json');
    const body = req.body;
    assert.equal(body.model, 'gpt-4o-mini');
    assert.equal(body.input.length, 1);
    assert.equal(body.input[0].role, 'user');
    assert.equal(body.input[0].content.length, 2);
    assert.equal(body.input[0].content[0].type, 'input_text');
    assert.equal(body.input[0].content[0].text, '描述这张图片里的内容');
    assert.equal(body.input[0].content[1].type, 'input_image');
    assert.equal(body.input[0].content[1].image_url, 'data:image/png;base64,AAAA');
});
(0, node_test_1.test)('buildRequest 未提供 intent 时使用默认提示词', () => {
    const req = responses_js_1.responsesAdapter.buildRequest({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        imageDataUrl: 'data:image/png;base64,AAAA',
    });
    const body = req.body;
    assert.equal(body.input[0].content[0].text, '描述这张图片');
});
(0, node_test_1.test)('buildRequest 未提供 apiKey 时不设置 Authorization 头', () => {
    const req = responses_js_1.responsesAdapter.buildRequest({
        baseUrl: 'https://api.openai.com/v1',
        model: 'gpt-4o-mini',
        imageDataUrl: 'data:image/png;base64,AAAA',
    });
    assert.equal(req.headers['authorization'], undefined);
});
(0, node_test_1.test)('extractText 提取 output 中 message 的 output_text 拼接文本', () => {
    const raw = JSON.stringify({
        output: [
            {
                type: 'message',
                role: 'assistant',
                content: [
                    { type: 'output_text', text: '画面里有一只猫' },
                    { type: 'refusal', text: 'no' },
                ],
            },
        ],
    });
    assert.equal(responses_js_1.responsesAdapter.extractText(raw), '画面里有一只猫');
});
(0, node_test_1.test)('extractText 忽略非 message 的 output 项（如 reasoning）', () => {
    const raw = JSON.stringify({
        output: [
            { type: 'reasoning', summary: [{ type: 'summary_text', text: '思考中' }] },
            {
                type: 'message',
                role: 'assistant',
                content: [{ type: 'output_text', text: '最终描述' }],
            },
        ],
    });
    assert.equal(responses_js_1.responsesAdapter.extractText(raw), '最终描述');
});
(0, node_test_1.test)('extractText 对非 JSON 响应透传原始文本', () => {
    assert.equal(responses_js_1.responsesAdapter.extractText('not-json-at-all'), 'not-json-at-all');
});
(0, node_test_1.test)('extractText 对缺少 output 的响应透传原始文本', () => {
    const raw = '{"error":{"message":"bad request"}}';
    assert.equal(responses_js_1.responsesAdapter.extractText(raw), raw);
});
(0, node_test_1.test)('buildRequest 把 ocr/table/chart 模板 prompt 放进 input_text 位置', () => {
    for (const prompt of Object.values(templates_js_1.TASK_TEMPLATES)) {
        const req = responses_js_1.responsesAdapter.buildRequest({
            baseUrl: 'https://api.openai.com/v1',
            model: 'gpt-4o-mini',
            imageDataUrl: 'data:image/png;base64,AAAA',
            intent: prompt,
        });
        const body = req.body;
        assert.equal(body.input[0].content[0].type, 'input_text');
        assert.equal(body.input[0].content[0].text, prompt);
    }
});
