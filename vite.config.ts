import { defineConfig, loadEnv } from 'vite'
import type { Connect, PluginOption, ViteDevServer } from 'vite'
import react from '@vitejs/plugin-react'
import crypto from 'node:crypto'
import fs from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import os from 'node:os'
import path from 'node:path'

const imageMimeTypes: Record<string, string> = {
  '.avif': 'image/avif',
  '.gif': 'image/gif',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
}

const videoMimeTypes: Record<string, string> = {
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
}

const recentImageMaxAgeMs = 7 * 24 * 60 * 60 * 1000
const recentDownloadImageMaxAgeMs = 30 * 24 * 60 * 60 * 1000

type RecentImage = {
  path: string
  name: string
  mtimeMs: number
  size: number
  url: string
}

type NotebookNote = {
  id: string
  title: string
  content: string
  tags?: string[]
  pinned?: boolean
  favorite?: boolean
  updatedAt?: string
  filePath?: string
}

type NotebookCategory = {
  id: string
  name: string
  notes: NotebookNote[]
}

type NotebookData = {
  activeCategoryId?: string
  activeNoteId?: string
  categories: NotebookCategory[]
}

type CodexTaskRequest = {
  image?: {
    title?: string
    prompt?: string
    source?: string
    filePath?: string
  }
  references?: Array<{
    label?: string
    image?: {
      title?: string
      prompt?: string
      source?: string
      filePath?: string
    }
  }>
  annotations?: unknown[]
  editPrompt?: string
  negativePrompt?: string
  aspectRatio?: string
  imageDataUrl?: string
  referenceImageDataUrls?: string[]
}

type VideoProvider = 'kling' | 'volcengine' | 'wanxiang' | 'runway' | 'luma' | 'fal' | 'replicate'
type ImageProvider = 'fal' | 'wanxiang' | 'volcengine' | 'kling' | 'openai' | 'my' | 'flux' | 'sd'
type VideoTaskStatus = 'needs_config' | 'submitted' | 'provider_error' | 'ready' | 'saved'

type VideoTaskRequest = {
  provider?: VideoProvider
  image?: {
    title?: string
    prompt?: string
    source?: string
    filePath?: string
  }
  images?: Array<{
    title?: string
    prompt?: string
    source?: string
    filePath?: string
  }>
  imageDataUrl?: string
  imageDataUrls?: string[]
  prompt?: string
  negativePrompt?: string
  duration?: number | string
  aspectRatio?: string
  resolution?: string
  mode?: string
}

type ImageTaskRequest = CodexTaskRequest & {
  provider?: ImageProvider
}

type VideoTaskSummary = {
  id: string
  directory: string
  provider?: VideoProvider
  providerName?: string
  title: string
  prompt?: string
  createdAt?: string
  duration?: number | string
  aspectRatio?: string
  resolution?: string
  status: VideoTaskStatus
  missingEnv?: string[]
  taskId?: string
  providerTaskStatus?: string
  providerError?: string
  updatedAt?: string
  videoUrl?: string
  localVideoUrl?: string
  sourceImageUrl?: string
  downloadsVideoPath?: string
}

type VideoConfigRequest = {
  provider?: VideoProvider
  values?: Record<string, unknown>
}

type ImageConfigRequest = {
  provider?: ImageProvider
  values?: Record<string, unknown>
}

type VideoTaskActionRequest = {
  id?: string
}

type VideoConfigField = {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
}

type PreparedVideoImage = {
  mimeType: string
  base64: string
  buffer: Buffer
  dataUrl: string
}

type ProviderRequest = {
  providerName: string
  missingEnv: string[]
  endpoint?: string
  headers?: Record<string, string>
  body?: unknown
}

const videoProviderNames: Record<VideoProvider, string> = {
  kling: '可灵',
  volcengine: '火山方舟',
  wanxiang: '阿里万象',
  runway: 'Runway',
  luma: 'Luma',
  fal: 'fal.ai',
  replicate: 'Replicate',
}

const videoProviderIds: VideoProvider[] = ['kling', 'volcengine', 'wanxiang', 'runway', 'luma', 'fal', 'replicate']
const imageProviderNames: Record<ImageProvider, string> = {
  fal: 'fal.ai',
  wanxiang: '阿里万象',
  volcengine: '火山方舟',
  kling: '可灵',
  openai: 'OpenAI',
  my: 'Midjourney',
  flux: 'Flux',
  sd: 'Stable Diffusion (SD)',
}
const imageProviderIds: ImageProvider[] = ['fal', 'wanxiang', 'volcengine', 'kling', 'openai', 'my', 'flux', 'sd']
const defaultArkVideoModel = 'doubao-seedance-2-0-260128'
const defaultArkImageModel = 'doubao-seedream-4-0-250828'
const defaultFalImageModel = 'fal-ai/flux-pro/kontext/max/multi'
const defaultDashScopeImageModel = 'wan2.7-image-pro'
const defaultKlingImageModel = 'kling-image-o1'
const defaultOpenAIImageModel = 'gpt-image-1'

const videoConfigFields: Record<VideoProvider, VideoConfigField[]> = {
  kling: [
    { key: 'KLING_ACCESS_KEY', label: 'Access Key', secret: true },
    { key: 'KLING_SECRET_KEY', label: 'Secret Key', secret: true },
    { key: 'KLING_VIDEO_MODEL', label: '模型', placeholder: 'kling-v1-6' },
    { key: 'KLING_BASE_URL', label: '接口地址', placeholder: 'https://api.klingai.com' },
  ],
  volcengine: [
    { key: 'ARK_API_KEY', label: 'API Key', secret: true },
    { key: 'ARK_VIDEO_MODEL', label: '视频模型', placeholder: defaultArkVideoModel },
    { key: 'ARK_VIDEO_ENDPOINT', label: '接口地址', placeholder: 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks' },
  ],
  wanxiang: [
    { key: 'DASHSCOPE_API_KEY', label: 'API Key', secret: true },
    { key: 'DASHSCOPE_VIDEO_MODEL', label: '模型', placeholder: 'wan2.6-i2v-flash' },
    { key: 'DASHSCOPE_VIDEO_ENDPOINT', label: '接口地址', placeholder: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis' },
  ],
  runway: [
    { key: 'RUNWAY_API_KEY', label: 'API Key', secret: true },
    { key: 'RUNWAY_VIDEO_MODEL', label: '模型', placeholder: 'gen4_turbo' },
    { key: 'RUNWAY_API_VERSION', label: 'API 版本', placeholder: '2024-11-06' },
    { key: 'RUNWAY_VIDEO_ENDPOINT', label: '接口地址', placeholder: 'https://api.dev.runwayml.com/v1/image_to_video' },
  ],
  luma: [
    { key: 'LUMA_API_KEY', label: 'API Key', secret: true },
    { key: 'LUMA_VIDEO_MODEL', label: '模型', placeholder: 'ray-2' },
    { key: 'LUMA_VIDEO_ENDPOINT', label: '接口地址', placeholder: 'https://api.lumalabs.ai/dream-machine/v1/generations' },
  ],
  fal: [
    { key: 'FAL_KEY', label: 'API Key', secret: true },
    { key: 'FAL_VIDEO_MODEL', label: '模型路径', placeholder: 'fal-ai/kling-video/v2.1/standard/image-to-video' },
    { key: 'FAL_VIDEO_ENDPOINT', label: '接口地址', placeholder: 'https://queue.fal.run/fal-ai/kling-video/v2.1/standard/image-to-video' },
  ],
  replicate: [
    { key: 'REPLICATE_API_TOKEN', label: 'API Token', secret: true },
    { key: 'REPLICATE_VIDEO_VERSION', label: '模型版本' },
    { key: 'REPLICATE_VIDEO_ENDPOINT', label: '接口地址', placeholder: 'https://api.replicate.com/v1/predictions' },
  ],
}

const imageConfigFields: Record<ImageProvider, VideoConfigField[]> = {
  fal: [
    { key: 'FAL_KEY', label: 'API Key', secret: true },
    { key: 'FAL_IMAGE_MODEL', label: '图片模型路径', placeholder: defaultFalImageModel },
    { key: 'FAL_IMAGE_ENDPOINT', label: '图片接口地址', placeholder: `https://fal.run/${defaultFalImageModel}` },
  ],
  wanxiang: [
    { key: 'DASHSCOPE_API_KEY', label: 'API Key', secret: true },
    { key: 'DASHSCOPE_IMAGE_MODEL', label: '图片模型', placeholder: defaultDashScopeImageModel },
    { key: 'DASHSCOPE_IMAGE_ENDPOINT', label: '图片接口地址', placeholder: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation' },
  ],
  volcengine: [
    { key: 'ARK_API_KEY', label: 'API Key', secret: true },
    { key: 'ARK_IMAGE_MODEL', label: '图片模型', placeholder: defaultArkImageModel },
    { key: 'ARK_IMAGE_ENDPOINT', label: '图片接口地址', placeholder: 'https://ark.cn-beijing.volces.com/api/v3/images/generations' },
  ],
  kling: [
    { key: 'KLING_ACCESS_KEY', label: 'Access Key', secret: true },
    { key: 'KLING_SECRET_KEY', label: 'Secret Key', secret: true },
    { key: 'KLING_IMAGE_MODEL', label: '图片模型', placeholder: defaultKlingImageModel },
    { key: 'KLING_IMAGE_ENDPOINT', label: '图片接口地址', placeholder: 'https://api-singapore.klingai.com/v1/images/generations' },
  ],
  openai: [
    { key: 'OPENAI_API_KEY', label: 'API Key', secret: true },
    { key: 'OPENAI_IMAGE_MODEL', label: '图片模型', placeholder: defaultOpenAIImageModel },
    { key: 'OPENAI_IMAGE_ENDPOINT', label: '图片接口地址', placeholder: 'https://api.openai.com/v1/images/edits' },
  ],
  my: [
    { key: 'MIDJOURNEY_API_KEY', label: 'API Key', secret: true },
    { key: 'MIDJOURNEY_IMAGE_MODEL', label: '图片模型', placeholder: 'midjourney' },
    { key: 'MIDJOURNEY_IMAGE_ENDPOINT', label: '图片接口地址' },
  ],
  flux: [
    { key: 'FLUX_API_KEY', label: 'API Key', secret: true },
    { key: 'FLUX_IMAGE_MODEL', label: '图片模型', placeholder: 'flux-kontext-pro' },
    { key: 'FLUX_IMAGE_ENDPOINT', label: '图片接口地址' },
  ],
  sd: [
    { key: 'SD_API_KEY', label: 'API Key', secret: true },
    { key: 'SD_IMAGE_MODEL', label: '图片模型', placeholder: 'stable-diffusion' },
    { key: 'SD_IMAGE_ENDPOINT', label: '图片接口地址' },
  ],
}

const managedVideoEnvKeys = Array.from(new Set(Object.values(videoConfigFields).flatMap((fields) => fields.map((field) => field.key))))
const managedImageEnvKeys = Array.from(new Set(Object.values(imageConfigFields).flatMap((fields) => fields.map((field) => field.key))))
const managedConfigEnvKeys = Array.from(new Set([...managedVideoEnvKeys, ...managedImageEnvKeys]))

function sendJson(res: ServerResponse, payload: unknown) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8')
  res.setHeader('Cache-Control', 'no-store')
  res.end(JSON.stringify(payload))
}

function readJsonBody(req: IncomingMessage, maxBytes = 24 * 1024 * 1024) {
  return new Promise<unknown>((resolve, reject) => {
    const chunks: Buffer[] = []
    let size = 0

    req.on('data', (chunk: Buffer) => {
      size += chunk.length
      if (size > maxBytes) {
        reject(new Error('Request body is too large'))
        req.destroy()
        return
      }
      chunks.push(chunk)
    })
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')))
      } catch {
        reject(new Error('Invalid JSON body'))
      }
    })
    req.on('error', reject)
  })
}

function safeSlug(value: string) {
  return (
    value
      .toLowerCase()
      .replace(/\.[^.]+$/, '')
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/gi, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 48) || 'image-task'
  )
}

function extensionForMime(mimeType: string) {
  if (mimeType === 'image/jpeg') return '.jpg'
  if (mimeType === 'image/png') return '.png'
  if (mimeType === 'image/webp') return '.webp'
  if (mimeType === 'image/gif') return '.gif'
  if (mimeType === 'image/svg+xml') return '.svg'
  return '.png'
}

