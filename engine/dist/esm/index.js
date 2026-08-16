/**
 * periscope-engine：双宿主共享的 describe 引擎叶子（协议适配器 + 任务模板 + HTTP 传输）。
 *
 * 无状态契约：本包不得引入单例或模块级缓存/可变状态——dual-package 分发下
 * CJS 与 ESM 会各加载一份实例，任何模块级状态都会在双宿主间分裂。
 * 只 re-export protocols/templates/transport 的公共面；describe/config 保留在各自宿主副本。
 */
export { DEFAULT_IMAGE_PROMPT } from './protocols/types.js';
export { getProtocol } from './protocols/index.js';
export { openaiAdapter } from './protocols/openai.js';
export { anthropicAdapter } from './protocols/anthropic.js';
export { responsesAdapter } from './protocols/responses.js';
export { tryParseJson } from './protocols/parse.js';
export { TASK_TEMPLATES, resolveIntent } from './core/templates.js';
export { defaultTransport } from './transport.js';
