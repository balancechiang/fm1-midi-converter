[English](README.md) | [简体中文](README.zh-CN.md)

# FM1 MIDI 转换器

单页、离线的 **MIDI ↔ FM1 工程**转换器，面向 M-VAVE FM1 合成器。可将标准 MIDI
写入 FM1 V4 工程模板，也可把 `.fm1` 中保存的步进序列导出为标准 MIDI。

点[这里](https://balancechiang.github.io/fm1-midi-converter/)尝试。

![转换器页面](docs/screenshot.png)

## 功能

- 读取标准 MIDI 文件（格式 0/1），把前 **64 个十六分音符步进**写入 FM1 工程。
- 把通用 MIDI 鼓组音符（35–81）映射到 FM1 的 **808** 鼓组。
- 旋律与和弦声部写入模板中引擎兼容的音轨；能否映射由模板音源决定。
- 保留模板的预设、FX、ARP 与可选调音数据；编曲、速度、工程名会被替换，
  轨道静音／独奏与步进参数锁会重置。
- 转换摘要会列出超出 64 步的音符、缺失的兼容音轨和未映射的鼓音。
- 可将 V4 `.fm1` 工程（含可选调音块）中的 8 轨、64 步序列导出为格式 1 MIDI，
  包括速度、和弦、力度、门长／连音及鼓步进。
- MIDI 导出只读取项目中保存的序列，不会渲染音色、琶音或采样音频；808 鼓垫和
  采样槽会映射到通用 MIDI 鼓音。
- 英文 / 简体中文界面，页头可切换（记在 `localStorage`）。
- 全程在浏览器本地完成：文件由 File API 读取，不会上传。

## 快速开始

**直接打开** —— 下载 `index.html` 双击即可。页面自包含，`file://` 下可用。

**本地起服务**

```sh
cd /path/to/fm1-midi-converter
python -m http.server 8000
# 打开 http://localhost:8000/
```

**GitHub Pages** —— 推送仓库后，进入 *Settings → Pages → Build and
deployment → Deploy from a branch*，分支 `main`，目录 `/ (root)`。无需构建：
根目录的 `index.html` 就是发布页。

## 使用步骤

1. **01 / MIDI FILE** —— 选择或拖入 `.mid` / `.midi` 文件（最大 16 MiB）。
2. **02 / FM1 TEMPLATE** —— 选择一个 **V4 `.fm1` 工程**作为音色模板。转换器
   不会猜测或替换预设，所以模板是必需的。本项目不附带任何模板。
3. **FM1 项目名称** —— 最多 12 个 ASCII 字符，默认取 MIDI 文件名，可修改。
4. **转换项目** —— 查看摘要（速度、鼓轨、旋律轨、写入音符、跳过项），然后
   **下载 .fm1 工程**。

下载的工程按平常方式导入设备或 FM1 编辑器即可。

## 限制

| 项目 | 限制 |
| --- | --- |
| 输入 | 标准 MIDI 文件，格式 0/1，最大 16 MiB，10 万个音符 |
| MIDI 导入输出 | FM1P V4 `.fm1` 工程，4064 字节负载（含调音为 4264） |
| MIDI 导出输出 | 格式 1 标准 MIDI，96 PPQN |
| 序列范围 | 64 个十六分音符步进 |
| 工程名 | 12 个 ASCII 字符 |
| 方向 | MIDI → FM1；FM1 → 标准 MIDI |

鼓组只会写入 808 音轨；MIDI 声部只会写入引擎兼容的音轨，其余内容会出现在摘要里，
不会被写入。

## 开发

目录结构：

```
index.html          生成的自包含页面（提交到仓库以便 Pages 直接发布）
dev.html            同一页面，用 <script src="src/..."> 引用，便于调试
src/converter.js    MIDI 解析、FM1 工程读写与 MIDI 导出
src/i18n.js         界面字符串表（英文 / 简体中文）
src/shell.html      页面外壳、转换器标记与样式、脚本占位
tools/build.py      由 src/ 生成 index.html 与 dev.html
docs/screenshot.png
```

修改 `src/` 后重新生成：

```sh
python3 tools/build.py
```

`tools/build.py` 只用 Python 标准库，把 `src/shell.html` 里的
`/*FM1_I18N*/` 与 `/*FM1_CONVERTER*/` 占位替换成脚本内容（`index.html`
内联，`dev.html` 用外链）。

来源：转换逻辑、字符串表和面板样式／标记抽取自 M-VAVE 的 **FM1 Open 开发套件**
（<https://open.m-vave.com/fm1-workbench>，`sdk/MidiConverter.js`、`sdk/I18n.js`、
`sdk/Update.html.in`）。本仓库的改动：独立页面外壳与构建脚本、去掉工作台模拟器
与设备升级界面、补了一条缺失的英文字符串（`按模板音源` → “Per template engine”）。

## 不包含的内容

本项目不含固件、FM1 二进制 SDK、杰理工具链、采样数据，也不含任何设备升级／刷写
代码，无法更新或改动硬件；它只在浏览器里生成 `.fm1` 工程文件。

## 许可

GNU GPL 第 3 版**仅此版本**，附 FM1 链接例外——与上游 FM1 Open 开发套件相同。
完整条款见 [LICENSE.md](LICENSE.md)，组件说明见 [THIRD_PARTY.md](THIRD_PARTY.md)。

不提供担保。在设备上替换工程前请先备份。

## 隐私

没有网络请求、统计、Cookie 或外部资源。页面只用 `localStorage` 记住所选语言。
