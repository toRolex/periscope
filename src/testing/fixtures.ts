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

/**
 * Agent Plugins 1.0.0 根 plugin.json schema（固定本地 fixture）。
 * 内容从 https://agent-plugins.org/schemas/1.0.0/plugin.schema.json 复制，
 * 作为测试的固定权威来源——避免测试依赖真实 schema URL 造成 CI 抖动（issue #13）。
 */
export const PLUGIN_SCHEMA_1_0_0: Record<string, unknown> = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
  title: 'Agent Plugins Manifest',
  description:
    'Machine-readable schema for plugin.json in Agent Plugins 1.0.0. The Agent Plugins specification defines additional semantic and operational requirements.',
  type: 'object',
  properties: {
    $schema: {
      const: 'https://agent-plugins.org/schemas/1.0.0/plugin.schema.json',
      description:
        'Canonical identifier of the plugin manifest schema for the Agent Plugins version targeted by this document.',
    },
    name: {
      type: 'string',
      minLength: 1,
      maxLength: 64,
      pattern: '^(?!.*(?:--|\\.\\.))[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$',
      description: 'Human-readable plugin name.',
    },
    version: { type: 'string' },
    description: { type: 'string' },
    author: {
      type: 'object',
      properties: {
        name: { type: 'string' },
        email: { type: 'string' },
        url: { type: 'string' },
      },
      additionalProperties: false,
    },
    homepage: { type: 'string' },
    repository: { type: 'string' },
    license: { type: 'string' },
    keywords: { type: 'array', items: { type: 'string' } },
    extensions: {
      type: 'object',
      description:
        'Client-specific manifest data keyed by reverse-domain extension namespace. Agent Plugins assigns no semantics to namespace object contents.',
      additionalProperties: { type: 'object' },
    },
  },
  required: ['$schema', 'name'],
  additionalProperties: false,
};

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
