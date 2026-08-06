import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';

export interface ProtocolEndpointConfig {
  baseUrl: string;
  model: string;
}

/**
 * 配置文件结构。protocol 指定当前激活的协议；
 * openai / anthropic / responses 是各协议的 baseUrl 与 model（本期只实现 openai，
 * 后两者作为扩展位保留在默认配置中）。
 */
export interface PeriscopeConfig {
  protocol: string;
  apiKey: string;
  openai: ProtocolEndpointConfig;
  anthropic: ProtocolEndpointConfig;
  responses: ProtocolEndpointConfig;
}

export const DEFAULT_CONFIG: PeriscopeConfig = {
  protocol: 'openai',
  apiKey: '',
  openai: {
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    model: 'qwen-vl-max',
  },
  anthropic: {
    baseUrl: 'https://api.anthropic.com',
    model: 'claude-3-5-sonnet-latest',
  },
  responses: {
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
  },
};

/** 配置路径：PERISCOPE_CONFIG 优先，默认 ~/.config/periscope/config.json。 */
export function defaultConfigPath(): string {
  return (
    process.env.PERISCOPE_CONFIG ??
    path.join(os.homedir(), '.config', 'periscope', 'config.json')
  );
}

export interface LoadConfigOptions {
  /** 显式覆盖配置路径（等价于 PERISCOPE_CONFIG，但优先级更高，供测试注入）。 */
  configPath?: string;
}

/**
 * 读取配置；文件不存在时懒创建默认配置。
 * apiKey 解析规则：PERISCOPE_API_KEY 环境变量优先于配置文件中的 apiKey。
 */
export function loadConfig(options: LoadConfigOptions = {}): PeriscopeConfig {
  const configPath = options.configPath ?? defaultConfigPath();
  let fileConfig: Partial<PeriscopeConfig>;
  if (fs.existsSync(configPath)) {
    const raw = fs.readFileSync(configPath).toString('utf8');
    fileConfig = JSON.parse(raw) as Partial<PeriscopeConfig>;
  } else {
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_CONFIG, null, 2) + '\n');
    fileConfig = DEFAULT_CONFIG;
  }
  const merged: PeriscopeConfig = { ...DEFAULT_CONFIG, ...fileConfig };
  const apiKey = process.env.PERISCOPE_API_KEY ?? merged.apiKey;
  return { ...merged, apiKey };
}
