import { BuildRequestInput, BuiltRequest, DEFAULT_IMAGE_PROMPT, ProtocolAdapter } from './types';
import { tryParseJson } from './parse';

/**
 * openai responses 协议（v1/responses）。本期新增实现。
 * 图片走 input[].content[] 的 input_image 块（image_url 直接携带 data URL）。
 * 响应提取遵循「容错透传」：非 JSON / 缺 output 时返回原始响应文本。
 */
export const responsesAdapter: ProtocolAdapter = {
  name: 'responses',

  buildRequest(input: BuildRequestInput): BuiltRequest {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (input.apiKey) {
      headers.authorization = `Bearer ${input.apiKey}`;
    }
    return {
      url: `${input.baseUrl}/responses`,
      headers,
      body: {
        model: input.model,
        input: [
          {
            role: 'user',
            content: [
              { type: 'input_text', text: input.intent ?? DEFAULT_IMAGE_PROMPT },
              { type: 'input_image', image_url: input.imageDataUrl },
            ],
          },
        ],
      },
    };
  },

  extractText(responseText: string): string {
    const parsed = tryParseJson(responseText);
    if (parsed === null) return responseText; // 非 JSON → 透传原始文本
    const output = (parsed as any)?.output;
    if (!Array.isArray(output)) return responseText; // 缺 output → 透传原始文本
    const parts: string[] = [];
    for (const item of output) {
      if (!item || typeof item !== 'object' || (item as any).type !== 'message') {
        continue; // 只取 message 输出项（忽略 reasoning 等）
      }
      const content = (item as any).content;
      if (!Array.isArray(content)) continue;
      for (const block of content) {
        if (
          block &&
          typeof block === 'object' &&
          (block as any).type === 'output_text' &&
          typeof (block as any).text === 'string'
        ) {
          parts.push((block as any).text as string);
        }
      }
    }
    if (parts.length === 0) return responseText; // 无 output_text → 透传原始文本
    return parts.join('');
  },
};
