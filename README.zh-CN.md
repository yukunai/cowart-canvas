# Cowart Canvas

**语言：** [English](README.md) | [简体中文](README.zh-CN.md)

Cowart Canvas 是一个运行在本机浏览器里的 AI 创作工作台，覆盖改图画布、图片生成、图生视频、AI 视频剪辑、商品详情页设计和 Markdown 文本管理。

它最核心的用途是：把 AI 图片中需要修改的位置直接圈出来、写出来、标出来，然后整理成 Codex 可以继续改图的任务说明，或者直接提交到图片生成/改图 API。除此之外，它也内置了图生视频任务面板、独立图片生成页、商品详情页生成页，以及一个本地 Markdown 文本页，用来保存提示词、代码块、改图说明和项目记录。

界面内置中文和英文两套语言，可以在左上角工具栏里切换。

所有导入图片、任务文件、视频任务文件、Markdown 笔记、本地备份和 API Key 默认都保存在本机。只有当你主动提交给图片/视频平台，或者把任务交给 Codex 时，相关内容才会被发送出去。

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
- 改图侧栏顶部可以直接设置 Skill / 生成策略、提示词、反向提示词、图片平台和生成比例。
- 可以把画布上的所有标注整理成结构化的 Codex 改图提示词。
- 可以把带标注的改图任务直接提交到 fal.ai、阿里万象、火山方舟、可灵等图片生成/改图 API。
- 可以选择图片生成比例，包括自动/沿用底图、1:1、16:9、9:16、4:3、3:4、3:2、2:3。
- 独立的“商品详情页生成”页面可以根据主产品图、参考图、卖点、详情模块、品牌调性和图片 API 生成电商商品详情页图片。
- 独立“文本”页面支持分类、新笔记、模板、标签、跨分类搜索、置顶/收藏、实时预览、代码块一键复制、导出 Markdown 和本地备份。
- 界面支持中文和英文切换。
- 图生视频支持 1 到 5 张参考图。
- 视频 API 可以直接在前台设置，也可以写入 `.env.local`。
- 视频结果会展示在右侧画布区域，并保留历史记录。
- 支持刷新平台结果、预览视频、下载视频，以及直接保存到 `~/Downloads/Cowart Videos`。
- 独立“剪辑”页面提供 AI 精剪、影视解说和手动剪辑三种工作流。
- 支持片段分割、删除、恢复、拖动排序和精确修改起止时间。
- 时间线包含 V1 主视频、V2 叠加画面、A1 原声、A2 配音/音乐和 T1 字幕五条独立轨道。
- 支持 16:9、9:16 和 1:1，并可调整横屏转竖屏时的主体位置。
- 支持画面放大裁切及水平、垂直裁切中心调整，预览与导出保持一致。
- 影视解说模式支持可编辑解说草稿和 macOS 本机中文配音混音。
- 剪辑结果由本机 FFmpeg 导出到 `~/Downloads/Cowart Edits`，不会覆盖源视频。

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

独立图片生成/改图页：

```text
http://127.0.0.1:43219/image-generator.html
```

窄工具条启动器：

```text
http://127.0.0.1:43219/launcher.html
```

也可以直接运行：

```bash
npm run open:launcher
```

独立商品详情页生成：

```text
http://127.0.0.1:43219/product-detail-generator.html
```

独立文本页：

```text
http://127.0.0.1:43219/notebook.html
```

独立 AI 视频剪辑页：

```text
http://127.0.0.1:43219/video-editor.html
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

## 浏览器扩展启动器

如果你希望每个浏览器窗口都能一键打开 Cowart，而不是每次复制 `127.0.0.1:43219`，可以安装仓库内置的 Chrome/Edge 扩展启动器。

1. 先用 `npm run dev` 启动 Cowart，或者安装 macOS 后台服务。
2. 打开扩展目录：

```bash
npm run open:extension
```

3. 在 Chrome 或 Edge 中打开 `chrome://extensions`。
4. 打开 `开发者模式`。
5. 点击 `加载已解压的扩展程序`。
6. 选择仓库里的 `browser-extension` 文件夹。

安装后，把 Cowart 图标固定到浏览器工具栏。以后任意浏览器窗口里点这个图标，就可以打开：

- 画布
- 图片
- 设计
- 视频
- 文本

