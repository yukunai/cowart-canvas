# Cowart Canvas

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)

Cowart Canvas 是一个运行在本机浏览器里的改图画布。它的核心用途是：把 AI 图片中需要修改的位置直接圈出来、写出来、标出来，然后整理成 Codex 可以继续改图的任务说明。

它也内置了图片生成视频的任务面板，可以在前台填写视频 API，查看视频历史结果，并把视频保存到本机下载目录。

界面内置中文和英文两套语言，可以在左上角工具栏里切换。

所有导入图片、任务文件、视频任务文件和 API Key 默认都保存在本机。只有当你主动提交给视频平台或把任务交给 Codex 时，相关内容才会被发送出去。

## 展示

### 演示视频

[查看或下载图生视频演示](docs/videos/01-image-to-video-demo.mp4)

### 改图画布

![改图画布空状态](docs/screenshots/01-edit-canvas-empty.png)

### 图片生成视频

![图生视频结果与历史记录](docs/screenshots/02-video-results-panel.png)

### 参考画布与标注

![参考画布和可拖拽放大的标注框](docs/screenshots/03-reference-canvas-annotation.png)

### 交给 Codex 继续改图

![带标注的改图任务交给 Codex](docs/screenshots/04-codex-handoff-workflow.png)

### 视频工作流

![视频生成和历史结果工作流](docs/screenshots/05-video-workflow-wide.png)

## 功能

- 支持上传、粘贴、拖拽或从本机最近图片导入到改图画布。
- 左侧提供双列入口：`最近生成` 和 `最近下载`。
- `最近生成` 只显示 Codex 最近生成的图片和 Cowart 本地生成结果。
- `最近下载` 会扫描 `~/Downloads` 顶层目录，并优先显示疑似 ChatGPT/OpenAI/DALL-E 下载的图片。
- 支持编号标注、箭头、画笔、文字、圆圈等改图标记。
- 编号/文字标注框右下角有隐藏式拖拽点，拖大框时字号也会一起变大。
- 支持选择标注颜色、形状样式，以及 S/M/L/XL 默认尺寸。
- 主图下方最多可以增加 3 个参考画布，用来放产品、物件、局部元素或风格参考图。
- 可以把画布上的所有标注整理成结构化的 Codex 改图提示词。
- 界面支持中文和英文切换。
- 图生视频支持 1 到 5 张参考图。
- 视频 API 可以直接在前台设置，也可以写入 `.env.local`。
- 视频结果会展示在右侧画布区域，并保留历史记录。
- 支持刷新平台结果、预览视频、下载视频，以及直接保存到 `~/Downloads/Cowart Videos`。

## 环境要求

- Node.js 22 或更新版本
- npm
- 现代浏览器，例如 Chromium、Chrome、Edge、Safari 或 Firefox

macOS 用户可以使用内置的后台服务脚本。普通开发模式本质上是一个 Vite 本地网页应用，Windows/Linux 也可以用 `npm run dev` 启动。

## 快速开始

```bash
git clone https://github.com/yukunai/cowart-canvas.git
cd cowart-canvas
npm install
npm run dev
```

打开：

```text
http://127.0.0.1:43219/?installed=1
```

`?installed=1` 只是为了兼容本地浏览器布局的参数。应用也可以直接通过下面这个地址打开：

```text
http://127.0.0.1:43219/
```

## macOS 后台服务

安装本机 LaunchAgent，并打开浏览器应用：

```bash
npm run install:mac
```

之后再次打开：

```bash
npm run open
```

卸载后台服务：

```bash
npm run uninstall:mac
```

## 图片导入逻辑

`最近生成` 的范围是刻意收窄的。它不会显示截图、剪贴板图片、Downloads、Desktop 文件，也不会显示临时的 `codex-clipboard-*` 图片。它只会读取：

- `~/.codex/generated_images`
- Cowart 本地生成结果目录 `codex-image-tasks`

`最近下载` 用来处理你从 ChatGPT 或其他工具下载到本机的图片。它会扫描 `~/Downloads` 顶层目录，按时间排序，并优先显示文件名看起来像 ChatGPT/OpenAI/DALL-E 下载图的图片。

应用不能直接读取 ChatGPT 云端对话里的私有图片。你需要先把图片下载、复制、粘贴或拖拽到 Cowart Canvas。

## 改图画布流程

1. 通过 `上传图片`、`粘贴图片`、`最近生成`、`最近下载` 或拖拽导入图片。
2. 在悬浮画布工具栏中选择工具。
3. 用编号、箭头、画笔、文字或圆圈标出要修改的位置。
4. 拖动文字/编号标注框右下角的小控件，可以同时放大标注框和字号。
5. 可选：点击 `增加画布`，一次增加一个参考槽，最多 3 个。
6. 在 `补充说明` 中写整体要求。
7. 点击 `交给 Codex`，导出结构化任务，并复制给 Codex 的改图指令。

生成的改图任务会写入 `codex-image-tasks/`。这个目录已经加入 `.gitignore`，不会被提交到仓库。

## 图片生成视频

视频面板支持这些平台：

- Kling / 可灵
- Volcengine Ark / 火山方舟 / Seedance
- Alibaba DashScope / 阿里万象
- Runway
- Luma
- fal.ai
- Replicate

可以选择 1 到 5 张图片作为视频参考图。视频时长支持 4 秒到 15 秒。

视频任务会写入 `video-tasks/`。这个目录已经加入 `.gitignore`，不会被提交到仓库。

## API 设置

你可以用两种方式配置视频 API。

方式 1：在前台设置：

1. 打开 `生成视频`。
2. 点击 `API 设置`。
3. 选择视频平台。
4. 填写 API Key，以及可选的模型和接口地址。
5. 保存。

方式 2：使用 `.env.local`：

```bash
cp .env.example .env.local
```

只填写你需要的平台，然后重启 dev server 或后台服务。

不要提交 `.env.local`。

## 视频下载

当视频平台返回视频 URL 后，你可以：

- 在右侧结果区预览视频
- 通过浏览器下载视频
- 直接保存到本机目录：

```text
~/Downloads/Cowart Videos
```

## 验证

```bash
npm run lint
npm run build
```

## 仓库卫生

以下本地运行目录和产物已经被忽略：

- `node_modules`
- `dist`
- `.playwright-cli`
- `codex-image-tasks`
- `video-tasks`
- `.env.local`
- 桌面端打包产物

## 许可证

MIT
