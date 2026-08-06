import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DEFAULT_CONFIG, PeriscopeConfig } from '../config/config';

/** 1x1 透明 PNG（base64）。mock 端点不校验图片内容，用于测试 payload 的 data URL 构造。 */
export const PNG_1PX_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

export function makeTempDir(prefix = 'periscope-test-'): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** 在 dir 下写入一张 fixture 图片，返回其绝对路径。 */
export function writeFixtureImage(dir: string, name = 'fixture.png'): string {
  const filePath = path.join(dir, name);
  fs.writeFileSync(filePath, Buffer.from(PNG_1PX_BASE64, 'base64'));
  return filePath;
}

/** 在 dir 下写入一份 periscope 配置文件，返回路径与配置对象。 */
export function writeConfigFile(
  dir: string,
  overrides: Partial<PeriscopeConfig> = {},
): { path: string; config: PeriscopeConfig } {
  const config: PeriscopeConfig = { ...DEFAULT_CONFIG, ...overrides };
  const filePath = path.join(dir, 'config.json');
  fs.writeFileSync(filePath, JSON.stringify(config, null, 2));
  return { path: filePath, config };
}

/** 临时设置/删除若干环境变量，测试结束自动还原。 */
export function withEnv(
  env: Record<string, string | undefined>,
  fn: () => void,
): void {
  const saved = new Map<string, string | undefined>();
  for (const key of Object.keys(env)) {
    saved.set(key, process.env[key]);
    if (env[key] === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = env[key];
    }
  }
  try {
    fn();
  } finally {
    for (const [key, value] of saved) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

export interface MakeTestEnvOptions {
  /** 设置 PERISCOPE_API_KEY。 */
  apiKey: string;
  /** makeTempDir 前缀，隔离各测试的真实 HOME。 */
  homePrefix: string;
  /** 提供时设置 PERISCOPE_CACHE_DIR（隔离缓存目录）；省略时不设置。 */
  cacheDir?: string;
}

/** 构造隔离的测试环境：继承 process.env，覆盖 PERISCOPE_CONFIG/API_KEY/HOME（及可选 CACHE_DIR）。 */
export function makeTestEnv(
  configPath: string,
  options: MakeTestEnvOptions,
): Record<string, string | undefined> {
  const env: Record<string, string | undefined> = {
    ...process.env,
    PERISCOPE_CONFIG: configPath,
    PERISCOPE_API_KEY: options.apiKey,
    HOME: makeTempDir(options.homePrefix),
  };
  if (options.cacheDir !== undefined) {
    env.PERISCOPE_CACHE_DIR = options.cacheDir;
  }
  return env;
}
