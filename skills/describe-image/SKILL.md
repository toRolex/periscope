---
name: describe-image
description: 用 periscope 调用外部视觉模型描述图片。当用户贴图、引用本地图片路径或远程图片 URL，需要图片的文字描述、读取图片文字或解析图表时使用。
allowed-tools: Bash(node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js *)
---

用户需要描述图片时，运行以下命令把图片交给 periscope 的视觉模型：

`node ${CLAUDE_PLUGIN_ROOT}/dist/cli/index.js describe <图片路径或URL> [--intent "描述意图"]`

- `<图片路径或URL>`：本地图片路径或 http(s) 图片 URL，可传多个，空格分隔。
- `--intent "..."`（可选）：描述意图，如"读取图片中的文字"、"解析图表"。
- 命令成功时 stdout 输出纯文本描述，直接呈现给用户；失败时 stderr 输出错误信息。

无需下载或复制任何文件，图片源直接传给命令。
