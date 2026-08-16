import { Protocol, ProtocolAdapter } from './types.js';
/** 按协议名取适配器；未知协议抛错。 */
export declare function getProtocol(name: Protocol): ProtocolAdapter;
