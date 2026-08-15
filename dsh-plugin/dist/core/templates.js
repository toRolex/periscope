/**
 * 任务模板模块（core 层）：内置命名 prompt 文案（ocr / table / chart）。
 * describe 在构造请求前解析 intent——命中模板名则替换为模板 prompt，否则原样透传。
 * 模板名是保留字：意图为 `ocr` / `table` / `chart` 时不能作为自定义文本原样发送。
 *
 * 本文件与主仓 src/core/templates.ts 逐字一致（纯拷贝，ADR 0003 决策 6）。
 */
/** 内置命名任务模板：模板名 → prompt 文案。 */
export const TASK_TEMPLATES = {
    ocr: '提取图片中的全部文字内容',
    table: '把图片中的表格转换为 Markdown 表格',
    chart: '把图片中的图表转换为结构化文字描述',
};
/**
 * 解析 intent 为发送给视觉模型的 prompt。
 * 命中模板名 → 返回模板 prompt；自定义文本 → 原样透传；缺省 → undefined（保持默认描述文案）。
 */
export function resolveIntent(intent) {
    if (intent === undefined)
        return undefined;
    return TASK_TEMPLATES[intent] ?? intent;
}
