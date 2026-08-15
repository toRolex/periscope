import { test } from 'node:test';
import * as assert from 'node:assert';
import { TASK_TEMPLATES, resolveIntent } from './templates.js';
test('任务模板内置 ocr / table / chart 三份命名 prompt 文案', () => {
    assert.deepEqual(Object.keys(TASK_TEMPLATES).sort(), ['chart', 'ocr', 'table']);
    for (const prompt of Object.values(TASK_TEMPLATES)) {
        assert.equal(typeof prompt, 'string');
        assert.ok(prompt.length > 0, '模板 prompt 不应为空');
    }
});
test('resolveIntent 缺省 intent → undefined（保持默认描述文案）', () => {
    assert.equal(resolveIntent(undefined), undefined);
});
test('resolveIntent 命中 ocr 模板名 → 返回 OCR 模板 prompt', () => {
    assert.equal(resolveIntent('ocr'), TASK_TEMPLATES.ocr);
});
test('resolveIntent 命中 table 模板名 → 返回 table 模板 prompt', () => {
    assert.equal(resolveIntent('table'), TASK_TEMPLATES.table);
});
test('resolveIntent 命中 chart 模板名 → 返回 chart 模板 prompt', () => {
    assert.equal(resolveIntent('chart'), TASK_TEMPLATES.chart);
});
test('resolveIntent 自定义 intent 文本原样透传（模板名保留字之外的任意字符串）', () => {
    assert.equal(resolveIntent('用中文描述颜色'), '用中文描述颜色');
    assert.equal(resolveIntent('读取图片中的报错信息'), '读取图片中的报错信息');
});
