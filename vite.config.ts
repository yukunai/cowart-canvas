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
  imageDataUrl?: string
  referenceImageDataUrls?: string[]
}

type VideoProvider = 'kling' | 'volcengine' | 'wanxiang' | 'runway' | 'luma' | 'fal' | 'replicate'
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
const defaultArkVideoModel = 'doubao-seedance-2-0-260128'

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

const managedVideoEnvKeys = Array.from(new Set(Object.values(videoConfigFields).flatMap((fields) => fields.map((field) => field.key))))

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
      return line.trim() !== '# Cowart video API settings' && (!key || !managedVideoEnvKeys.includes(key))
    })
    .filter((line, index, lines) => line.trim() || lines[index - 1]?.trim())

  const managedLines = managedVideoEnvKeys
    .filter((key) => values[key])
    .map((key) => `${key}=${quoteEnvValue(values[key] ?? '')}`)

  const nextLines = [...preservedLines]
  if (managedLines.length > 0) {
    if (nextLines.length > 0 && nextLines.at(-1)?.trim()) nextLines.push('')
    nextLines.push('# Cowart video API settings', ...managedLines)
  }

  if (nextLines.length === 0) {
    if (fs.existsSync(envPath)) fs.unlinkSync(envPath)
    return
  }

  const nextContent = `${nextLines.join('\n').trim()}\n`
  fs.writeFileSync(envPath, nextContent)
}

function syncProcessEnv(values: Record<string, string>) {
  for (const key of managedVideoEnvKeys) {
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
  for (const key of managedVideoEnvKeys) {
    values[key] = fileValues[key] ?? process.env[key] ?? ''
  }
  syncProcessEnv(values)
  return values
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
  for (const key of managedVideoEnvKeys) {
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
    const fileStem = path.basename(fileName, extension).replace(/^ig_/, '').slice(0, 8)
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

  if (normalizedPath.startsWith(`${codexGeneratedRoot}/`)) return /^ig_[a-f0-9]+/i.test(fileName)

  if (!normalizedPath.startsWith(`${localTaskRoot}/`)) return false
  if (/^(source|reference-\d+)\.(png|jpe?g|webp|gif|svg)$/i.test(fileName)) return false
  if (/codex-clipboard|screenshot|screen-shot/i.test(normalizedPath)) return false
  return true
}

function buildCodexInstruction(promptPath: string, imagePath: string, referenceImagePaths: string[] = []) {
  return [
    '请用 Codex 根据这个画布任务重新生成/修改图片。',
    `原图文件：${imagePath}`,
    referenceImagePaths.length > 0 ? `参考素材文件：\n${referenceImagePaths.map((filePath, index) => `${index + 1}. ${filePath}`).join('\n')}` : null,
    `改图任务：${promptPath}`,
    '要求：保持主图主体、构图和质感；如果有参考素材，把它们作为任意产品、物件、局部元素或风格参考自然融合进最终图片，不要机械拼贴；生成完成后把新图片路径发给我。',
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
          const promptText = [
            editPrompt,
            '',
            '原图信息：',
            `- 标题：${title}`,
            body.image?.filePath ? `- 本机原始路径：${body.image.filePath}` : null,
            body.image?.prompt ? `- 导入来源：${body.image.prompt}` : null,
            savedReferences.length > 0 ? '' : null,
            savedReferences.length > 0 ? '参考素材信息：' : null,
            ...savedReferences.map((reference, index) => `- ${index + 1}. ${reference.label}：${reference.title}；文件：${reference.imagePath}`),
            '',
            savedReferences.length > 0
              ? '请保持主图主体、构图和质感，把参考素材作为任意产品、物件、局部元素或风格参考自然融合进最终图片。'
              : '请保持原图主体、构图和质感，只修改标注指出的问题。',
          ]
            .filter(Boolean)
            .join('\n')
          const codexInstruction = buildCodexInstruction(promptPath, imagePath, savedReferences.map((reference) => reference.imagePath))

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