function parseImageDataUrl(dataUrl?: string): PreparedVideoImage | null {
  if (!dataUrl) return null
  const match = dataUrl.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i)
  if (!match) return null

  const mimeType = match[1]?.toLowerCase()
  const base64 = match[2]
  if (!mimeType || !base64) return null
  const buffer = Buffer.from(base64, 'base64')
  if (buffer.length === 0) return null

  return { mimeType, base64, buffer, dataUrl }
}

function writeJson(filePath: string, payload: unknown) {
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2))
}

function notebookSafeFileName(value: string, fallback: string) {
  const normalized = value
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|]+/g, '-')
    .replace(/[\n\r\t]+/g, '-')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80)
  return normalized || fallback
}

function getNotebookDirectory() {
  return path.join(os.homedir(), '.cowart-canvas', 'text-notes')
}

function getNotebookBackupDirectory() {
  return path.join(os.homedir(), '.cowart-canvas', 'text-note-backups')
}

function getNotebookImageDirectory() {
  return path.join(os.homedir(), '.cowart-canvas', 'text-note-images')
}

function createDefaultNotebookData(): NotebookData {
  const categoryId = `category-${Date.now()}`
  const noteId = `note-${Date.now()}`
  return {
    activeCategoryId: categoryId,
    activeNoteId: noteId,
    categories: [
      {
        id: categoryId,
        name: '默认分类',
        notes: [
          {
            id: noteId,
            title: '第一篇 Markdown',
            content: '# 第一篇 Markdown\n\n- 可以建分类\n- 可以写多篇内容\n- 右侧会实时预览\n\n> 数据会保存到本机文件夹。',
            tags: ['示例'],
            pinned: false,
            favorite: false,
            updatedAt: new Date().toISOString(),
          },
        ],
      },
    ],
  }
}

function normalizeNotebookData(value: unknown): NotebookData {
  const record = isRecord(value) ? value : {}
  const categoriesInput = Array.isArray(record.categories) ? record.categories : []
  const categories = categoriesInput
    .filter(isRecord)
    .map((category, categoryIndex) => {
      const notesInput = Array.isArray(category.notes) ? category.notes : []
      const notes = notesInput.filter(isRecord).map((note, noteIndex) => ({
        id: getString(note.id) || `note-${categoryIndex + 1}-${noteIndex + 1}`,
        title: getString(note.title) || '未命名笔记',
        content: getString(note.content) || '',
        tags: Array.isArray(note.tags) ? note.tags.map(String).filter(Boolean) : [],
        pinned: Boolean(note.pinned),
        favorite: Boolean(note.favorite),
        updatedAt: getString(note.updatedAt) || new Date().toISOString(),
      }))
      return {
        id: getString(category.id) || `category-${categoryIndex + 1}`,
        name: getString(category.name) || `分类 ${categoryIndex + 1}`,
        notes,
      }
    })
  return categories.length > 0
    ? {
        activeCategoryId: getString(record.activeCategoryId) || categories[0]?.id,
        activeNoteId: getString(record.activeNoteId) || categories[0]?.notes[0]?.id,
        categories,
      }
    : createDefaultNotebookData()
}

function getNotebookIndexPath() {
  return path.join(getNotebookDirectory(), 'index.json')
}

function cleanupNotebookFolders(directory: string, keepFolders: Set<string>) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isDirectory() || keepFolders.has(entry.name)) continue
    fs.rmSync(path.join(directory, entry.name), { recursive: true, force: true })
  }
}

function saveNotebookData(input: unknown): NotebookData & { storagePath: string; updatedAt: string } {
  const notebook = normalizeNotebookData(input)
  const directory = getNotebookDirectory()
  fs.mkdirSync(directory, { recursive: true })
  const keepFolders = new Set<string>()
  const indexCategories = notebook.categories.map((category, categoryIndex) => {
    const categoryFolder = `${String(categoryIndex + 1).padStart(2, '0')}-${notebookSafeFileName(category.name, category.id)}`
    keepFolders.add(categoryFolder)
    const categoryPath = path.join(directory, categoryFolder)
    fs.mkdirSync(categoryPath, { recursive: true })
    const notes = category.notes.map((note, noteIndex) => {
      const fileName = `${String(noteIndex + 1).padStart(3, '0')}-${notebookSafeFileName(note.title, note.id)}.md`
      const notePath = path.join(categoryPath, fileName)
      fs.writeFileSync(notePath, note.content || '', 'utf8')
      return {
        id: note.id,
        title: note.title,
        tags: note.tags ?? [],
        pinned: Boolean(note.pinned),
        favorite: Boolean(note.favorite),
        updatedAt: note.updatedAt || new Date().toISOString(),
        filePath: notePath,
      }
    })
    return {
      id: category.id,
      name: category.name,
      folderPath: categoryPath,
      notes,
    }
  })
  cleanupNotebookFolders(directory, keepFolders)
  const index = {
    activeCategoryId: notebook.activeCategoryId,
    activeNoteId: notebook.activeNoteId,
    storagePath: directory,
    updatedAt: new Date().toISOString(),
    categories: indexCategories,
  }
  writeJson(getNotebookIndexPath(), index)
  return loadNotebookData()
}

function loadNotebookData(): NotebookData & { storagePath: string; updatedAt: string } {
  const directory = getNotebookDirectory()
  const indexPath = getNotebookIndexPath()
  if (!fs.existsSync(indexPath)) {
    return saveNotebookData(createDefaultNotebookData())
  }
  const parsed = JSON.parse(fs.readFileSync(indexPath, 'utf8')) as unknown
  const record = isRecord(parsed) ? parsed : {}
  const categoriesInput = Array.isArray(record.categories) ? record.categories : []
  const categories: NotebookCategory[] = categoriesInput.filter(isRecord).map((category, categoryIndex) => {
    const notesInput = Array.isArray(category.notes) ? category.notes : []
    const notes = notesInput.filter(isRecord).map((note, noteIndex) => {
      const filePath = getString(note.filePath)
      const content = filePath && fs.existsSync(filePath) ? fs.readFileSync(filePath, 'utf8') : ''
      return {
        id: getString(note.id) || `note-${categoryIndex + 1}-${noteIndex + 1}`,
        title: getString(note.title) || notebookSafeFileName(path.basename(filePath || '', '.md'), '未命名笔记'),
        content,
        tags: Array.isArray(note.tags) ? note.tags.map(String).filter(Boolean) : [],
        pinned: Boolean(note.pinned),
        favorite: Boolean(note.favorite),
        updatedAt: getString(note.updatedAt) || (filePath ? new Date(fs.statSync(filePath).mtimeMs).toISOString() : new Date().toISOString()),
        filePath,
      }
    })
    return {
      id: getString(category.id) || `category-${categoryIndex + 1}`,
      name: getString(category.name) || `分类 ${categoryIndex + 1}`,
      notes,
    }
  })
  return {
    activeCategoryId: getString(record.activeCategoryId) || categories[0]?.id,
    activeNoteId: getString(record.activeNoteId) || categories[0]?.notes[0]?.id,
    categories,
    storagePath: directory,
    updatedAt: getString(record.updatedAt) || new Date().toISOString(),
  }
}

function backupNotebookData() {
  const sourceDirectory = getNotebookDirectory()
  if (!fs.existsSync(sourceDirectory)) saveNotebookData(createDefaultNotebookData())

  const backupRoot = getNotebookBackupDirectory()
  fs.mkdirSync(backupRoot, { recursive: true })
  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const backupPath = path.join(backupRoot, stamp)
  fs.cpSync(sourceDirectory, backupPath, { recursive: true })
  return {
    backupPath,
    storagePath: sourceDirectory,
    updatedAt: new Date().toISOString(),
  }
}

function saveNotebookImage(input: unknown) {
  const record = isRecord(input) ? input : {}
  const prepared = parseImageDataUrl(getString(record.dataUrl))
  if (!prepared) throw new Error('Invalid image')

  const extension = extensionForMime(prepared.mimeType)
  const baseName = notebookSafeFileName(getString(record.name) || 'note-image', 'note-image').replace(/\.[^.]+$/, '')
  const directory = getNotebookImageDirectory()
  fs.mkdirSync(directory, { recursive: true })
  const fileName = `${new Date().toISOString().replace(/[:.]/g, '-')}-${baseName}${extension}`
  const filePath = path.join(directory, fileName)
  fs.writeFileSync(filePath, prepared.buffer)
  return {
    filePath,
    url: `/api/local-image?path=${encodeURIComponent(filePath)}`,
    markdownUrl: `/api/local-image?path=${encodeURIComponent(filePath)}`,
  }
}

function parseEnvLocal(content: string) {
  const values: Record<string, string> = {}
  for (const line of content.split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/)
    if (!match?.[1]) continue

    const key = match[1]
    let value = match[2] ?? ''
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    values[key] = value.replace(/\\n/g, '\n').replace(/\\"/g, '"').replace(/\\\\/g, '\\')
  }
  return values
}

function readEnvLocal() {
  const envPath = path.join(process.cwd(), '.env.local')
  if (!fs.existsSync(envPath)) return {}
  return parseEnvLocal(fs.readFileSync(envPath, 'utf8'))
}

function quoteEnvValue(value: string) {
  if (!value) return ''
  return `"${value.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/"/g, '\\"')}"`
}

function writeEnvLocal(values: Record<string, string>) {
  const envPath = path.join(process.cwd(), '.env.local')
  const existingContent = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const preservedLines = existingContent
    .split(/\r?\n/)
    .filter((line) => {
      const key = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=/)?.[1]
      return !['# Cowart video API settings', '# Cowart API settings'].includes(line.trim()) && (!key || !managedConfigEnvKeys.includes(key))
    })
    .filter((line, index, lines) => line.trim() || lines[index - 1]?.trim())

  const managedLines = managedConfigEnvKeys
    .filter((key) => values[key])
    .map((key) => `${key}=${quoteEnvValue(values[key] ?? '')}`)

  const nextLines = [...preservedLines]
  if (managedLines.length > 0) {
    if (nextLines.length > 0 && nextLines.at(-1)?.trim()) nextLines.push('')
    nextLines.push('# Cowart API settings', ...managedLines)
  }

  if (nextLines.length === 0) {
    if (fs.existsSync(envPath)) fs.unlinkSync(envPath)
    return
  }

  const nextContent = `${nextLines.join('\n').trim()}\n`
  fs.writeFileSync(envPath, nextContent)
}

function syncProcessEnv(values: Record<string, string>) {
  for (const key of managedConfigEnvKeys) {
    if (values[key]) {
      process.env[key] = values[key]
    } else {
      delete process.env[key]
    }
  }
}

function getVideoEnvValues() {
  const fileValues = readEnvLocal()
  const values: Record<string, string> = {}
  for (const key of managedConfigEnvKeys) {
    values[key] = fileValues[key] ?? process.env[key] ?? ''
  }
  syncProcessEnv(values)
  return values
}

function getImageEnvValues() {
  return getVideoEnvValues()
}

function buildVideoConfigResponse() {
  const values = getVideoEnvValues()
  return {
    providers: videoProviderIds.map((id) => ({
      id,
      name: videoProviderNames[id],
      fields: videoConfigFields[id].map((field) => ({
        ...field,
        configured: Boolean(values[field.key]),
        value: field.secret ? '' : values[field.key] || '',
      })),
    })),
  }
}

function saveVideoConfig(provider: VideoProvider, incomingValues: Record<string, unknown>) {
  const storedValues = readEnvLocal()
  const currentValues: Record<string, string> = {}
  const preservedRuntimeSecretKeys = new Set<string>()
  for (const key of managedConfigEnvKeys) {
    if (storedValues[key]) currentValues[key] = storedValues[key]
  }

  for (const field of videoConfigFields[provider]) {
    const rawValue = incomingValues[field.key]
    if (typeof rawValue !== 'string') continue

    const value = rawValue.trim()
    if (!value && field.secret && (currentValues[field.key] || process.env[field.key])) {
      if (!currentValues[field.key] && process.env[field.key]) preservedRuntimeSecretKeys.add(field.key)
      continue
    }
    if (value) {
      currentValues[field.key] = value
    } else {
      delete currentValues[field.key]
    }
  }

  writeEnvLocal(currentValues)
  for (const field of videoConfigFields[provider]) {
    if (currentValues[field.key]) {
      process.env[field.key] = currentValues[field.key]
    } else if (preservedRuntimeSecretKeys.has(field.key)) {
      continue
    } else if (Object.prototype.hasOwnProperty.call(incomingValues, field.key)) {
      delete process.env[field.key]
    }
  }

  return buildVideoConfigResponse()
}

