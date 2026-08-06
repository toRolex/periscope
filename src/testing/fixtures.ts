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
