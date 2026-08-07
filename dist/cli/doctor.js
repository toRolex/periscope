"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runDoctor = runDoctor;
/**
 * periscope doctor：本地自检命令（v1.1 占位）。
 * 完整实现见 issue #12；本占位仅诚实提示用户「尚未实现」并返回非零退出码。
 */
async function runDoctor(_argv, _stdout, stderr) {
    stderr.write('periscope doctor: 尚未实现（见 issue #12）\n');
    return 1;
}
