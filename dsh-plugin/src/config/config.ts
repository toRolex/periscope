import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { Protocol } from 'periscope-engine';

export interface ProtocolEndpointConfig {
  baseUrl: string;
  model: string;
}

/**
 * 配置文件结构。protocol 指定当前激活的协议；
 * openai / anthropic / responses 是各协议的 baseUrl 与 model（三协议均已实现，
 * 与 periscope-engine 的协议适配器一一对应）。
 *
 * 本文件与主仓 src/config/config.ts 逐字一致（纯拷贝，ADR 0003 决策 6）。
 * 桥接层（#28）负责把 dsh Config（cordis.yml）映射为本结构后经 DescribeOptions.config 注入；
 * 未注入时回落到 loadConfig（与 Claude Code 版同一兜底契约）。
 */
export interface PeriscopeConfig {
  protocol: Protocol;
  apiKey: string;
  openai: ProtocolEndpointConfig;
  anthropic: ProtocolEndpointConfig;
  responses: ProtocolEndpointConfig;
}

/**
 * 空白模板配置：三协议 baseUrl / model 均为空串，不绑定任何服务商。
 * protocol 默认 openai 仅指请求形状（openai 兼容协议），不指服务商。
 * 首次运行懒创建时写入本模板；用户需运行 init 向导填入自己的端点。
 */
export const DEFAULT_CONFIG: PeriscopeConfig = {
  protocol: 'openai',
  apiKey: '',
  openai: {
    baseUrl: '',
    model: '',
  },
  anthropic: {
    baseUrl: '',
    model: '',
  },
  responses: {
    baseUrl: '',
    model: '',
  },
};

/**
 * 激活协议端点非空校验（单一事实源，describe 与 doctor 共享）：
 * 端点段缺失、或 baseUrl / model 为空串（trim 后）→ 返回可操作报错文案；合法 → null。
 * doctor 直接读配置文件（无合并），describe 走 loadConfig（含深合并），故入参为宽松结构。
 */
export function endpointMissingError(
  protocol: string,
  endpoint: { baseUrl?: unknown; model?: unknown } | undefined,
): string | null {
  const baseUrl = typeof endpoint?.baseUrl === 'string' ? endpoint.baseUrl.trim() : '';
  const model = typeof endpoint?.model === 'string' ? endpoint.model.trim() : '';
  if (baseUrl !== '' && model !== '') return null;
  return `协议 ${protocol} 未配置 baseUrl/model，请运行 init 向导配置`;
}

export interface ConfigPathEnv {
  HOME?: string | undefined;
  PERISCOPE_CONFIG?: string | undefined;
}

/** 从可注入 env 派生配置路径：PERISCOPE_CONFIG 优先，否则 HOME/.config/periscope/config.json；HOME 缺省用 os.homedir() 兜底。 */
export function configPathForEnv(env: ConfigPathEnv = {}): string {
  return (
    env.PERISCOPE_CONFIG ??
    path.join(env.HOME ?? os.homedir(), '.config', 'periscope', 'config.json')
  );
}

/** 配置路径：PERISCOPE_CONFIG 优先，默认 ~/.config/periscope/config.json。 */
export function defaultConfigPath(): string {
  return configPathForEnv({ PERISCOPE_CONFIG: process.env.PERISCOPE_CONFIG });
}

export interface LoadConfigOptions {
  /** 显式覆盖配置路径（等价于 PERISCOPE_CONFIG，但优先级更高，供测试注入）。 */
  configPath?: string;
}

/**
 * 读取配置；文件不存在时懒创建默认配置。
 * apiKey 解析规则：PERISCOPE_API_KEY 环境变量优先于配置文件中的 apiKey。
 * 合并规则：顶层字段（protocol / apiKey）浅合并；各协议段深合并
 * （...default[protocol], ...file[protocol]），避免用户只改 baseUrl 时丢失 model。
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
  const merged: PeriscopeConfig = {
    ...DEFAULT_CONFIG,
    ...fileConfig,
    openai: { ...DEFAULT_CONFIG.openai, ...(fileConfig.openai ?? {}) },
    anthropic: { ...DEFAULT_CONFIG.anthropic, ...(fileConfig.anthropic ?? {}) },
    responses: { ...DEFAULT_CONFIG.responses, ...(fileConfig.responses ?? {}) },
  };
  const apiKey = process.env.PERISCOPE_API_KEY ?? merged.apiKey;
  return { ...merged, apiKey };
}
