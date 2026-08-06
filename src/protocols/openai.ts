import { BuildRequestInput, BuiltRequest, DEFAULT_IMAGE_PROMPT, ProtocolAdapter } from './types';

/**
 * openai 协议（chat/completions）。与 anthropic / responses 并列的三协议实现之一。
 * 响应提取遵循「容错透传」：非 JSON / 缺 content 时返回原始响应文本。
 */
export const openaiAdapter: ProtocolAdapter = {
  name: 'openai',

  buildRequest(input: BuildRequestInput): BuiltRequest {
    const headers: Record<string, string> = { 'content-type': 'application/json' };
    if (input.apiKey) {
      headers.authorization = `Bearer ${input.apiKey}`;
    }
    return {
      url: `${input.baseUrl}/chat/completions`,
      headers,
      body: {
        model: input.model,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: input.intent ?? DEFAULT_IMAGE_PROMPT },
              { type: 'image_url', image_url: { url: input.imageDataUrl } },
            ],
          },
        ],
      },
    };
  },

  extractText(responseText: string): string {
    let data: unknown;
    try {
      data = JSON.parse(responseText);
    } catch {
      return responseText; // 非 JSON → 透传原始文本
    }
    const content = (data as any)?.choices?.[0]?.message?.content;
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      const parts = content
        .filter(
          (part: unknown) =>
            part && typeof part === 'object' && typeof (part as any).text === 'string',
        )
        .map((part: unknown) => (part as any).text as string);
      if (parts.length > 0) return parts.join('');
    }
    return responseText; // 缺 content / 形状异常 → 透传原始文本
  },
};