function buildImageConfigResponse() {
  const values = getImageEnvValues()
  return {
    providers: imageProviderIds.map((id) => ({
      id,
      name: imageProviderNames[id],
      fields: imageConfigFields[id].map((field) => ({
        ...field,
        configured: Boolean(values[field.key]),
        value: field.secret ? '' : values[field.key] || '',
      })),
    })),
  }
}

function saveImageConfig(provider: ImageProvider, incomingValues: Record<string, unknown>) {
  const storedValues = readEnvLocal()
  const currentValues: Record<string, string> = {}
  const preservedRuntimeSecretKeys = new Set<string>()
  for (const key of managedConfigEnvKeys) {
    if (storedValues[key]) currentValues[key] = storedValues[key]
  }

  for (const field of imageConfigFields[provider]) {
    const rawValue = incomingValues[field.key]
    if (typeof rawValue !== 'string') continue

    const value = rawValue.trim()
    if (!value && field.secret && (currentValues[field.key] || process.env[field.key])) {
      if (!currentValues[field.key] && process.env[field.key]) preservedRuntimeSecretKeys.add(field.key)
      continue
    }
    if (value) {
      currentValues[field.key] = value
    } else {
      delete currentValues[field.key]
    }
  }

  writeEnvLocal(currentValues)
  for (const field of imageConfigFields[provider]) {
    if (currentValues[field.key]) {
      process.env[field.key] = currentValues[field.key]
    } else if (preservedRuntimeSecretKeys.has(field.key)) {
      continue
    } else if (Object.prototype.hasOwnProperty.call(incomingValues, field.key)) {
      delete process.env[field.key]
    }
  }

  return buildImageConfigResponse()
}

function presentEnv(names: string[]) {
  return names.filter((name) => !process.env[name])
}

function base64Url(input: string | Buffer) {
  return Buffer.from(input).toString('base64').replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_')
}

function createKlingToken(accessKey: string, secretKey: string) {
  const now = Math.floor(Date.now() / 1000)
  const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const payload = base64Url(JSON.stringify({ iss: accessKey, exp: now + 1800, nbf: now - 5 }))
  const unsignedToken = `${header}.${payload}`
  const signature = base64Url(crypto.createHmac('sha256', secretKey).update(unsignedToken).digest())
  return `${unsignedToken}.${signature}`
}

function getString(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function extractProviderTaskId(payload: unknown): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined

  const record = payload as Record<string, unknown>
  const direct = getString(record.task_id) ?? getString(record.taskId) ?? getString(record.id)
  if (direct) return direct

  for (const key of ['data', 'output', 'result']) {
    const child = record[key]
    if (child && typeof child === 'object') {
      const nested = extractProviderTaskId(child)
      if (nested) return nested
    }
  }

  return getString(record.request_id) ?? getString(record.output)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function isVideoProvider(value: unknown): value is VideoProvider {
  return typeof value === 'string' && videoProviderIds.includes(value as VideoProvider)
}

function isImageProvider(value: unknown): value is ImageProvider {
  return typeof value === 'string' && imageProviderIds.includes(value as ImageProvider)
}

function readJsonFile(filePath: string): unknown {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch {
    return null
  }
}

function looksLikeVideoUrl(value: string, parentKey = '') {
  if (!/^https?:\/\//i.test(value)) return false

  const lowerUrl = value.toLowerCase().split('?')[0] ?? ''
  if (/\.(mp4|mov|webm|m4v)$/.test(lowerUrl)) return true

  const lowerKey = parentKey.toLowerCase()
  return ['video', 'video_url', 'url', 'output', 'file', 'download', 'asset'].some((key) => lowerKey.includes(key))
}

function looksLikeImageUrl(value: string, parentKey = '') {
  if (/^data:image\/[a-z0-9+.-]+;base64,/i.test(value)) return true
  if (!/^https?:\/\//i.test(value)) return false

  const lowerUrl = value.toLowerCase().split('?')[0] ?? ''
  if (/\.(avif|gif|jpe?g|png|svg|webp)$/.test(lowerUrl)) return true

  const lowerKey = parentKey.toLowerCase()
  return ['image', 'image_url', 'imageurl', 'url', 'output', 'result', 'file', 'asset'].some((key) => lowerKey.includes(key))
}

function extractImageUrl(payload: unknown, parentKey = '', seen = new Set<unknown>()): string | undefined {
  if (typeof payload === 'string') return looksLikeImageUrl(payload, parentKey) ? payload : undefined
  if (!payload || typeof payload !== 'object') return undefined
  if (seen.has(payload)) return undefined
  seen.add(payload)

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractImageUrl(item, parentKey, seen)
      if (nested) return nested
    }
    return undefined
  }

  const record = payload as Record<string, unknown>
  const preferredKeys = [
    'image_url',
    'imageUrl',
    'images',
    'image',
    'url',
    'download_url',
    'downloadUrl',
    'output',
    'outputs',
    'result',
    'results',
    'file',
    'files',
  ]
  for (const key of preferredKeys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue
    const nested = extractImageUrl(record[key], key, seen)
    if (nested) return nested
  }

  for (const [key, value] of Object.entries(record)) {
    const nested = extractImageUrl(value, key, seen)
    if (nested) return nested
  }

  return undefined
}

function extractImageBase64(payload: unknown, parentKey = '', seen = new Set<unknown>()): string | undefined {
  if (typeof payload === 'string') {
    if (/^data:image\/[a-z0-9+.-]+;base64,/i.test(payload)) return payload
    const normalized = payload.trim()
    const lowerKey = parentKey.toLowerCase()
    if (/^[A-Za-z0-9+/=\s]+$/.test(normalized) && normalized.length > 200 && /(b64|base64|image)/i.test(lowerKey)) return normalized
    return undefined
  }
  if (!payload || typeof payload !== 'object') return undefined
  if (seen.has(payload)) return undefined
  seen.add(payload)

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractImageBase64(item, parentKey, seen)
      if (nested) return nested
    }
    return undefined
  }

  const record = payload as Record<string, unknown>
  for (const key of ['b64_json', 'base64', 'image_base64', 'imageBase64', 'data']) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue
    const nested = extractImageBase64(record[key], key, seen)
    if (nested) return nested
  }

  for (const [key, value] of Object.entries(record)) {
    const nested = extractImageBase64(value, key, seen)
    if (nested) return nested
  }

  return undefined
}

function extractVideoUrl(payload: unknown, parentKey = '', seen = new Set<unknown>()): string | undefined {
  if (typeof payload === 'string') return looksLikeVideoUrl(payload, parentKey) ? payload : undefined
  if (!payload || typeof payload !== 'object') return undefined
  if (seen.has(payload)) return undefined
  seen.add(payload)

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractVideoUrl(item, parentKey, seen)
      if (nested) return nested
    }
    return undefined
  }

  const record = payload as Record<string, unknown>
  const preferredKeys = ['video_url', 'videoUrl', 'video', 'videos', 'download_url', 'downloadUrl', 'output', 'outputs', 'result', 'results', 'file', 'files', 'url']
  for (const key of preferredKeys) {
    if (!Object.prototype.hasOwnProperty.call(record, key)) continue
    const nested = extractVideoUrl(record[key], key, seen)
    if (nested) return nested
  }

  for (const [key, value] of Object.entries(record)) {
    const nested = extractVideoUrl(value, key, seen)
    if (nested) return nested
  }

  return undefined
}

function extractProviderTaskStatus(payload: unknown, seen = new Set<unknown>()): string | undefined {
  if (!payload || typeof payload !== 'object') return undefined
  if (seen.has(payload)) return undefined
  seen.add(payload)

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractProviderTaskStatus(item, seen)
      if (nested) return nested
    }
    return undefined
  }

  const record = payload as Record<string, unknown>
  for (const key of ['task_status', 'taskStatus', 'status', 'state']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  for (const key of ['data', 'output', 'result', 'results']) {
    const child = record[key]
    if (child && typeof child === 'object') {
      const nested = extractProviderTaskStatus(child, seen)
      if (nested) return nested
    }
  }

  return undefined
}

function extractProviderError(payload: unknown, seen = new Set<unknown>()): string | undefined {
  if (!payload) return undefined
  if (typeof payload === 'string') return payload.trim() || undefined
  if (typeof payload !== 'object') return undefined
  if (seen.has(payload)) return undefined
  seen.add(payload)

  if (Array.isArray(payload)) {
    for (const item of payload) {
      const nested = extractProviderError(item, seen)
      if (nested) return nested
    }
    return undefined
  }

  const record = payload as Record<string, unknown>
  for (const key of ['message', 'msg', 'error_message', 'errorMessage']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim()) return value.trim()
  }

  const error = record.error
  if (typeof error === 'string' && error.trim()) return error.trim()
  if (error && typeof error === 'object') {
    const nested = extractProviderError(error, seen)
    if (nested) return nested
  }

  return undefined
}

function sanitizeProviderError(message?: string) {
  if (!message) return undefined
  return message.replace(/account\s+\d+/gi, 'account').replace(/Request id:\s*[A-Za-z0-9-]+/gi, 'Request id hidden')
}

function isProviderFailureStatus(status?: string) {
  if (!status) return false
  return ['failed', 'fail', 'error', 'canceled', 'cancelled', 'rejected'].some((keyword) => status.toLowerCase().includes(keyword))
}

function findSourceImagePath(directory: string, request: Record<string, unknown> | null) {
  const imageRecord = isRecord(request?.image) ? request.image : null
  const savedImagePath = imageRecord ? getString(imageRecord.savedImagePath) : undefined
  if (savedImagePath && fs.existsSync(savedImagePath)) return savedImagePath

  try {
    const sourceFile = fs.readdirSync(directory).find((fileName) => {
      const extension = path.extname(fileName).toLowerCase()
      return fileName.startsWith('source.') && Boolean(imageMimeTypes[extension])
    })
    return sourceFile ? path.join(directory, sourceFile) : undefined
  } catch {
    return undefined
  }
}

function findLocalVideoPath(directory: string) {
  try {
    const videoFile = fs
      .readdirSync(directory)
      .filter((fileName) => Boolean(videoMimeTypes[path.extname(fileName).toLowerCase()]))
      .sort()[0]
    return videoFile ? path.join(directory, videoFile) : undefined
  } catch {
    return undefined
  }
}

function summarizeVideoTask(directory: string, directoryName: string): VideoTaskSummary | null {
  const request = readJsonFile(path.join(directory, 'request.json'))
  const providerRequest = readJsonFile(path.join(directory, 'provider-request.json'))
  const providerResponse = readJsonFile(path.join(directory, 'provider-response.json'))
  const requestRecord = isRecord(request) ? request : null
  const providerRequestRecord = isRecord(providerRequest) ? providerRequest : null
  const providerResponseRecord = isRecord(providerResponse) ? providerResponse : null
  const provider = isVideoProvider(requestRecord?.provider) ? requestRecord.provider : undefined
  const missingEnv = Array.isArray(providerRequestRecord?.missingEnv) ? providerRequestRecord.missingEnv.filter((item): item is string => typeof item === 'string') : []
  const payload = providerResponseRecord?.payload
  const previousPayload = providerResponseRecord?.previousPayload
  const localVideoPath = findLocalVideoPath(directory)
  const sourceImagePath = findSourceImagePath(directory, requestRecord)
  const videoUrl = extractVideoUrl(payload) ?? extractVideoUrl(previousPayload)
  const ok = providerResponseRecord?.ok === true
  const providerTaskStatus = extractProviderTaskStatus(payload) ?? extractProviderTaskStatus(previousPayload)
  const providerError = sanitizeProviderError(extractProviderError(payload) ?? extractProviderError(previousPayload))
  const status: VideoTaskStatus = localVideoPath
    ? 'saved'
    : videoUrl
      ? 'ready'
      : providerResponseRecord
        ? ok && !isProviderFailureStatus(providerTaskStatus)
          ? 'submitted'
          : 'provider_error'
        : missingEnv.length > 0
          ? 'needs_config'
          : 'submitted'
  const imageRecord = isRecord(requestRecord?.image) ? requestRecord.image : null
  const title = imageRecord ? getString(imageRecord.title) : undefined

  return {
    id: directoryName,
    directory,
    provider,
    providerName: getString(requestRecord?.providerName) ?? (provider ? videoProviderNames[provider] : undefined),
    title: title || directoryName,
    prompt: getString(requestRecord?.prompt),
    createdAt: getString(requestRecord?.createdAt),
    duration: typeof requestRecord?.duration === 'number' || typeof requestRecord?.duration === 'string' ? requestRecord.duration : undefined,
    aspectRatio: getString(requestRecord?.aspectRatio),
    resolution: getString(requestRecord?.resolution),
    status,
    missingEnv,
    taskId: extractProviderTaskId(payload) ?? extractProviderTaskId(previousPayload),
    providerTaskStatus,
    providerError,
    updatedAt: getString(providerResponseRecord?.refreshedAt) ?? getString(providerResponseRecord?.downloadedAt) ?? getString(providerResponseRecord?.createdAt),
    videoUrl,
    localVideoUrl: localVideoPath ? `/api/local-video?path=${encodeURIComponent(localVideoPath)}` : undefined,
    sourceImageUrl: sourceImagePath ? `/api/local-image?path=${encodeURIComponent(sourceImagePath)}` : undefined,
    downloadsVideoPath: getString(providerResponseRecord?.downloadsVideoPath),
  }
}

