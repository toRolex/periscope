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
const templates_1 = require("./templates");
(0, node_test_1.test)('任务模板内置 ocr / table / chart 三份命名 prompt 文案', () => {
    assert.deepEqual(Object.keys(templates_1.TASK_TEMPLATES).sort(), ['chart', 'ocr', 'table']);
    for (const prompt of Object.values(templates_1.TASK_TEMPLATES)) {
        assert.equal(typeof prompt, 'string');
        assert.ok(prompt.length > 0, '模板 prompt 不应为空');
    }
});
(0, node_test_1.test)('resolveIntent 缺省 intent → undefined（保持默认描述文案）', () => {
    assert.equal((0, templates_1.resolveIntent)(undefined), undefined);
});
(0, node_test_1.test)('resolveIntent 命中 ocr 模板名 → 返回 OCR 模板 prompt', () => {
    assert.equal((0, templates_1.resolveIntent)('ocr'), templates_1.TASK_TEMPLATES.ocr);
});
(0, node_test_1.test)('resolveIntent 命中 table 模板名 → 返回 table 模板 prompt', () => {
    assert.equal((0, templates_1.resolveIntent)('table'), templates_1.TASK_TEMPLATES.table);
});
(0, node_test_1.test)('resolveIntent 命中 chart 模板名 → 返回 chart 模板 prompt', () => {
    assert.equal((0, templates_1.resolveIntent)('chart'), templates_1.TASK_TEMPLATES.chart);
});
(0, node_test_1.test)('resolveIntent 自定义 intent 文本原样透传（模板名保留字之外的任意字符串）', () => {
    assert.equal((0, templates_1.resolveIntent)('用中文描述颜色'), '用中文描述颜色');
    assert.equal((0, templates_1.resolveIntent)('读取图片中的报错信息'), '读取图片中的报错信息');
});
