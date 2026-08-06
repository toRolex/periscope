/** 已实现的视觉协议名。协议适配器按此注册，config.protocol 限定为该联合。 */
export type Protocol = 'openai' | 'anthropic' | 'responses';

/** 未提供 intent 时的默认图片描述提示词，三协议共用同一文案。 */
export const DEFAULT_IMAGE_PROMPT = '描述这张图片';

export interface BuildRequestInput {
  baseUrl: string;
  model: string;
  /** 本地图片的 data URL（data:image/<mime>;base64,<...>）。 */
  imageDataUrl: string;
  intent?: string;
  apiKey?: string;
}

export interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

/**
 * 协议适配器：负责把「基座 + 图片」翻译成某协议的具体请求（payload 构造），
 * 并把响应文本提取为描述（响应提取）。每协议一套实现，可独立注册。
 */
export interface ProtocolAdapter {
  name: string;
  buildRequest(input: BuildRequestInput): BuiltRequest;
  /** 对 2xx 响应做容错提取：提取失败时透传原始文本。 */
  extractText(responseText: string): string;
}
