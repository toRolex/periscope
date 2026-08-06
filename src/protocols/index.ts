import { ProtocolAdapter } from './types';
import { openaiAdapter } from './openai';

const ADAPTERS: Record<string, ProtocolAdapter> = {
  openai: openaiAdapter,
  // 扩展位：anthropic（v1/messages）、responses（v1/responses）在后续 issue 实现后注册于此。
};

/** 按协议名取适配器；未知协议抛错。 */
export function getProtocol(name: string): ProtocolAdapter {
  const adapter = ADAPTERS[name];
  if (!adapter) {
    throw new Error(`未知协议: ${name}（可用: ${Object.keys(ADAPTERS).join(', ')}）`);
  }
  return adapter;
}
