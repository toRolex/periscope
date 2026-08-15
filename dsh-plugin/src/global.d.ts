/**
 * 手写 ambient 声明，覆盖本包用到的 Node 内建能力。
 *
 * 与主仓 src/global.d.ts 同策略（issue #2 红线：devDependencies 仅 typescript，
 * 不引入 @types/node），dsh 插件包保持同一零依赖约束，类型按需简化、只声明用到的最小面。
 */

/** 字节缓冲区的最小形态（Buffer 的简化投影，兼具 Uint8Array 形态与 toString(encoding)）。 */
interface ByteBuf extends Uint8Array {
  toString(encoding?: string): string;
}

declare const process: {
  env: Record<string, string | undefined>;
};

declare const Buffer: {
  from(data: string, encoding?: 'base64' | 'utf8'): ByteBuf;
  from(data: Uint8Array): ByteBuf;
};

declare const fetch: (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  status: number;
  ok: boolean;
  text(): Promise<string>;
}>;

/** 定时器最小面（桥接层视觉描述超时降级用）；句柄收窄为 unknown。 */
declare function setTimeout(fn: () => void, ms: number): unknown;
declare function clearTimeout(handle: unknown): void;

declare module 'node:fs' {
  export function readFileSync(p: string): ByteBuf;
  export function writeFileSync(p: string, data: string | ByteBuf): void;
  export function mkdirSync(p: string, opts?: { recursive?: boolean }): string | undefined;
  export function existsSync(p: string): boolean;
  export function mkdtempSync(prefix: string): string;
}

declare module 'node:os' {
  export function homedir(): string;
  export function tmpdir(): string;
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
}

declare module 'node:http' {
  export function createServer(
    handler?: (req: unknown, res: unknown) => void,
  ): any;
}

declare module 'node:test' {
  export interface TestContext {
    after(fn: () => void | Promise<void>): void;
  }
  export function test(name: string, fn: (t: TestContext) => void | Promise<void>): void;
}

declare module 'node:assert' {
  export function ok(value: unknown, message?: string): void;
  export function equal(actual: unknown, expected: unknown, message?: string): void;
  export function notEqual(actual: unknown, expected: unknown, message?: string): void;
  export function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  export function match(value: string, regexp: RegExp, message?: string): void;
  export function doesNotMatch(value: string, regexp: RegExp, message?: string): void;
  export function throws(fn: () => void, error?: unknown, message?: string): void;
  export function rejects(
    promise: Promise<unknown>,
    error?: unknown,
    message?: string,
  ): Promise<unknown>;
}