默认本机地址是 `http://127.0.0.1:43219`。如果你换了端口，在扩展弹窗里改一次地址，它会记住。

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
7. 点击 `用 API 生成/改图`，可以直接提交到已配置的图片平台；点击 `交给 Codex`，则导出结构化任务，并复制给 Codex 的改图指令。

生成的改图任务会写入 `codex-image-tasks/`。这个目录已经加入 `.gitignore`，不会被提交到仓库。

## 图片 API 改图

改图画布可以把当前主图、标注、补充说明，以及最多 3 张参考画布一起提交到这些图片平台：

- fal.ai
- Alibaba DashScope / 阿里万象
- Volcengine Ark / 火山方舟
- Kling / 可灵

API Key、模型名和接口地址都可以在前台的 `图片 API 生成` 设置面板里保存。如果平台立刻返回图片，Cowart 会把结果保存到 `codex-image-tasks/`，并自动导入回 `图片结果`。如果平台只返回任务 ID，Cowart 会保存平台响应和任务目录，方便你后续检查或重试。

如果只想打开一个专门生成/查看图片结果的单页，可以直接访问：

```text
http://127.0.0.1:43219/image-generator.html
```

这个独立图片页支持 1 张底图、最多 5 张参考图、生成比例选择、反向提示词，并内置 `Skill / 生成策略` 选择：严格局部修补、人物一致性、参考图自然融合、风格参考、商业产品图。你也可以上传自定义 Skill JSON、安装到本机浏览器列表，并把当前 Skill 下载成可复用的 JSON 文件。

如果要专门生成电商商品详情页长图，可以访问：

```text
http://127.0.0.1:43219/product-detail-generator.html
```

这个页面会让你填写商品名称、品牌调性、核心卖点、详情页模块和反向提示词，并上传主产品图与最多 5 张参考图，然后通过同一套图片 API 生成详情页图片。

如果要管理 Markdown 文本，可以访问：

```text
http://127.0.0.1:43219/notebook.html
```

## 文本 / Markdown 笔记

文本页是 Cowart 内置的本地 Markdown 管理页面，适合保存提示词、改图说明、代码片段、项目计划、Bug 记录、会议记录和常用工作流。它不是云笔记，主要面向本机长期保存和快速复用。

文本页功能：

- 可以新建分类，并在分类上右键改名或删除。
- 点击 `新笔记` 可以创建笔记，并选择要放入哪个分类。
- 新笔记可以选择模板：空白、代码记录、Prompt 记录、项目计划、Bug 记录、会议纪要。
- 支持跨分类搜索，搜索范围包括分类名、笔记标题、正文内容和标签；命中的分类会自动展开，方便直接点到笔记。
- 每篇笔记可以填写标签，多个标签用逗号分隔。
- 笔记可以右键 `置顶` 或 `收藏`，置顶笔记会显示在分类最上方。
- 编辑区支持 `H1`、`H2` 快捷按钮；当笔记里有多个标题时，右侧预览会自动生成目录。
- 可以对选中文字加粗，也可以给选中文字设置自定义颜色。
- 支持插入代码块，并可以选择代码语言，例如 JavaScript、TypeScript、Python、Bash、JSON、Markdown、Text。
- 右侧预览里的每个代码块都有复制按钮，可以一键复制该代码块。
- 可以上传图片到当前笔记，Cowart 会保存到本机并在光标位置插入 Markdown 图片语法。
- 可以从 `最近生成` 中选择 Codex/Cowart 最近生成的图片，直接插入当前笔记。
- 可以一键复制整篇 Markdown，也可以导出 `.md` 文件。
- 左侧分类栏可以拖拽调整宽度。
- 点击 `备份` 会把当前所有文本笔记复制一份到本机备份目录。

文本页会在浏览器里保留一份本地兜底数据，同时 dev server 会把笔记写入本机目录：

```text
~/.cowart-canvas/text-notes
```

手动备份会写入：

```text
~/.cowart-canvas/text-note-backups
```

上传到笔记里的图片会写入：

```text
~/.cowart-canvas/text-note-images
```

这些目录属于本机运行数据，不会提交到仓库。

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

你可以用两种方式配置图片 API 和视频 API。

方式 1：在前台设置：

1. 配置图片 API 时打开 `改图画布`；配置视频 API 时打开 `生成视频`。
2. 点击 `API 设置`。
3. 选择平台。
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
- `text-notes`
- `text-note-backups`
- `text-note-images`
- `.env.local`
- 桌面端打包产物

## 许可证

MIT