function listVideoTasks() {
  const root = path.join(process.cwd(), 'video-tasks')
  const rootStat = safeStat(root)
  if (!rootStat?.isDirectory()) return []

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return []
  }

  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => {
      const directory = path.join(root, entry.name)
      const stat = safeStat(directory)
      const summary = summarizeVideoTask(directory, entry.name)
      return summary && stat ? { summary, mtimeMs: stat.mtimeMs } : null
    })
    .filter((item): item is { summary: VideoTaskSummary; mtimeMs: number } => Boolean(item))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .map((item) => item.summary)
    .slice(0, 40)
}

function runwayRatio(aspectRatio: string) {
  if (aspectRatio === '16:9') return '1280:720'
  if (aspectRatio === '9:16') return '720:1280'
  if (aspectRatio === '1:1') return '960:960'
  return aspectRatio
}

function normalizeImageAspectRatio(value?: string) {
  const ratio = value?.trim()
  if (!ratio || ratio === 'auto' || ratio === 'adaptive') return 'adaptive'
  if (['1:1', '16:9', '9:16', '4:3', '3:4', '3:2', '2:3'].includes(ratio)) return ratio
  return 'adaptive'
}

function imageSizeForAspectRatio(aspectRatio: string, separator: 'x' | '*' = 'x') {
  const sizes: Record<string, string> = {
    '1:1': `1024${separator}1024`,
    '16:9': `1344${separator}768`,
    '9:16': `768${separator}1344`,
    '4:3': `1152${separator}864`,
    '3:4': `864${separator}1152`,
    '3:2': `1216${separator}832`,
    '2:3': `832${separator}1216`,
  }
  return sizes[aspectRatio]
}

