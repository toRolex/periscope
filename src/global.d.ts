/**
 * 手写 ambient 声明，覆盖本项目用到的 Node 内建能力。
 *
 * 决策：issue #2 红线要求 devDependencies 仅 typescript，不引入 @types/node。
 * 因此用这份最小的声明让 tsc 在 strict 模式下通过，类型按需简化。
 */

/** 字节缓冲区的最小形态（Buffer 的简化投影）。 */
interface ByteBuf {
  toString(encoding?: string): string;
}

declare const process: {
  env: Record<string, string | undefined>;
  argv: string[];
  stdin: Readable;
  stdout: Writable;
  stderr: Writable;
  exitCode: number | string | undefined;
  execPath: string;
  version: string;
};

declare const __dirname: string;
declare const __filename: string;

declare const Buffer: {
  from(data: string, encoding?: 'base64' | 'utf8'): ByteBuf;
  isBuffer(arg: unknown): boolean;
};
type Buffer = ByteBuf;

declare const fetch: (
  url: string,
  init?: { method?: string; headers?: Record<string, string>; body?: string },
) => Promise<{
  status: number;
  ok: boolean;
  text(): Promise<string>;
  json(): Promise<unknown>;
}>;

declare const require: ((id: string) => any) & { main?: { exports: unknown } };
declare const module: { exports: unknown; main?: unknown };

declare module 'node:fs' {
  export interface Stats {
    mtimeMs: number;
    size: number;
  }
  export function readFileSync(p: string): ByteBuf;
  export function readFileSync(p: number, encoding: string): string;
  export function writeFileSync(p: string, data: string | ByteBuf): void;
  export function mkdirSync(p: string, opts?: { recursive?: boolean }): string | undefined;
  export function existsSync(p: string): boolean;
  export function mkdtempSync(prefix: string): string;
  export function statSync(p: string): Stats;
  export function utimesSync(p: string, atime: Date, mtime: Date): void;
}

declare module 'node:crypto' {
  export function createHash(algorithm: string): {
    update(data: string): { digest(encoding: string): string };
  };
}

declare module 'node:path' {
  export function join(...parts: string[]): string;
  export function dirname(p: string): string;
  export function extname(p: string): string;
  export function resolve(...parts: string[]): string;
}

declare module 'node:os' {
  export function homedir(): string;
  export function tmpdir(): string;
}

declare module 'node:http' {
  export function createServer(
    handler?: (req: unknown, res: unknown) => void,
  ): any;
}

declare module 'node:child_process' {
  export function execFile(
    file: string,
    args: string[],
    options?: { env?: Record<string, string | undefined>; cwd?: string },
    callback?: (error: Error | null, stdout: string, stderr: string) => void,
  ): unknown;
  export function spawn(
    command: string,
    args?: string[],
    options?: { env?: Record<string, string | undefined>; cwd?: string },
  ): any;
}

declare module 'node:readline' {
  import { Readable } from 'node:stream';

  export interface Interface {
    [Symbol.asyncIterator](): AsyncIterableIterator<string>;
    close(): void;
  }

  export function createInterface(options: {
    input: Readable;
    crlfDelay?: number;
  }): Interface;
}

declare module 'node:stream' {
  export interface Readable {
    on(event: 'data', listener: (chunk: Buffer | string) => void): this;
    on(event: 'end', listener: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'readable', listener: () => void): this;
    off(event: 'data', listener: (chunk: Buffer | string) => void): this;
    off(event: 'end', listener: () => void): this;
    off(event: 'error', listener: (err: Error) => void): this;
    off(event: 'readable', listener: () => void): this;
    removeListener(event: 'data', listener: (chunk: Buffer | string) => void): this;
    removeListener(event: 'end', listener: () => void): this;
    removeListener(event: 'error', listener: (err: Error) => void): this;
    removeListener(event: 'readable', listener: () => void): this;
    push(chunk: string | Buffer | null): boolean;
    resume(): this;
    pause(): this;
    isPaused(): boolean;
    setEncoding(encoding: string): this;
    read(size?: number): string | Buffer | null;
    readonly readableLength: number;
  }
  export class Readable {
    constructor(opts?: { read?(size: number): void; encoding?: string } | undefined);
  }
  export interface Writable {
    write(chunk: string | Buffer, cb?: (err?: Error | null) => void): boolean;
    end(chunk?: string | Buffer, cb?: () => void): this;
    on(event: 'error', listener: (err: Error) => void): this;
    on(event: 'finish', listener: () => void): this;
    on(event: string, listener: (...args: unknown[]) => void): this;
  }
  export class Writable {
    constructor(opts?: { write?(chunk: Buffer, enc: string, cb: () => void): void } | undefined);
  }
  export function finished(stream: unknown, callback: (err: Error | null) => void): void;
}

declare module 'node:util' {
  export function promisify(fn: (...args: any[]) => any): any;
}

declare module 'node:test' {
  export interface TestContext {
    after(fn: () => void | Promise<void>): void;
    before(fn: () => void | Promise<void>): void;
  }
  export function test(name: string, fn: (t: TestContext) => void | Promise<void>): void;
  export function test(
    name: string,
    options: unknown,
    fn: (t: TestContext) => void | Promise<void>,
  ): void;
  export function describe(name: string, fn: () => void | Promise<void>): void;
  export function it(name: string, fn: (t: TestContext) => void | Promise<void>): void;
  export function before(fn: () => void | Promise<void>): void;
  export function after(fn: () => void | Promise<void>): void;
}

declare module 'node:assert' {
  export function ok(value: unknown, message?: string): void;
  export function equal(actual: unknown, expected: unknown, message?: string): void;
  export function notEqual(actual: unknown, expected: unknown, message?: string): void;
  export function deepEqual(actual: unknown, expected: unknown, message?: string): void;
  export function deepStrictEqual(actual: unknown, expected: unknown, message?: string): void;
  export function match(value: string, regexp: RegExp, message?: string): void;
  export function doesNotMatch(value: string, regexp: RegExp, message?: string): void;
  export function strictEqual(actual: unknown, expected: unknown, message?: string): void;
  export function notStrictEqual(actual: unknown, expected: unknown, message?: string): void;
  export function throws(fn: () => void, error?: unknown, message?: string): void;
  export function rejects(
    promise: Promise<unknown>,
    error?: unknown,
    message?: string,
  ): Promise<unknown>;
}
