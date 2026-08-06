import { Protocol, ProtocolAdapter } from './types';
import { openaiAdapter } from './openai';
import { anthropicAdapter } from './anthropic';
import { responsesAdapter } from './responses';

const ADAPTERS: Record<Protocol, ProtocolAdapter> = {
  openai: openaiAdapter,
  anthropic: anthropicAdapter,
  responses: responsesAdapter,
};

/** 按协议名取适配器；未知协议抛错。 */
export function getProtocol(name: Protocol): ProtocolAdapter {
  const adapter = ADAPTERS[name];
  if (!adapter) {
    throw new Error(`未知协议: ${name}（可用: ${Object.keys(ADAPTERS).join(', ')}）`);
  }
  return adapter;
}