function buildProviderRequest(provider: VideoProvider, task: VideoTaskRequest, image: PreparedVideoImage): ProviderRequest {
  const providerName = videoProviderNames[provider]
  const prompt = task.prompt?.trim() || '以这张图片作为首帧生成自然、有镜头运动的视频'
  const negativePrompt = task.negativePrompt?.trim()
  const duration = String(task.duration || 5)
  const aspectRatio = task.aspectRatio || '16:9'
  const resolution = task.resolution || '720P'

  if (provider === 'kling') {
    const missingEnv = presentEnv(['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    const accessKey = process.env.KLING_ACCESS_KEY ?? ''
    const secretKey = process.env.KLING_SECRET_KEY ?? ''
    return {
      providerName,
      missingEnv,
      endpoint: `${process.env.KLING_BASE_URL || 'https://api.klingai.com'}/v1/videos/image2video`,
      headers: {
        Authorization: `Bearer ${createKlingToken(accessKey, secretKey)}`,
        'Content-Type': 'application/json',
      },
      body: {
        model_name: process.env.KLING_VIDEO_MODEL || 'kling-v1-6',
        image: image.base64,
        prompt,
        negative_prompt: negativePrompt || undefined,
        duration,
        aspect_ratio: aspectRatio,
        mode: task.mode || 'std',
      },
    }
  }

  if (provider === 'wanxiang') {
    const missingEnv = presentEnv(['DASHSCOPE_API_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    return {
      providerName,
      missingEnv,
      endpoint: process.env.DASHSCOPE_VIDEO_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis',
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
        'X-DashScope-Async': 'enable',
      },
      body: {
        model: process.env.DASHSCOPE_VIDEO_MODEL || 'wan2.6-i2v-flash',
        input: {
          prompt,
          img_url: image.dataUrl,
        },
        parameters: {
          duration: Number(duration),
          resolution,
          prompt_extend: true,
        },
      },
    }
  }

  if (provider === 'runway') {
    const missingEnv = presentEnv(['RUNWAY_API_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    return {
      providerName,
      missingEnv,
      endpoint: process.env.RUNWAY_VIDEO_ENDPOINT || 'https://api.dev.runwayml.com/v1/image_to_video',
      headers: {
        Authorization: `Bearer ${process.env.RUNWAY_API_KEY}`,
        'Content-Type': 'application/json',
        'X-Runway-Version': process.env.RUNWAY_API_VERSION || '2024-11-06',
      },
      body: {
        model: process.env.RUNWAY_VIDEO_MODEL || 'gen4_turbo',
        promptImage: image.dataUrl,
        promptText: prompt,
        ratio: runwayRatio(aspectRatio),
        duration: Number(duration),
      },
    }
  }

  if (provider === 'luma') {
    const missingEnv = presentEnv(['LUMA_API_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    return {
      providerName,
      missingEnv,
      endpoint: process.env.LUMA_VIDEO_ENDPOINT || 'https://api.lumalabs.ai/dream-machine/v1/generations',
      headers: {
        Authorization: `Bearer ${process.env.LUMA_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: {
        prompt,
        model: process.env.LUMA_VIDEO_MODEL || 'ray-2',
        keyframes: {
          frame0: {
            type: 'image',
            url: image.dataUrl,
          },
        },
        aspect_ratio: aspectRatio,
        duration: Number(duration),
        negative_prompt: negativePrompt || undefined,
      },
    }
  }

  if (provider === 'fal') {
    const missingEnv = presentEnv(['FAL_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    const model = process.env.FAL_VIDEO_MODEL || 'fal-ai/kling-video/v2.1/standard/image-to-video'
    return {
      providerName,
      missingEnv,
      endpoint: process.env.FAL_VIDEO_ENDPOINT || `https://queue.fal.run/${model}`,
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: {
        prompt,
        image_url: image.dataUrl,
        duration: Number(duration),
        aspect_ratio: aspectRatio,
        negative_prompt: negativePrompt || undefined,
      },
    }
  }

  if (provider === 'replicate') {
    const missingEnv = presentEnv(['REPLICATE_API_TOKEN', 'REPLICATE_VIDEO_VERSION'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    return {
      providerName,
      missingEnv,
      endpoint: process.env.REPLICATE_VIDEO_ENDPOINT || 'https://api.replicate.com/v1/predictions',
      headers: {
        Authorization: `Bearer ${process.env.REPLICATE_API_TOKEN}`,
        'Content-Type': 'application/json',
        Prefer: 'wait',
      },
      body: {
        version: process.env.REPLICATE_VIDEO_VERSION,
        input: {
          prompt,
          image: image.dataUrl,
          duration: Number(duration),
          aspect_ratio: aspectRatio,
          negative_prompt: negativePrompt || undefined,
        },
      },
    }
  }

  if (provider === 'volcengine') {
    const missingEnv = presentEnv(['ARK_API_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    return {
      providerName,
      missingEnv,
      endpoint: process.env.ARK_VIDEO_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks',
      headers: {
        Authorization: `Bearer ${process.env.ARK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: process.env.ARK_VIDEO_MODEL || defaultArkVideoModel,
        content: [
          { type: 'text', text: prompt },
          { type: 'image_url', image_url: { url: image.dataUrl } },
        ],
        duration: Number(duration),
        ratio: aspectRatio,
        resolution,
        negative_prompt: negativePrompt || undefined,
      },
    }
  }

  return { providerName, missingEnv: ['UNSUPPORTED_VIDEO_PROVIDER'] }
}

function buildImageProviderRequest(provider: ImageProvider, task: ImageTaskRequest, image: PreparedVideoImage, references: PreparedVideoImage[]): ProviderRequest {
  const providerName = imageProviderNames[provider]
  const guidance = buildStrictImageEditGuidance(task.annotations, references.length > 0)
  const annotationText = getAnnotationNoteText(task.annotations)
  const negativePrompt = task.negativePrompt?.trim()
  const aspectRatio = normalizeImageAspectRatio(task.aspectRatio)
  const aspectPrompt = aspectRatio === 'adaptive' ? '输出比例：自动，尽量沿用底图比例。' : `输出比例：${aspectRatio}。`
  const prompt = [
    task.editPrompt?.trim() || '请基于这张图片进行局部修改。',
    negativePrompt ? `\n反向提示词：${negativePrompt}` : '',
    aspectPrompt,
    '',
    '画布标注：',
    annotationText || '没有文字标注，请按补充说明改图。',
    '',
    '生成约束：',
    ...guidance.map((line) => `- ${line}`),
  ]
    .filter(Boolean)
    .join('\n')

  if (provider === 'fal') {
    const missingEnv = presentEnv(['FAL_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    const model = process.env.FAL_IMAGE_MODEL || defaultFalImageModel
    const imageUrls = [image.dataUrl, ...references.map((reference) => reference.dataUrl)]
    const isMultiImageModel = /\/multi(?:$|\/)/i.test(model)
    return {
      providerName,
      missingEnv,
      endpoint: process.env.FAL_IMAGE_ENDPOINT || `https://fal.run/${model}`,
      headers: {
        Authorization: `Key ${process.env.FAL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: {
        prompt,
        ...(isMultiImageModel ? { image_urls: imageUrls } : { image_url: image.dataUrl, reference_image_urls: references.map((reference) => reference.dataUrl) }),
        ...(aspectRatio === 'adaptive' ? {} : { aspect_ratio: aspectRatio }),
        num_images: 1,
        output_format: 'png',
      },
    }
  }

  if (provider === 'wanxiang') {
    const missingEnv = presentEnv(['DASHSCOPE_API_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    return {
      providerName,
      missingEnv,
      endpoint: process.env.DASHSCOPE_IMAGE_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      headers: {
        Authorization: `Bearer ${process.env.DASHSCOPE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: process.env.DASHSCOPE_IMAGE_MODEL || defaultDashScopeImageModel,
        input: {
          messages: [
            {
              role: 'user',
              content: [
                { text: prompt },
                { image: image.dataUrl },
                ...references.map((reference) => ({ image: reference.dataUrl })),
              ],
            },
          ],
        },
        parameters: {
          n: 1,
          size: aspectRatio === 'adaptive' ? '2K' : imageSizeForAspectRatio(aspectRatio, '*') || '2K',
          watermark: false,
        },
      },
    }
  }

  if (provider === 'volcengine') {
    const missingEnv = presentEnv(['ARK_API_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    const inputImages = [image.dataUrl, ...references.map((reference) => reference.dataUrl)]
    return {
      providerName,
      missingEnv,
      endpoint: process.env.ARK_IMAGE_ENDPOINT || 'https://ark.cn-beijing.volces.com/api/v3/images/generations',
      headers: {
        Authorization: `Bearer ${process.env.ARK_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: process.env.ARK_IMAGE_MODEL || defaultArkImageModel,
        prompt,
        image: image.dataUrl,
        images: inputImages,
        response_format: 'url',
        size: aspectRatio === 'adaptive' ? 'adaptive' : imageSizeForAspectRatio(aspectRatio) || 'adaptive',
        watermark: false,
      },
    }
  }

  if (provider === 'kling') {
    const missingEnv = presentEnv(['KLING_ACCESS_KEY', 'KLING_SECRET_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    const accessKey = process.env.KLING_ACCESS_KEY ?? ''
    const secretKey = process.env.KLING_SECRET_KEY ?? ''
    return {
      providerName,
      missingEnv,
      endpoint: process.env.KLING_IMAGE_ENDPOINT || `${process.env.KLING_BASE_URL || 'https://api-singapore.klingai.com'}/v1/images/generations`,
      headers: {
        Authorization: `Bearer ${createKlingToken(accessKey, secretKey)}`,
        'Content-Type': 'application/json',
      },
      body: {
        model_name: process.env.KLING_IMAGE_MODEL || defaultKlingImageModel,
        prompt,
        image: image.base64,
        image_reference: references[0]?.base64,
        n: 1,
        aspect_ratio: aspectRatio === 'adaptive' ? '16:9' : aspectRatio,
      },
    }
  }

  if (provider === 'openai') {
    const missingEnv = presentEnv(['OPENAI_API_KEY'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    return {
      providerName,
      missingEnv,
      endpoint: process.env.OPENAI_IMAGE_ENDPOINT || 'https://api.openai.com/v1/images/edits',
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      },
      body: {
        model: process.env.OPENAI_IMAGE_MODEL || defaultOpenAIImageModel,
        prompt,
        size: aspectRatio === 'adaptive' ? 'auto' : imageSizeForAspectRatio(aspectRatio) || 'auto',
        n: 1,
      },
    }
  }

  if (provider === 'my') {
    const midjourneyApiKey = process.env.MIDJOURNEY_API_KEY || process.env.MY_API_KEY
    const midjourneyEndpoint = process.env.MIDJOURNEY_IMAGE_ENDPOINT || process.env.MY_IMAGE_ENDPOINT
    const midjourneyModel = process.env.MIDJOURNEY_IMAGE_MODEL || process.env.MY_IMAGE_MODEL || 'midjourney'
    const missingEnv = [
      midjourneyApiKey ? '' : 'MIDJOURNEY_API_KEY',
      midjourneyEndpoint ? '' : 'MIDJOURNEY_IMAGE_ENDPOINT',
    ].filter(Boolean)
    if (missingEnv.length > 0) return { providerName, missingEnv }

    const inputImages = [image.dataUrl, ...references.map((reference) => reference.dataUrl)]
    return {
      providerName,
      missingEnv,
      endpoint: midjourneyEndpoint,
      headers: {
        Authorization: `Bearer ${midjourneyApiKey}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: midjourneyModel,
        prompt,
        image: image.dataUrl,
        images: inputImages,
        negative_prompt: negativePrompt || undefined,
        size: aspectRatio === 'adaptive' ? 'adaptive' : imageSizeForAspectRatio(aspectRatio) || 'adaptive',
        response_format: 'b64_json',
        n: 1,
      },
    }
  }

  if (provider === 'flux') {
    const missingEnv = presentEnv(['FLUX_API_KEY', 'FLUX_IMAGE_ENDPOINT'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    const inputImages = [image.dataUrl, ...references.map((reference) => reference.dataUrl)]
    return {
      providerName,
      missingEnv,
      endpoint: process.env.FLUX_IMAGE_ENDPOINT,
      headers: {
        Authorization: `Bearer ${process.env.FLUX_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: process.env.FLUX_IMAGE_MODEL || 'flux-kontext-pro',
        prompt,
        image: image.dataUrl,
        images: inputImages,
        negative_prompt: negativePrompt || undefined,
        aspect_ratio: aspectRatio === 'adaptive' ? undefined : aspectRatio,
        size: aspectRatio === 'adaptive' ? 'adaptive' : imageSizeForAspectRatio(aspectRatio) || 'adaptive',
        response_format: 'b64_json',
        n: 1,
      },
    }
  }

  if (provider === 'sd') {
    const missingEnv = presentEnv(['SD_API_KEY', 'SD_IMAGE_ENDPOINT'])
    if (missingEnv.length > 0) return { providerName, missingEnv }

    const inputImages = [image.dataUrl, ...references.map((reference) => reference.dataUrl)]
    return {
      providerName,
      missingEnv,
      endpoint: process.env.SD_IMAGE_ENDPOINT,
      headers: {
        Authorization: `Bearer ${process.env.SD_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: {
        model: process.env.SD_IMAGE_MODEL || 'stable-diffusion',
        prompt,
        image: image.dataUrl,
        init_image: image.dataUrl,
        images: inputImages,
        negative_prompt: negativePrompt || undefined,
        aspect_ratio: aspectRatio === 'adaptive' ? undefined : aspectRatio,
        size: aspectRatio === 'adaptive' ? 'adaptive' : imageSizeForAspectRatio(aspectRatio) || 'adaptive',
        response_format: 'b64_json',
        n: 1,
      },
    }
  }

  return { providerName, missingEnv: ['UNSUPPORTED_IMAGE_PROVIDER'] }
}

function extensionForImageResponse(contentType: string | null, url = '') {
  const normalized = (contentType ?? '').split(';')[0]?.trim().toLowerCase()
  const extensionFromMime = Object.entries(imageMimeTypes).find(([, mimeType]) => mimeType === normalized)?.[0]
  if (extensionFromMime) return extensionFromMime

  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase()
    if (imageMimeTypes[extension]) return extension
  } catch {
    return '.png'
  }

  return '.png'
}

function decodeImagePayload(value: string) {
  const dataUrlMatch = value.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i)
  const mimeType = dataUrlMatch?.[1]?.toLowerCase() ?? 'image/png'
  const base64 = dataUrlMatch?.[2] ?? value
  const buffer = Buffer.from(base64.replace(/\s/g, ''), 'base64')
  if (buffer.length === 0) return null
  return { mimeType, buffer }
}

async function saveProviderImageOutput(directory: string, payload: unknown) {
  const encodedImage = extractImageBase64(payload)
  if (encodedImage) {
    const decoded = decodeImagePayload(encodedImage)
    if (decoded) {
      const outputPath = path.join(directory, `result${extensionForMime(decoded.mimeType)}`)
      fs.writeFileSync(outputPath, decoded.buffer)
      return { resultImagePath: outputPath, resultImageUrl: `/api/local-image?path=${encodeURIComponent(outputPath)}` }
    }
  }

  const imageUrl = extractImageUrl(payload)
  if (!imageUrl) return {}
  if (/^data:image\//i.test(imageUrl)) {
    const decoded = decodeImagePayload(imageUrl)
    if (!decoded) return {}
    const outputPath = path.join(directory, `result${extensionForMime(decoded.mimeType)}`)
    fs.writeFileSync(outputPath, decoded.buffer)
    return { resultImagePath: outputPath, resultImageUrl: `/api/local-image?path=${encodeURIComponent(outputPath)}`, providerImageUrl: imageUrl }
  }

  const response = await fetch(imageUrl)
  if (!response.ok) return { providerImageUrl: imageUrl }

  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length === 0) return { providerImageUrl: imageUrl }

  const extension = extensionForImageResponse(response.headers.get('content-type'), imageUrl)
  const outputPath = path.join(directory, `result${extension}`)
  fs.writeFileSync(outputPath, buffer)
  return { resultImagePath: outputPath, resultImageUrl: `/api/local-image?path=${encodeURIComponent(outputPath)}`, providerImageUrl: imageUrl }
}

function buildDashScopeImageTaskEndpoint(taskId: string) {
  const explicitEndpoint = process.env.DASHSCOPE_IMAGE_TASK_ENDPOINT || process.env.DASHSCOPE_TASK_ENDPOINT
  if (explicitEndpoint) return explicitEndpoint.replace(/\{task_id\}|\{taskId\}/g, encodeURIComponent(taskId))

  return `https://dashscope.aliyuncs.com/api/v1/tasks/${encodeURIComponent(taskId)}`
}

async function pollDashScopeImageTask(taskId: string) {
  const apiKey = process.env.DASHSCOPE_API_KEY
  if (!apiKey) return null

  let latest: Awaited<ReturnType<typeof getProviderJson>> | null = null
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 3000))
    latest = await getProviderJson(buildDashScopeImageTaskEndpoint(taskId), {
      Authorization: `Bearer ${apiKey}`,
    })

    const status = extractProviderTaskStatus(latest.payload)
    const hasImage = extractImageUrl(latest.payload) || extractImageBase64(latest.payload)
    if (hasImage || isProviderFailureStatus(status)) break
  }

  return latest
}

function buildKlingImageTaskEndpoint(createEndpoint: string, taskId: string) {
  const explicitEndpoint = process.env.KLING_IMAGE_TASK_ENDPOINT || process.env.KLING_TASK_ENDPOINT
  if (explicitEndpoint) return explicitEndpoint.replace(/\{task_id\}|\{taskId\}/g, encodeURIComponent(taskId))

  return `${createEndpoint.replace(/\/+$/, '')}/${encodeURIComponent(taskId)}`
}

async function pollKlingImageTask(createEndpoint: string, taskId: string) {
  const accessKey = process.env.KLING_ACCESS_KEY
  const secretKey = process.env.KLING_SECRET_KEY
  if (!accessKey || !secretKey) return null

  let latest: Awaited<ReturnType<typeof getProviderJson>> | null = null
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (attempt > 0) await new Promise((resolve) => setTimeout(resolve, 3000))
    latest = await getProviderJson(buildKlingImageTaskEndpoint(createEndpoint, taskId), {
      Authorization: `Bearer ${createKlingToken(accessKey, secretKey)}`,
    })

    const status = extractProviderTaskStatus(latest.payload)
    const hasImage = extractImageUrl(latest.payload) || extractImageBase64(latest.payload)
    if (hasImage || isProviderFailureStatus(status)) break
  }

  return latest
}

async function postProviderJson(endpoint: string, headers: Record<string, string>, body: unknown) {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  })
  const responseText = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(responseText)
  } catch {
    payload = responseText
  }

  return { ok: response.ok, status: response.status, payload }
}

async function postOpenAIImageEdit(endpoint: string, headers: Record<string, string>, body: unknown, image: PreparedVideoImage, references: PreparedVideoImage[]) {
  const requestBody = isRecord(body) ? body : {}
  const form = new FormData()
  form.append('model', getString(requestBody.model) || defaultOpenAIImageModel)
  form.append('prompt', getString(requestBody.prompt) || 'Edit this image.')
  form.append('n', String(requestBody.n || 1))
  const size = getString(requestBody.size)
  if (size) form.append('size', size)

  form.append('image[]', new Blob([image.buffer], { type: image.mimeType }), `source${extensionForMime(image.mimeType)}`)
  references.slice(0, 8).forEach((reference, index) => {
    form.append('image[]', new Blob([reference.buffer], { type: reference.mimeType }), `reference-${index + 1}${extensionForMime(reference.mimeType)}`)
  })

  const response = await fetch(endpoint, {
    method: 'POST',
    headers,
    body: form,
  })
  const responseText = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(responseText)
  } catch {
    payload = responseText
  }

  return { ok: response.ok, status: response.status, payload }
}

async function getProviderJson(endpoint: string, headers: Record<string, string>) {
  const response = await fetch(endpoint, {
    method: 'GET',
    headers,
  })
  const responseText = await response.text()
  let payload: unknown
  try {
    payload = JSON.parse(responseText)
  } catch {
    payload = responseText
  }

  return { ok: response.ok, status: response.status, payload }
}

function getVideoTaskTarget(id?: string) {
  if (!id || /[\\/]/.test(id) || id.includes('..')) return null
  const root = path.resolve(process.cwd(), 'video-tasks')
  const directory = path.resolve(root, id)
  if (!directory.startsWith(`${root}${path.sep}`)) return null
  if (!safeStat(directory)?.isDirectory()) return null
  return { directory, directoryName: path.basename(directory) }
}

function deleteVideoTask(id?: string) {
  const target = getVideoTaskTarget(id)
  if (!target) throw new Error('找不到这个视频任务')

  fs.rmSync(target.directory, { recursive: true, force: true })
  return target.directoryName
}

function buildDashScopeTaskEndpoint(taskId: string) {
  const explicitEndpoint = process.env.DASHSCOPE_VIDEO_TASK_ENDPOINT || process.env.DASHSCOPE_TASK_ENDPOINT
  if (explicitEndpoint) return explicitEndpoint.replace(/\{task_id\}|\{taskId\}/g, encodeURIComponent(taskId))

  const createEndpoint = process.env.DASHSCOPE_VIDEO_ENDPOINT || 'https://dashscope.aliyuncs.com/api/v1/services/aigc/video-generation/video-synthesis'
  const baseUrl = new URL(createEndpoint)
  return `${baseUrl.origin}/api/v1/tasks/${encodeURIComponent(taskId)}`
}

async function refreshVideoTask(id?: string) {
  const target = getVideoTaskTarget(id)
  if (!target) throw new Error('找不到这个视频任务')

  getVideoEnvValues()
  const currentTask = summarizeVideoTask(target.directory, target.directoryName)
  if (!currentTask) throw new Error('读不到这个视频任务')
  if (!currentTask.taskId) throw new Error('这个任务还没有平台任务 ID')

  if (currentTask.provider !== 'wanxiang') throw new Error(`暂时只支持自动查询阿里万象任务，${currentTask.providerName ?? '这个平台'} 需要手动刷新平台结果`)

  const apiKey = process.env.DASHSCOPE_API_KEY
  if (!apiKey) throw new Error('缺少 DASHSCOPE_API_KEY，不能查询阿里万象任务')

  const providerResponsePath = path.join(target.directory, 'provider-response.json')
  const previousResponse = readJsonFile(providerResponsePath)
  const previousPayload = isRecord(previousResponse) ? previousResponse.payload ?? previousResponse.previousPayload : undefined
  const providerResponse = await getProviderJson(buildDashScopeTaskEndpoint(currentTask.taskId), {
    Authorization: `Bearer ${apiKey}`,
  })

  writeJson(providerResponsePath, {
    status: providerResponse.status,
    ok: providerResponse.ok,
    refreshedAt: new Date().toISOString(),
    payload: providerResponse.payload,
    previousPayload: providerResponse.ok ? undefined : previousPayload,
  })

  const task = summarizeVideoTask(target.directory, target.directoryName)
  if (!task) throw new Error('平台结果已更新，但本地摘要读取失败')
  return task
}

function extensionForVideoResponse(contentType: string | null, url: string) {
  const normalized = (contentType ?? '').split(';')[0]?.trim().toLowerCase()
  if (normalized === 'video/mp4') return '.mp4'
  if (normalized === 'video/webm') return '.webm'
  if (normalized === 'video/quicktime') return '.mov'

  try {
    const extension = path.extname(new URL(url).pathname).toLowerCase()
    if (videoMimeTypes[extension]) return extension
  } catch {
    return '.mp4'
  }

  return '.mp4'
}

async function downloadVideoTask(id?: string) {
  const target = getVideoTaskTarget(id)
  if (!target) throw new Error('找不到这个视频任务')

  let task = summarizeVideoTask(target.directory, target.directoryName)
  if (!task) throw new Error('读不到这个视频任务')
  if (task.localVideoUrl) return task
  if (!task.videoUrl && task.provider === 'wanxiang' && task.taskId) task = await refreshVideoTask(task.id)
  if (!task.videoUrl) throw new Error('平台还没有返回可下载的视频地址')

  const response = await fetch(task.videoUrl)
  if (!response.ok) throw new Error(`下载平台视频失败：${response.status}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length === 0) throw new Error('平台视频文件为空')

  const extension = extensionForVideoResponse(response.headers.get('content-type'), task.videoUrl)
  const videoPath = path.join(target.directory, `output${extension}`)
  fs.writeFileSync(videoPath, buffer)

  const providerResponsePath = path.join(target.directory, 'provider-response.json')
  const providerResponse = readJsonFile(providerResponsePath)
  if (isRecord(providerResponse)) writeJson(providerResponsePath, { ...providerResponse, downloadedAt: new Date().toISOString() })

  const nextTask = summarizeVideoTask(target.directory, target.directoryName)
  if (!nextTask) throw new Error('视频已保存，但本地摘要读取失败')
  return nextTask
}

function safeFileName(value: string) {
  return (
    value
      .replace(/\.[^.]+$/, '')
      .replace(/[\\/:*?"<>|\n\r\t]+/g, '-')
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 80) || 'cowart-video'
  )
}

function copyVideoTaskToDownloads(id?: string) {
  const target = getVideoTaskTarget(id)
  if (!target) throw new Error('找不到这个视频任务')

  const task = summarizeVideoTask(target.directory, target.directoryName)
  if (!task) throw new Error('读不到这个视频任务')

  const localVideoPath = findLocalVideoPath(target.directory)
  if (!localVideoPath) throw new Error('还没有本地视频文件，请先点“保存到本地”')

  const extension = path.extname(localVideoPath).toLowerCase() || '.mp4'
  const downloadsDirectory = path.join(os.homedir(), 'Downloads', 'Cowart Videos')
  fs.mkdirSync(downloadsDirectory, { recursive: true })

  const stamp = new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')
  const fileName = `${stamp}-${safeFileName(task.title)}${extension}`
  const downloadsVideoPath = path.join(downloadsDirectory, fileName)
  fs.copyFileSync(localVideoPath, downloadsVideoPath)

  const providerResponsePath = path.join(target.directory, 'provider-response.json')
  const providerResponse = readJsonFile(providerResponsePath)
  if (isRecord(providerResponse)) writeJson(providerResponsePath, { ...providerResponse, downloadsVideoPath, downloadedToDownloadsAt: new Date().toISOString() })

  return { ...task, downloadsVideoPath }
}

function recentImageName(filePath: string, fileName: string) {
  if (filePath.includes('/.codex/generated_images/')) {
    const extension = path.extname(fileName)
    const parentName = path.basename(path.dirname(filePath)).slice(0, 8)
    const fileStem = path.basename(fileName, extension).replace(/^(?:ig_|exec-)/, '').slice(0, 8)
    return `codex-${parentName}-${fileStem}${extension}`
  }

  if (!/^source\.(png|jpe?g|webp|gif|svg)$/i.test(fileName)) return fileName

  const parentName = path.basename(path.dirname(filePath))
  const readableParent = parentName.replace(/^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}-\d{3}Z-?/, '')
  return `${readableParent || parentName}-${fileName}`
}

function isIgnoredRecentImage(filePath: string, fileName: string) {
  if (!filePath.startsWith('/tmp/')) return false
  return /^(cowart-|full-|codex-window|codex-current|codex-after)/i.test(fileName)
}

function isCodexGeneratedRecentImage(filePath: string, fileName: string) {
  const normalizedPath = filePath.split(path.sep).join('/')
  const codexGeneratedRoot = path.join(os.homedir(), '.codex', 'generated_images').split(path.sep).join('/')
  const localTaskRoot = path.join(process.cwd(), 'codex-image-tasks').split(path.sep).join('/')

  if (normalizedPath.startsWith(`${codexGeneratedRoot}/`)) return /^(?:ig_[a-f0-9]+|exec-[a-f0-9-]+)\.(?:png|jpe?g|webp)$/i.test(fileName)

  if (!normalizedPath.startsWith(`${localTaskRoot}/`)) return false
  if (/^(source|reference-\d+)\.(png|jpe?g|webp|gif|svg)$/i.test(fileName)) return false
  if (/codex-clipboard|screenshot|screen-shot/i.test(normalizedPath)) return false
  return true
}

function getAnnotationNoteText(annotations?: unknown[]) {
  if (!Array.isArray(annotations)) return ''
  return annotations
    .map((annotation) => (isRecord(annotation) ? getString(annotation.text) : undefined))
    .filter((text): text is string => Boolean(text))
    .join('\n')
}

function textMentionsEyewearRemoval(text: string) {
  return /(眼镜|眼境|墨镜|太阳镜|glasses|sunglasses|eyeglasses|eyewear)/i.test(text) && /(去掉|取掉|去除|移除|删除|不要|摘掉|remove|erase|delete|without)/i.test(text)
}

function textMentionsClothingChange(text: string) {
  return /(衣服|服装|外套|夹克|皮衣|风衣|衬衫|上衣|换衣|换一件|coat|jacket|trench|clothing|outfit|shirt)/i.test(text) && /(换|改|替换|变成|穿|replace|change|wear)/i.test(text)
}

function buildStrictImageEditGuidance(annotations?: unknown[], hasReferences = false) {
  const annotationNotes = getAnnotationNoteText(annotations)
  const lines = [
    '严格局部修补模式，不是整图重绘。',
    '人物一致性是最高优先级；改图后人物必须和原人物至少达到 95% 以上相似度。如果人物一致性和其它改动冲突，优先保留原人物，只缩小改动范围。',
    '以原图作为底图，只修改画布标注位置和补充说明明确要求的区域；未标注区域尽量像素级保持不变。',
    '锁定主体位置、原始裁切、镜头距离、光线、背景、服装、发型、材质纹理、噪点和整体摄影质感。',
    '如果画面中有人，必须保持同一人物身份、脸型轮廓、头型、下巴、颧骨、鼻型、嘴型、耳朵、发际线、肤色、五官比例和表情；不要美化、不要换脸。',
    '不要重绘整个头部或整张脸。除明确标注的脸部目标外，可见脸部必须沿用原图，包括脸宽、脸长、脸颊肉感、眼距、鼻翼宽度、嘴角和左右不对称特征。',
    '交付前自检：如果脸型或人物相似度达不到 95% 以上，结果无效，必须缩小遮罩重新做更局部的编辑。',
  ]

  if (textMentionsEyewearRemoval(annotationNotes)) {
    lines.push('眼镜/墨镜移除规则：只移除镜片和镜框。只在眼镜覆盖范围内补出被遮挡的眼睛、眼皮、眉毛、鼻梁阴影和皮肤纹理；眼镜范围外的可见脸部必须沿用原图。')
  }

  if (textMentionsClothingChange(annotationNotes)) {
    lines.push('换衣服规则：只替换原衣服和肩膀覆盖区域；换衣服时不要移动或重绘头部、脸、脖子位置、头发、耳朵或背景。')
  }

  if (hasReferences) {
    lines.push('参考素材只能作为产品、物件、局部元素或风格参考自然融合；不要替换主图主体，不要机械拼贴。')
  }

  return lines
}

function buildCodexInstruction(promptPath: string, imagePath: string, referenceImagePaths: string[] = [], annotations?: unknown[]) {
  const guidance = buildStrictImageEditGuidance(annotations, referenceImagePaths.length > 0)
  return [
    '请用 Codex 根据这个画布任务重新生成/修改图片。',
    `原图文件：${imagePath}`,
    referenceImagePaths.length > 0 ? `参考素材文件：\n${referenceImagePaths.map((filePath, index) => `${index + 1}. ${filePath}`).join('\n')}` : null,
    `改图任务：${promptPath}`,
    '生成参数：',
    ...guidance.map((line) => `- ${line}`),
    '生成完成后把新图片路径发给我。',
  ]
    .filter(Boolean)
    .join('\n')
}

function safeStat(filePath: string) {
  try {
    return fs.statSync(filePath)
  } catch {
    return null
  }
}

function scanImageDirectory(directory: string, maxDepth: number, now: number, results: RecentImage[], maxAgeMs = recentImageMaxAgeMs) {
  const stat = safeStat(directory)
  if (!stat?.isDirectory()) return

  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(directory, { withFileTypes: true })
  } catch {
    return
  }

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (maxDepth > 0) scanImageDirectory(filePath, maxDepth - 1, now, results, maxAgeMs)
      continue
    }
    if (!entry.isFile()) continue

    const extension = path.extname(entry.name).toLowerCase()
    if (!imageMimeTypes[extension]) continue
    if (isIgnoredRecentImage(filePath, entry.name)) continue

    const fileStat = safeStat(filePath)
    if (!fileStat?.isFile()) continue
    if (now - fileStat.mtimeMs > maxAgeMs) continue

    results.push({
      path: filePath,
      name: recentImageName(filePath, entry.name),
      mtimeMs: fileStat.mtimeMs,
      size: fileStat.size,
      url: `/api/local-image?path=${encodeURIComponent(filePath)}`,
    })
  }
}

function isLikelyChatGptDownload(image: RecentImage) {
  return /chatgpt|openai|dall[-_\s·.]*e|gpt[-_\s.]*image/i.test(`${image.name} ${image.path}`)
}

function getRecentImages() {
  const home = os.homedir()
  const localTaskDirectory = path.join(process.cwd(), 'codex-image-tasks')
  const codexGeneratedDirectory = path.join(home, '.codex', 'generated_images')
  const directories = [codexGeneratedDirectory, localTaskDirectory]

  const now = Date.now()
  const results: RecentImage[] = []
  for (const directory of directories) {
    const depth = directory === codexGeneratedDirectory || directory === localTaskDirectory ? 2 : 0
    scanImageDirectory(directory, depth, now, results)
  }

  return results
    .filter((image) => isCodexGeneratedRecentImage(image.path, path.basename(image.path)))
    .sort((left, right) => right.mtimeMs - left.mtimeMs)
    .filter((image, index, images) => images.findIndex((item) => item.path === image.path) === index)
    .slice(0, 80)
}

function deleteGeneratedImage(filePath?: string) {
  if (!filePath || !path.isAbsolute(filePath)) throw new Error('缺少要删除的图片路径')

  const root = path.resolve(process.cwd(), 'codex-image-tasks')
  const target = path.resolve(filePath)
  if (!target.startsWith(`${root}${path.sep}`)) throw new Error('只能删除 Cowart 生成任务目录里的图片')

  const fileName = path.basename(target)
  const extension = path.extname(fileName).toLowerCase()
  if (!imageMimeTypes[extension]) throw new Error('只能删除图片文件')
  if (!/^(result|output|generated|edited)/i.test(fileName)) throw new Error('只能删除生成结果图，不能删除原图或参考图')

  const fileStat = safeStat(target)
  if (!fileStat?.isFile()) throw new Error('找不到这张图片')

  fs.rmSync(target, { force: true })
  return target
}

function getRecentDownloadImages() {
  const downloadsDirectory = path.join(os.homedir(), 'Downloads')
  const now = Date.now()
  const results: RecentImage[] = []
  scanImageDirectory(downloadsDirectory, 0, now, results, recentDownloadImageMaxAgeMs)

  return results
    .sort((left, right) => {
      const leftScore = isLikelyChatGptDownload(left) ? 1 : 0
      const rightScore = isLikelyChatGptDownload(right) ? 1 : 0
      if (leftScore !== rightScore) return rightScore - leftScore
      return right.mtimeMs - left.mtimeMs
    })
    .filter((image, index, images) => images.findIndex((item) => item.path === image.path) === index)
    .slice(0, 80)
}

function localImageImportPlugin(): PluginOption {
  return {
    name: 'cowart-local-image-import',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api/recent-images', (_req: Connect.IncomingMessage, res: ServerResponse) => {
        try {
          sendJson(res, { images: getRecentImages() })
        } catch {
          res.statusCode = 500
          sendJson(res, { images: [], error: 'Could not list recent images' })
        }
      })

      server.middlewares.use('/api/recent-download-images', (_req: Connect.IncomingMessage, res: ServerResponse) => {
        try {
          sendJson(res, { images: getRecentDownloadImages() })
        } catch {
          res.statusCode = 500
          sendJson(res, { images: [], error: 'Could not list recent downloaded images' })
        }
      })

      server.middlewares.use('/api/notebook-backup', (req: Connect.IncomingMessage, res: ServerResponse) => {
        try {
          if (req.method !== 'POST') {
            res.statusCode = 405
            sendJson(res, { error: 'Method not allowed' })
            return
          }
          sendJson(res, backupNotebookData())
        } catch (error) {
          res.statusCode = 500
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not backup notebook' })
        }
      })

      server.middlewares.use('/api/notebook-image', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        try {
          if (req.method !== 'POST') {
            res.statusCode = 405
            sendJson(res, { error: 'Method not allowed' })
            return
          }
          const body = await readJsonBody(req, 32 * 1024 * 1024)
          sendJson(res, saveNotebookImage(body))
        } catch (error) {
          res.statusCode = 400
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not save notebook image' })
        }
      })

      server.middlewares.use('/api/notebook', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        try {
          if (req.method === 'GET') {
            sendJson(res, loadNotebookData())
            return
          }
          if (req.method === 'POST') {
            const body = await readJsonBody(req, 8 * 1024 * 1024)
            sendJson(res, saveNotebookData(body))
            return
          }
          res.statusCode = 405
          sendJson(res, { error: 'Method not allowed' })
        } catch (error) {
          res.statusCode = 500
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not save notebook' })
        }
      })

      server.middlewares.use('/api/local-image', (req: Connect.IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '', 'http://127.0.0.1')
          const filePath = url.searchParams.get('path')
          if (!filePath || !path.isAbsolute(filePath)) {
            res.statusCode = 400
            res.end('Missing absolute image path')
            return
          }

          const extension = path.extname(filePath).toLowerCase()
          const mimeType = imageMimeTypes[extension]
          if (!mimeType) {
            res.statusCode = 415
            res.end('Unsupported image type')
            return
          }

          if (!fs.existsSync(filePath)) {
            res.statusCode = 404
            res.end('Image not found')
            return
          }

          res.setHeader('Content-Type', mimeType)
          res.setHeader('Cache-Control', 'no-store')
          fs.createReadStream(filePath).pipe(res)
        } catch {
          res.statusCode = 500
          res.end('Could not read image')
        }
      })

      server.middlewares.use('/api/generated-image-delete', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          sendJson(res, { error: 'Method not allowed' })
          return
        }

        try {
          const body = (await readJsonBody(req, 1024 * 1024)) as { path?: string }
          const deletedPath = deleteGeneratedImage(body.path)
          sendJson(res, { deletedPath })
        } catch (error) {
          res.statusCode = 400
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not delete image' })
        }
      })

      server.middlewares.use('/api/local-video', (req: Connect.IncomingMessage, res: ServerResponse) => {
        try {
          const url = new URL(req.url ?? '', 'http://127.0.0.1')
          const filePath = url.searchParams.get('path')
          if (!filePath || !path.isAbsolute(filePath)) {
            res.statusCode = 400
            res.end('Missing absolute video path')
            return
          }

          const extension = path.extname(filePath).toLowerCase()
          const mimeType = videoMimeTypes[extension]
          if (!mimeType) {
            res.statusCode = 415
            res.end('Unsupported video type')
            return
          }

          const fileStat = safeStat(filePath)
          if (!fileStat?.isFile()) {
            res.statusCode = 404
            res.end('Video not found')
            return
          }

          res.setHeader('Content-Type', mimeType)
          res.setHeader('Accept-Ranges', 'bytes')
          res.setHeader('Cache-Control', 'no-store')

          const range = req.headers.range
          if (range) {
            const [startPart, endPart] = range.replace(/bytes=/, '').split('-')
            const start = Number.parseInt(startPart ?? '0', 10)
            const end = endPart ? Number.parseInt(endPart, 10) : fileStat.size - 1
            if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= fileStat.size) {
              res.statusCode = 416
              res.setHeader('Content-Range', `bytes */${fileStat.size}`)
              res.end()
              return
            }

            res.statusCode = 206
            res.setHeader('Content-Range', `bytes ${start}-${end}/${fileStat.size}`)
            res.setHeader('Content-Length', String(end - start + 1))
            fs.createReadStream(filePath, { start, end }).pipe(res)
            return
          }

          res.setHeader('Content-Length', String(fileStat.size))
          fs.createReadStream(filePath).pipe(res)
        } catch {
          res.statusCode = 500
          res.end('Could not read video')
        }
      })

      server.middlewares.use('/api/video-tasks', (_req: Connect.IncomingMessage, res: ServerResponse) => {
        try {
          sendJson(res, { tasks: listVideoTasks() })
        } catch {
          res.statusCode = 500
          sendJson(res, { tasks: [], error: 'Could not list video tasks' })
        }
      })

      server.middlewares.use('/api/video-task-refresh', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          sendJson(res, { error: 'Method not allowed' })
          return
        }

        try {
          const body = (await readJsonBody(req, 1024 * 1024)) as VideoTaskActionRequest
          const task = await refreshVideoTask(body.id)
          sendJson(res, { task })
        } catch (error) {
          res.statusCode = 400
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not refresh video task' })
        }
      })

      server.middlewares.use('/api/video-task-download', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          sendJson(res, { error: 'Method not allowed' })
          return
        }

        try {
          const body = (await readJsonBody(req, 1024 * 1024)) as VideoTaskActionRequest
          const task = await downloadVideoTask(body.id)
          sendJson(res, { task })
        } catch (error) {
          res.statusCode = 400
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not download video task' })
        }
      })

      server.middlewares.use('/api/video-task-save-downloads', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          sendJson(res, { error: 'Method not allowed' })
          return
        }

        try {
          const body = (await readJsonBody(req, 1024 * 1024)) as VideoTaskActionRequest
          const task = copyVideoTaskToDownloads(body.id)
          sendJson(res, { task, downloadsVideoPath: task.downloadsVideoPath })
        } catch (error) {
          res.statusCode = 400
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not save video to Downloads' })
        }
      })

      server.middlewares.use('/api/video-task-delete', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          sendJson(res, { error: 'Method not allowed' })
          return
        }

        try {
          const body = (await readJsonBody(req, 1024 * 1024)) as VideoTaskActionRequest
          const deletedId = deleteVideoTask(body.id)
          sendJson(res, { deletedId })
        } catch (error) {
          res.statusCode = 400
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not delete video task' })
        }
      })

      server.middlewares.use('/api/codex-image-task', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          sendJson(res, { error: 'Method not allowed' })
          return
        }

        try {
          const body = (await readJsonBody(req, 80 * 1024 * 1024)) as CodexTaskRequest
          const match = body.imageDataUrl?.match(/^data:(image\/[a-z0-9+.-]+);base64,(.+)$/i)
          if (!match) {
            res.statusCode = 400
            sendJson(res, { error: 'Missing image data' })
            return
          }

          const mimeType = match[1].toLowerCase()
          const base64 = match[2]
          const imageBuffer = Buffer.from(base64, 'base64')
          if (imageBuffer.length === 0) {
            res.statusCode = 400
            sendJson(res, { error: 'Empty image data' })
            return
          }

          const title = body.image?.title || 'image-task'
          const stamp = new Date().toISOString().replace(/[:.]/g, '-')
          const directory = path.join(process.cwd(), 'codex-image-tasks', `${stamp}-${safeSlug(title)}`)
          fs.mkdirSync(directory, { recursive: true })

          const imagePath = path.join(directory, `source${extensionForMime(mimeType)}`)
          const taskPath = path.join(directory, 'task.json')
          const promptPath = path.join(directory, 'prompt.txt')
          const codexInstructionPath = path.join(directory, 'send-to-codex.txt')
          const referenceRequests = Array.isArray(body.references) ? body.references : []
          const referenceDataUrls = Array.isArray(body.referenceImageDataUrls) ? body.referenceImageDataUrls : []
          const savedReferences = referenceDataUrls
            .slice(0, 8)
            .map((dataUrl, index) => {
              const prepared = parseImageDataUrl(dataUrl)
              if (!prepared) return null

              const reference = referenceRequests[index]
              const label = reference?.label || `素材 ${index + 1}`
              const title = reference?.image?.title || label
              const referenceImagePath = path.join(directory, `reference-${index + 1}${extensionForMime(prepared.mimeType)}`)
              fs.writeFileSync(referenceImagePath, prepared.buffer)
              return {
                label,
                title,
                imagePath: referenceImagePath,
                image: reference?.image,
              }
            })
            .filter((item): item is NonNullable<typeof item> => Boolean(item))

          const editPrompt = body.editPrompt || '请基于这张图片继续改图。'
          const negativePrompt = body.negativePrompt?.trim()
          const strictImageEditGuidance = buildStrictImageEditGuidance(body.annotations, savedReferences.length > 0)
          const promptText = [
            editPrompt,
            negativePrompt ? `\n反向提示词：${negativePrompt}` : '',
            '',
            '原图信息：',
            `- 标题：${title}`,
            body.image?.filePath ? `- 本机原始路径：${body.image.filePath}` : null,
            body.image?.prompt ? `- 导入来源：${body.image.prompt}` : null,
            savedReferences.length > 0 ? '' : null,
            savedReferences.length > 0 ? '参考素材信息：' : null,
            ...savedReferences.map((reference, index) => `- ${index + 1}. ${reference.label}：${reference.title}；文件：${reference.imagePath}`),
            '',
            '改图参数：',
            ...strictImageEditGuidance.map((line) => `- ${line}`),
            '',
            savedReferences.length > 0
              ? '请保持主图主体、构图和质感，把参考素材作为任意产品、物件、局部元素或风格参考自然融合进最终图片；仍然只允许改动标注区域和明确要求区域。'
              : '请保持原图主体、构图和质感，只修改标注指出的问题；不要整图重绘。',
          ]
            .filter(Boolean)
            .join('\n')
          const codexInstruction = buildCodexInstruction(promptPath, imagePath, savedReferences.map((reference) => reference.imagePath), body.annotations)

          fs.writeFileSync(imagePath, imageBuffer)
          fs.writeFileSync(promptPath, promptText)
          fs.writeFileSync(codexInstructionPath, codexInstruction)
          fs.writeFileSync(
            taskPath,
            JSON.stringify(
              {
                image: {
                  ...body.image,
                  savedImagePath: imagePath,
                },
                references: savedReferences,
                annotations: body.annotations ?? [],
                editPrompt,
                negativePrompt: negativePrompt || undefined,
                promptPath,
                codexInstructionPath,
                createdAt: new Date().toISOString(),
              },
              null,
              2,
            ),
          )

          sendJson(res, {
            directory,
            imagePath,
            taskPath,
            promptPath,
            codexInstructionPath,
            codexInstruction,
          })
        } catch (error) {
          res.statusCode = 500
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not create Codex task' })
        }
      })

      server.middlewares.use('/api/image-config', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        try {
          if (req.method === 'GET') {
            sendJson(res, buildImageConfigResponse())
            return
          }

          if (req.method !== 'POST') {
            res.statusCode = 405
            sendJson(res, { error: 'Method not allowed' })
            return
          }

          const body = (await readJsonBody(req, 1024 * 1024)) as ImageConfigRequest
          const provider = body.provider ?? 'fal'
          if (!imageProviderIds.includes(provider)) {
            res.statusCode = 400
            sendJson(res, { error: 'Unsupported image provider' })
            return
          }

          sendJson(res, saveImageConfig(provider, body.values ?? {}))
        } catch (error) {
          res.statusCode = 500
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not save image config' })
        }
      })

      server.middlewares.use('/api/image-generation', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          sendJson(res, { error: 'Method not allowed' })
          return
        }

        try {
          const body = (await readJsonBody(req, 96 * 1024 * 1024)) as ImageTaskRequest
          const provider = body.provider ?? 'fal'
          if (!isImageProvider(provider)) {
            res.statusCode = 400
            sendJson(res, { error: 'Unsupported image provider' })
            return
          }

          const image = parseImageDataUrl(body.imageDataUrl)
          if (!image) {
            res.statusCode = 400
            sendJson(res, { error: 'Missing image data' })
            return
          }

          const title = body.image?.title || 'image-api-task'
          const stamp = new Date().toISOString().replace(/[:.]/g, '-')
          const directory = path.join(process.cwd(), 'codex-image-tasks', `${stamp}-${provider}-${safeSlug(title)}`)
          fs.mkdirSync(directory, { recursive: true })

          const imagePath = path.join(directory, `source${extensionForMime(image.mimeType)}`)
          const requestPath = path.join(directory, 'request.json')
          const providerRequestPath = path.join(directory, 'provider-request.json')
          const providerResponsePath = path.join(directory, 'provider-response.json')
          const promptPath = path.join(directory, 'prompt.txt')
          fs.writeFileSync(imagePath, image.buffer)

          const referenceRequests = Array.isArray(body.references) ? body.references : []
          const referenceDataUrls = Array.isArray(body.referenceImageDataUrls) ? body.referenceImageDataUrls : []
          const preparedReferences = referenceDataUrls
            .slice(0, 8)
            .map((dataUrl) => parseImageDataUrl(dataUrl))
            .filter((reference): reference is PreparedVideoImage => Boolean(reference))
          const savedReferences = preparedReferences.map((reference, index) => {
            const referenceRequest = referenceRequests[index]
            const label = referenceRequest?.label || `素材 ${index + 1}`
            const referenceImagePath = path.join(directory, `reference-${index + 1}${extensionForMime(reference.mimeType)}`)
            fs.writeFileSync(referenceImagePath, reference.buffer)
            return {
              label,
              title: referenceRequest?.image?.title || label,
              imagePath: referenceImagePath,
              image: referenceRequest?.image,
            }
          })

          const editPrompt = body.editPrompt || '请基于这张图片继续改图。'
          const negativePrompt = body.negativePrompt?.trim()
          const aspectRatio = normalizeImageAspectRatio(body.aspectRatio)
          const promptText = [
            editPrompt,
            negativePrompt ? `\n反向提示词：${negativePrompt}` : '',
            '',
            'API 生图参数：',
            `- 平台：${imageProviderNames[provider]}`,
            `- 生成比例：${aspectRatio === 'adaptive' ? '自动/沿用底图' : aspectRatio}`,
            ...buildStrictImageEditGuidance(body.annotations, savedReferences.length > 0).map((line) => `- ${line}`),
          ].join('\n')
          fs.writeFileSync(promptPath, promptText)

          writeJson(requestPath, {
            provider,
            providerName: imageProviderNames[provider],
            image: {
              ...body.image,
              savedImagePath: imagePath,
            },
            references: savedReferences,
            annotations: body.annotations ?? [],
            editPrompt,
            negativePrompt: negativePrompt || undefined,
            aspectRatio,
            promptPath,
            createdAt: new Date().toISOString(),
          })

          const providerRequest = buildImageProviderRequest(provider, body, image, preparedReferences)
          writeJson(providerRequestPath, {
            provider,
            providerName: providerRequest.providerName,
            missingEnv: providerRequest.missingEnv,
            endpoint: providerRequest.endpoint,
            referenceImagePaths: savedReferences.map((reference) => reference.imagePath),
            body: providerRequest.body,
          })

          if (providerRequest.missingEnv.length > 0 || !providerRequest.endpoint || !providerRequest.headers || !providerRequest.body) {
            sendJson(res, {
              status: 'needs_config',
              provider,
              providerName: providerRequest.providerName,
              missingEnv: providerRequest.missingEnv,
              directory,
              imagePath,
              requestPath,
              promptPath,
              providerRequestPath,
            })
            return
          }

          const providerResponse =
            provider === 'openai'
              ? await postOpenAIImageEdit(providerRequest.endpoint, providerRequest.headers, providerRequest.body, image, preparedReferences)
              : await postProviderJson(providerRequest.endpoint, providerRequest.headers, providerRequest.body)
          let finalProviderResponse = providerResponse
          let savedOutput = providerResponse.ok ? await saveProviderImageOutput(directory, providerResponse.payload) : {}
          const initialTaskId = extractProviderTaskId(providerResponse.payload)
          if (provider === 'wanxiang' && providerResponse.ok && !savedOutput.resultImagePath && initialTaskId) {
            const polledResponse = await pollDashScopeImageTask(initialTaskId)
            if (polledResponse) {
              finalProviderResponse = polledResponse
              savedOutput = polledResponse.ok ? await saveProviderImageOutput(directory, polledResponse.payload) : savedOutput
            }
          }
          if (provider === 'kling' && providerResponse.ok && !savedOutput.resultImagePath && initialTaskId) {
            const polledResponse = await pollKlingImageTask(providerRequest.endpoint, initialTaskId)
            if (polledResponse) {
              finalProviderResponse = polledResponse
              savedOutput = polledResponse.ok ? await saveProviderImageOutput(directory, polledResponse.payload) : savedOutput
            }
          }
          writeJson(providerResponsePath, {
            status: finalProviderResponse.status,
            ok: finalProviderResponse.ok,
            createdAt: new Date().toISOString(),
            payload: finalProviderResponse.payload,
            previousPayload: finalProviderResponse === providerResponse ? undefined : providerResponse.payload,
            ...savedOutput,
          })

          if (!finalProviderResponse.ok) {
            res.statusCode = 502
            sendJson(res, {
              status: 'provider_error',
              error: sanitizeProviderError(extractProviderError(finalProviderResponse.payload)) || `${providerRequest.providerName} 返回 ${finalProviderResponse.status}`,
              provider,
              providerName: providerRequest.providerName,
              directory,
              imagePath,
              requestPath,
              promptPath,
              providerRequestPath,
              providerResponsePath,
            })
            return
          }

          sendJson(res, {
            status: savedOutput.resultImagePath ? 'ready' : 'submitted',
            provider,
            providerName: providerRequest.providerName,
            providerTaskId: extractProviderTaskId(finalProviderResponse.payload) ?? initialTaskId,
            directory,
            imagePath,
            requestPath,
            promptPath,
            providerRequestPath,
            providerResponsePath,
            ...savedOutput,
          })
        } catch (error) {
          res.statusCode = 500
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not create image task' })
        }
      })

      server.middlewares.use('/api/video-config', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        try {
          if (req.method === 'GET') {
            sendJson(res, buildVideoConfigResponse())
            return
          }

          if (req.method !== 'POST') {
            res.statusCode = 405
            sendJson(res, { error: 'Method not allowed' })
            return
          }

          const body = (await readJsonBody(req, 1024 * 1024)) as VideoConfigRequest
          const provider = body.provider ?? 'kling'
          if (!videoProviderIds.includes(provider)) {
            res.statusCode = 400
            sendJson(res, { error: 'Unsupported video provider' })
            return
          }

          sendJson(res, saveVideoConfig(provider, body.values ?? {}))
        } catch (error) {
          res.statusCode = 500
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not save video config' })
        }
      })

      server.middlewares.use('/api/video-generation', async (req: Connect.IncomingMessage, res: ServerResponse) => {
        if (req.method !== 'POST') {
          res.statusCode = 405
          sendJson(res, { error: 'Method not allowed' })
          return
        }

        try {
          const body = (await readJsonBody(req, 64 * 1024 * 1024)) as VideoTaskRequest
          const provider = body.provider ?? 'kling'
          if (!videoProviderIds.includes(provider)) {
            res.statusCode = 400
            sendJson(res, { error: 'Unsupported video provider' })
            return
          }

          const incomingDataUrls = (Array.isArray(body.imageDataUrls) && body.imageDataUrls.length > 0 ? body.imageDataUrls : [body.imageDataUrl]).filter(
            (value): value is string => typeof value === 'string',
          )
          const videoImages = incomingDataUrls.slice(0, 5).map((dataUrl) => parseImageDataUrl(dataUrl)).filter((image): image is PreparedVideoImage => Boolean(image))
          const image = videoImages[0]
          if (!image) {
            res.statusCode = 400
            sendJson(res, { error: 'Missing image data' })
            return
          }

          const sourceImages = Array.isArray(body.images) && body.images.length > 0 ? body.images.slice(0, videoImages.length) : body.image ? [body.image] : []
          const title = sourceImages[0]?.title || body.image?.title || 'video-task'
          const stamp = new Date().toISOString().replace(/[:.]/g, '-')
          const directory = path.join(process.cwd(), 'video-tasks', `${stamp}-${provider}-${safeSlug(title)}`)
          fs.mkdirSync(directory, { recursive: true })

          const imagePath = path.join(directory, `source${extensionForMime(image.mimeType)}`)
          const savedImages = videoImages.map((item, index) => {
            const fileName = index === 0 ? `source${extensionForMime(item.mimeType)}` : `reference-${index + 1}${extensionForMime(item.mimeType)}`
            const filePath = path.join(directory, fileName)
            fs.writeFileSync(filePath, item.buffer)
            return {
              ...(sourceImages[index] ?? {}),
              savedImagePath: filePath,
              role: index === 0 ? 'first_frame' : 'reference',
            }
          })
          const requestPath = path.join(directory, 'request.json')
          const providerRequestPath = path.join(directory, 'provider-request.json')
          const providerResponsePath = path.join(directory, 'provider-response.json')

          writeJson(requestPath, {
            provider,
            providerName: videoProviderNames[provider],
            image: {
              ...body.image,
              savedImagePath: imagePath,
            },
            images: savedImages,
            prompt: body.prompt,
            negativePrompt: body.negativePrompt,
            duration: body.duration,
            aspectRatio: body.aspectRatio,
            resolution: body.resolution,
            createdAt: new Date().toISOString(),
          })

          const providerRequest = buildProviderRequest(provider, body, image)
          writeJson(providerRequestPath, {
            provider,
            providerName: providerRequest.providerName,
            missingEnv: providerRequest.missingEnv,
            endpoint: providerRequest.endpoint,
            imageCount: savedImages.length,
            referenceImagePaths: savedImages.slice(1).map((item) => item.savedImagePath),
            body: providerRequest.body,
          })

          if (providerRequest.missingEnv.length > 0 || !providerRequest.endpoint || !providerRequest.headers || !providerRequest.body) {
            sendJson(res, {
              status: 'needs_config',
              provider,
              providerName: providerRequest.providerName,
              missingEnv: providerRequest.missingEnv,
              directory,
              imagePath,
              requestPath,
              providerRequestPath,
            })
            return
          }

          const providerResponse = await postProviderJson(providerRequest.endpoint, providerRequest.headers, providerRequest.body)
          writeJson(providerResponsePath, {
            status: providerResponse.status,
            ok: providerResponse.ok,
            createdAt: new Date().toISOString(),
            payload: providerResponse.payload,
          })

          if (!providerResponse.ok) {
            res.statusCode = 502
            sendJson(res, {
              error: `${providerRequest.providerName} 返回 ${providerResponse.status}`,
              provider,
              providerName: providerRequest.providerName,
              directory,
              imagePath,
              requestPath,
              providerRequestPath,
              providerResponsePath,
            })
            return
          }

          sendJson(res, {
            status: 'submitted',
            provider,
            providerName: providerRequest.providerName,
            providerTaskId: extractProviderTaskId(providerResponse.payload),
            directory,
            imagePath,
            requestPath,
            providerRequestPath,
            providerResponsePath,
          })
        } catch (error) {
          res.statusCode = 500
          sendJson(res, { error: error instanceof Error ? error.message : 'Could not create video task' })
        }
      })
    },
  }
}

function loadLocalEnv(mode: string) {
  const env = loadEnv(mode, process.cwd(), '')
  for (const [key, value] of Object.entries(env)) {
    process.env[key] ??= value
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  loadLocalEnv(mode)

  return {
    base: './',
    plugins: [react(), localImageImportPlugin()],
  }
})
