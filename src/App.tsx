import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type {
  CSSProperties,
  DragEvent as ReactDragEvent,
  PointerEvent as ReactPointerEvent,
} from 'react'
import {
  ArrowRight,
  ArrowUpRight,
  Circle as CircleIcon,
  Download,
  Globe2,
  ImagePlus,
  MapPin,
  MousePointer2,
  PencilLine,
  Plus,
  RefreshCcw,
  Send,
  SlidersHorizontal,
  Trash2,
  Type,
  Upload,
  Video,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import './App.css'

type GeneratedImage = {
  id: string
  title: string
  src: string
  prompt: string
  source: 'uploaded' | 'url' | 'recent'
  filePath?: string
}

type Language = 'zh' | 'en'

const languageOptions: Array<{ id: Language; label: string }> = [
  { id: 'zh', label: '中文' },
  { id: 'en', label: 'English' },
]

function readInitialLanguage(): Language {
  if (typeof window === 'undefined') return 'zh'
  return window.localStorage.getItem('cowart-canvas-language') === 'en' ? 'en' : 'zh'
}

function readInitialVideoPanelOpen() {
  if (typeof window === 'undefined') return false
  const params = new URLSearchParams(window.location.search)
  return params.get('video') === '1' || params.get('panel') === 'video'
}

function getDefaultStatus(language: Language) {
  return language === 'en'
    ? 'Upload, paste, or drop any image, then mark the problem area.'
    : '上传、粘贴或拖入任意图片，然后在问题位置写修改意见'
}

function getDragHintDefault(language: Language) {
  return language === 'en' ? 'Release to import image' : '松手导入图片'
}

function textMentionsEyewearRemoval(text: string) {
  return /(眼镜|眼境|墨镜|太阳镜|glasses|sunglasses|eyeglasses|eyewear)/i.test(text) && /(去掉|取掉|去除|移除|删除|不要|摘掉|remove|erase|delete|without)/i.test(text)
}

function textMentionsClothingChange(text: string) {
  return /(衣服|服装|外套|夹克|皮衣|风衣|衬衫|上衣|换衣|换一件|coat|jacket|trench|clothing|outfit|shirt)/i.test(text) && /(换|改|替换|变成|穿|replace|change|wear)/i.test(text)
}

type RecentImage = {
  path: string
  name: string
  mtimeMs: number
  size: number
  url: string
}

type CodexTaskResponse = {
  directory: string
  imagePath: string
  taskPath: string
  promptPath: string
  codexInstructionPath: string
  codexInstruction: string
  error?: string
}

type VideoProvider = 'kling' | 'volcengine' | 'wanxiang' | 'runway' | 'luma' | 'fal' | 'replicate'

type VideoTaskResponse = {
  status?: 'needs_config' | 'submitted'
  provider?: VideoProvider
  providerName?: string
  missingEnv?: string[]
  directory?: string
  imagePath?: string
  requestPath?: string
  providerRequestPath?: string
  providerResponsePath?: string
  providerTaskId?: string
  error?: string
}

const maxVideoImages = 5
const maxCanvasReferenceImages = 3
const defaultReferenceSlotSize = 64
const minReferenceSlotSize = 52
const maxReferenceSlotSize = 110
const imageGenerationSkills = [
  {
    id: 'strict-local-edit',
    labelZh: '严格局部修补',
    labelEn: 'Strict Local Edit',
    descriptionZh: '只改标注和提示词明确要求的位置，尽量保持其它区域不变。',
    descriptionEn: 'Only edit marked or explicitly requested areas, keeping everything else as unchanged as possible.',
    promptZh: '严格局部修补模式。以底图作为基础图，只修改用户明确要求的位置；未提到的区域、构图、光线、材质、镜头距离和整体质感尽量保持不变。',
    promptEn: 'Strict local inpainting mode. Use the source image as the base and only change explicitly requested areas; keep composition, lighting, material, camera distance, and overall quality unchanged elsewhere.',
  },
  {
    id: 'portrait-identity',
    labelZh: '人物一致性',
    labelEn: 'Portrait Identity',
    descriptionZh: '真人/人物改图优先保持同一身份、脸型和五官比例。',
    descriptionEn: 'For people, preserve identity, face shape, and facial proportions first.',
    promptZh: '人物一致性优先。必须保持同一人物身份、脸型轮廓、头型、下巴、颧骨、鼻型、嘴型、发际线、肤色、五官比例和表情；不要美化、不要换脸。',
    promptEn: 'Identity consistency first. Preserve the same person, face outline, head shape, jaw, cheekbones, nose, mouth, hairline, skin tone, facial proportions, and expression. Do not beautify or swap the face.',
  },
  {
    id: 'reference-fusion',
    labelZh: '参考图自然融合',
    labelEn: 'Reference Fusion',
    descriptionZh: '把参考图作为产品、物件、局部元素或风格参考自然融合。',
    descriptionEn: 'Blend reference images naturally as products, objects, local elements, or style references.',
    promptZh: '参考图只作为产品、物件、局部元素或风格参考。把参考图自然融合进底图场景，保持透视、光线、阴影、材质和景深一致；不要机械拼贴，不要替换主图主体。',
    promptEn: 'Use reference images only as products, objects, local elements, or style references. Blend them naturally into the source scene with matching perspective, lighting, shadow, material, and depth of field. Do not collage mechanically or replace the main subject.',
  },
  {
    id: 'style-reference',
    labelZh: '风格参考',
    labelEn: 'Style Reference',
    descriptionZh: '只借鉴参考图的色调、摄影、材质或设计风格。',
    descriptionEn: 'Use references for color, photography, material, or design style only.',
    promptZh: '参考图主要用于风格参考，只借鉴色调、材质质感、构图语言、摄影光线或设计风格。主体内容仍以底图和用户要求为准。',
    promptEn: 'Use references mainly for style: color, material feel, composition language, photographic lighting, or design style. Keep the source image and user request as the content source of truth.',
  },
  {
    id: 'product-commercial',
    labelZh: '商业产品图',
    labelEn: 'Commercial Product',
    descriptionZh: '适合电商、广告、产品融合，强调真实、干净、可展示。',
    descriptionEn: 'For ecommerce, advertising, and product fusion; clean, realistic, and presentable.',
    promptZh: '商业产品图模式。结果应干净、真实、可展示，产品或参考元素要有合理比例、接触阴影、材质细节和统一光线，整体像高质量商业摄影或电商广告图。',
    promptEn: 'Commercial product image mode. The result should be clean, realistic, and presentable, with proper product scale, contact shadows, material detail, and unified lighting like high-quality commercial photography or ecommerce advertising.',
  },
] as const
type ImageGenerationSkillId = (typeof imageGenerationSkills)[number]['id']

type ImageResizeCorner = 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

type VideoTaskStatus = 'needs_config' | 'submitted' | 'provider_error' | 'ready' | 'saved'

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

type VideoTaskActionResponse = {
  task?: VideoTaskSummary
  downloadsVideoPath?: string
  deletedId?: string
  error?: string
}

type VideoConfigField = {
  key: string
  label: string
  secret?: boolean
  placeholder?: string
  configured?: boolean
  value?: string
}

type VideoConfigProvider = {
  id: VideoProvider
  name: string
  fields: VideoConfigField[]
}

type VideoConfigResponse = {
  providers?: VideoConfigProvider[]
  error?: string
}

type ImageDimensions = {
  width: number
  height: number
}

type ZoomMode = 'fit' | 'manual'

type Annotation = {
  id: string
  kind: 'pin'
  x: number
  y: number
  text: string
  style?: AnnotationStyle
}

type TextAnnotation = {
  id: string
  kind: 'text'
  x: number
  y: number
  text: string
  style?: AnnotationStyle
}

type ArrowAnnotation = {
  id: string
  kind: 'arrow'
  x: number
  y: number
  x2: number
  y2: number
  text: string
  style?: AnnotationStyle
}

type CircleAnnotation = {
  id: string
  kind: 'circle'
  x: number
  y: number
  w: number
  h: number
  text: string
  style?: AnnotationStyle
}

type PenAnnotation = {
  id: string
  kind: 'pen'
  points: Array<{ x: number; y: number }>
  text: string
  style?: AnnotationStyle
}

type CanvasAnnotation = Annotation | TextAnnotation | ArrowAnnotation | CircleAnnotation | PenAnnotation
type CanvasTool = 'select' | 'pin' | 'text' | 'arrow' | 'circle' | 'pen'
type AnnotationSize = 's' | 'm' | 'l' | 'xl'
type AnnotationStyle = {
  color: string
  size: AnnotationSize
  boxWidth?: number
  fontSize?: number
}

type CanvasReference = {
  id: string
  label: string
  imageId?: string
}

function createCanvasReference(index: number): CanvasReference {
  return { id: `reference-${index + 1}`, label: `reference-${index + 1}` }
}

const colorOptions = ['#111827', '#6b7280', '#d946ef', '#8b5cf6', '#2563eb', '#0ea5e9', '#f59e0b', '#ea580c', '#059669', '#16a34a', '#f87171', '#dc2626']
const sizeOptions: AnnotationSize[] = ['s', 'm', 'l', 'xl']
const sizeLabel: Record<AnnotationSize, string> = {
  s: 'S',
  m: 'M',
  l: 'L',
  xl: 'XL',
}
const strokeWidth: Record<AnnotationSize, number> = {
  s: 0.45,
  m: 0.75,
  l: 1.05,
  xl: 1.4,
}
const annotationSizeMetrics: Record<AnnotationSize, { boxWidth: number; fontSize: number }> = {
  s: { boxWidth: 160, fontSize: 12 },
  m: { boxWidth: 190, fontSize: 14 },
  l: { boxWidth: 230, fontSize: 17 },
  xl: { boxWidth: 270, fontSize: 20 },
}
const minAnnotationBoxWidth = 120
const maxAnnotationBoxWidth = 560
const minAnnotationFontSize = 11
const maxAnnotationFontSize = 34

const toolButtons: Array<{ id: CanvasTool; label: string; icon: LucideIcon }> = [
  { id: 'select', label: '选择', icon: MousePointer2 },
  { id: 'pin', label: '编号标注', icon: MapPin },
  { id: 'arrow', label: '箭头', icon: ArrowUpRight },
  { id: 'pen', label: '画笔', icon: PencilLine },
  { id: 'text', label: '文字', icon: Type },
  { id: 'circle', label: '圆圈', icon: CircleIcon },
]

const annotationKindLabels: Record<CanvasAnnotation['kind'], string> = {
  pin: '编号意见',
  text: '文字',
  arrow: '箭头',
  circle: '圆圈',
  pen: '画笔',
}
const annotationKindLabelsEn: Record<CanvasAnnotation['kind'], string> = {
  pin: 'pin note',
  text: 'text',
  arrow: 'arrow',
  circle: 'circle',
  pen: 'pen',
}

function getAnnotationKindLabel(kind: CanvasAnnotation['kind'], language: Language) {
  return language === 'en' ? annotationKindLabelsEn[kind] : annotationKindLabels[kind]
}

function getReferenceLabel(index: number, language: Language) {
  return language === 'en' ? `Reference ${index + 1}` : `素材 ${index + 1}`
}

const imageSourceLabels: Record<GeneratedImage['source'], string> = {
  uploaded: '上传图片',
  url: '图片链接',
  recent: '最近图片',
}

const videoProviders: Array<{ id: VideoProvider; labelZh: string; labelEn: string; noteZh: string; noteEn: string }> = [
  { id: 'kling', labelZh: '可灵', labelEn: 'Kling', noteZh: '图生视频', noteEn: 'Image to video' },
  { id: 'volcengine', labelZh: '火山', labelEn: 'Volcano', noteZh: 'Seedance', noteEn: 'Seedance' },
  { id: 'wanxiang', labelZh: '阿里万象', labelEn: 'Wanxiang', noteZh: 'Wan', noteEn: 'Wan' },
  { id: 'runway', labelZh: 'Runway', labelEn: 'Runway', noteZh: 'Gen-4/Gen-3 图生视频', noteEn: 'Gen-4/Gen-3 image to video' },
  { id: 'luma', labelZh: 'Luma', labelEn: 'Luma', noteZh: 'Dream Machine', noteEn: 'Dream Machine' },
  { id: 'fal', labelZh: 'fal.ai', labelEn: 'fal.ai', noteZh: '可配置模型队列', noteEn: 'Configurable model queue' },
  { id: 'replicate', labelZh: 'Replicate', labelEn: 'Replicate', noteZh: '自选模型版本', noteEn: 'Custom model version' },
]

const videoDurationOptions = Array.from({ length: 12 }, (_, index) => String(index + 4))
const minCanvasScale = 0.25
const maxCanvasScale = 5
const imageResizeCorners: ImageResizeCorner[] = ['top-left', 'top-right', 'bottom-left', 'bottom-right']

function clampCanvasScale(value: number) {
  return Math.min(maxCanvasScale, Math.max(minCanvasScale, Number(value.toFixed(2))))
}

function clampReferenceSlotSize(value: number) {
  return Math.min(maxReferenceSlotSize, Math.max(minReferenceSlotSize, Math.round(value)))
}

function clampAnnotationBoxWidth(value: number) {
  return Math.min(maxAnnotationBoxWidth, Math.max(minAnnotationBoxWidth, Math.round(value)))
}

function clampAnnotationFontSize(value: number) {
  return Math.min(maxAnnotationFontSize, Math.max(minAnnotationFontSize, Number(value.toFixed(1))))
}

const videoProviderNameFallbacks: Array<{ pattern: RegExp; provider: VideoProvider }> = [
  { pattern: /可灵|kling/i, provider: 'kling' },
  { pattern: /火山|volcano|volcengine|seedance/i, provider: 'volcengine' },
  { pattern: /阿里|万象|wanxiang|dashscope/i, provider: 'wanxiang' },
  { pattern: /runway/i, provider: 'runway' },
  { pattern: /luma/i, provider: 'luma' },
  { pattern: /fal/i, provider: 'fal' },
  { pattern: /replicate/i, provider: 'replicate' },
]

function getVideoProviderText(provider: VideoProvider | undefined, language: Language, fallback?: string) {
  const matchedProvider = provider ?? videoProviderNameFallbacks.find((item) => fallback && item.pattern.test(fallback))?.provider
  const info = videoProviders.find((item) => item.id === matchedProvider)
  if (info) return language === 'en' ? info.labelEn : info.labelZh
  return fallback
}

function formatDurationText(duration: number | string | undefined, language: Language) {
  if (!duration) return null
  return language === 'en' ? `${duration}s` : `${duration}秒`
}

function getVideoStatusText(statusValue: VideoTaskStatus, language: Language) {
  const labels: Record<VideoTaskStatus, { zh: string; en: string }> = {
    needs_config: { zh: '待填 API', en: 'Needs API' },
    submitted: { zh: '生成中', en: 'Generating' },
    provider_error: { zh: '平台失败', en: 'Provider Error' },
    ready: { zh: '可查看', en: 'Ready' },
    saved: { zh: '已保存', en: 'Saved' },
  }
  return language === 'en' ? labels[statusValue].en : labels[statusValue].zh
}

function getAnnotationAnchor(annotation: CanvasAnnotation) {
  if (annotation.kind === 'arrow') return { x: annotation.x2, y: annotation.y2 }
  if (annotation.kind === 'circle') return { x: annotation.x + annotation.w, y: annotation.y }
  if (annotation.kind === 'pen') return annotation.points.at(-1) ?? annotation.points[0] ?? { x: 50, y: 50 }
  return { x: annotation.x, y: annotation.y }
}

function getStrictImageEditGuidance(language: Language, annotations: CanvasAnnotation[], hasReferences: boolean) {
  const notes = annotations.map((annotation) => annotation.text).join('\n')
  const lines =
    language === 'en'
      ? [
          'Strict local inpainting mode, not full-image regeneration.',
          'Identity consistency is the highest priority. The edited person must stay at least 95% similar to the original person. If identity conflicts with another edit, preserve identity and reduce the edit scope.',
          'Use the original image as the base. Only edit the marked areas and explicit extra-note targets; keep unmarked areas as close to pixel-identical as possible.',
          'Lock the subject position, crop, camera distance, lighting, background, clothing, hairstyle, material texture, noise, and overall photographic quality.',
          'For portraits, preserve the exact same identity, face outline, head shape, jaw, cheekbones, nose shape, mouth shape, ears, hairline, skin tone, facial proportions, and expression. Do not beautify or replace the face.',
          'Do not regenerate the full head or face. Outside the explicitly marked facial target, keep the visible face from the original image, including face width, face length, cheek volume, eye spacing, nose width, mouth corners, and asymmetry.',
          'Self-check before delivery: if the face shape or person similarity feels below 95%, the result is invalid. Reduce the mask and redo a more local edit.',
        ]
      : [
          '严格局部修补模式，不是整图重绘。',
          '人物一致性是最高优先级；改图后人物必须和原人物至少达到 95% 以上相似度。如果人物一致性和其它改动冲突，优先保留原人物，只缩小改动范围。',
          '以原图作为底图，只修改画布标注位置和补充说明明确要求的区域；未标注区域尽量像素级保持不变。',
          '锁定主体位置、原始裁切、镜头距离、光线、背景、服装、发型、材质纹理、噪点和整体摄影质感。',
          '如果画面中有人，必须保持同一人物身份、脸型轮廓、头型、下巴、颧骨、鼻型、嘴型、耳朵、发际线、肤色、五官比例和表情；不要美化、不要换脸。',
          '不要重绘整个头部或整张脸。除明确标注的脸部目标外，可见脸部必须沿用原图，包括脸宽、脸长、脸颊肉感、眼距、鼻翼宽度、嘴角和左右不对称特征。',
          '交付前自检：如果脸型或人物相似度达不到 95% 以上，结果无效，必须缩小遮罩重新做更局部的编辑。',
        ]

  if (textMentionsEyewearRemoval(notes)) {
    lines.push(
      language === 'en'
        ? 'Eyewear removal rule: only remove the lenses and frame. Reconstruct only the hidden eyes, eyelids, eyebrows, nose-bridge shadows, and skin texture inside the eyewear footprint. Keep all visible face areas outside the glasses copied from the original image.'
        : '眼镜/墨镜移除规则：只移除镜片和镜框。只在眼镜覆盖范围内补出被遮挡的眼睛、眼皮、眉毛、鼻梁阴影和皮肤纹理；眼镜范围外的可见脸部必须沿用原图。',
    )
  }

  if (textMentionsClothingChange(notes)) {
    lines.push(
      language === 'en'
        ? 'Clothing change rule: replace only the original clothing/shoulder area. Do not move or redraw the head, face, neck position, hair, ears, or background while changing clothing.'
        : '换衣服规则：只替换原衣服和肩膀覆盖区域；换衣服时不要移动或重绘头部、脸、脖子位置、头发、耳朵或背景。',
    )
  }

  if (hasReferences) {
    lines.push(
      language === 'en'
        ? 'Reference images may guide products, objects, local elements, or style only. Blend them naturally into the original scene without replacing the main subject or making a mechanical collage.'
        : '参考素材只能作为产品、物件、局部元素或风格参考自然融合；不要替换主图主体，不要机械拼贴。',
    )
  }

  return lines.map((line) => `- ${line}`).join('\n')
}

function getCanvasPoint(event: ReactPointerEvent<HTMLDivElement>) {
  const bounds = event.currentTarget.getBoundingClientRect()
  return {
    x: ((event.clientX - bounds.left) / bounds.width) * 100,
    y: ((event.clientY - bounds.top) / bounds.height) * 100,
  }
}

function getAnnotationStyle(annotation: CanvasAnnotation) {
  return annotation.style ?? { color: '#df2020', size: 'm' as AnnotationSize }
}

function getAnnotationMetrics(style: AnnotationStyle) {
  const base = annotationSizeMetrics[style.size]
  return {
    boxWidth: style.boxWidth ?? base.boxWidth,
    fontSize: style.fontSize ?? base.fontSize,
  }
}

function isAnnotationControlTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('input, button, .annotation-control'))
}

function toLocalImageUrl(source: string) {
  const trimmed = source.trim()
  if (trimmed.startsWith('/api/local-image?')) return trimmed

  if (trimmed.startsWith('file://')) {
    try {
      return `/api/local-image?path=${encodeURIComponent(new URL(trimmed).pathname)}`
    } catch {
      return null
    }
  }

  if (/^\/(Users|var|private|tmp|Volumes)\//.test(trimmed)) {
    return `/api/local-image?path=${encodeURIComponent(trimmed)}`
  }

  return null
}

function toLocalImagePath(source: string) {
  const trimmed = source.trim()
  if (trimmed.startsWith('file://')) {
    try {
      return new URL(trimmed).pathname
    } catch {
      return null
    }
  }

  if (/^\/(Users|var|private|tmp|Volumes)\//.test(trimmed)) return trimmed
  return null
}

function extractImageLikeSources(value: string) {
  const sources = [value]
  const htmlMatch = value.match(/<img[^>]+src=["']([^"']+)["']/i)
  if (htmlMatch?.[1]) sources.push(htmlMatch[1])
  const markdownMatch = value.match(/!\[[^\]]*]\(([^)]+)\)/)
  if (markdownMatch?.[1]) sources.push(markdownMatch[1])
  return sources
}

function isReferenceSlotEventTarget(target: EventTarget | null) {
  return target instanceof Element && Boolean(target.closest('.reference-slot'))
}

function blobToDataUrl(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error ?? new Error('Could not read image'))
    reader.readAsDataURL(blob)
  })
}

function formatTaskTime(value: string | undefined, language: Language) {
  if (!value) return language === 'en' ? 'Unknown time' : '未知时间'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return language === 'en' ? 'Unknown time' : '未知时间'
  return date.toLocaleString(language === 'en' ? 'en-US' : 'zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function formatElapsedTime(value: string | undefined, now: number, language: Language) {
  if (!value || now <= 0) return language === 'en' ? 'Timing...' : '计时中'
  const startedAt = new Date(value).getTime()
  if (Number.isNaN(startedAt)) return language === 'en' ? 'Timing...' : '计时中'
  const totalSeconds = Math.max(0, Math.floor((now - startedAt) / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    return language === 'en' ? `${hours}h ${minutes % 60}m` : `${hours}小时${minutes % 60}分`
  }
  if (language === 'en') return minutes > 0 ? `${minutes}m ${seconds}s` : `${seconds}s`
  return minutes > 0 ? `${minutes}分${seconds}秒` : `${seconds}秒`
}

function getVideoPreviewUrl(task: VideoTaskSummary) {
  return task.localVideoUrl ?? task.videoUrl
}

function getVideoTaskDetailText(task: VideoTaskSummary, language: Language) {
  return [getVideoProviderText(task.provider, language, task.providerName), formatDurationText(task.duration, language), task.aspectRatio, task.resolution]
    .filter(Boolean)
    .join(' · ')
}

function getVideoConfigFieldLabel(field: VideoConfigField, language: Language) {
  const labels: Record<string, { zh: string; en: string }> = {
    KLING_VIDEO_MODEL: { zh: '模型', en: 'Model' },
    KLING_BASE_URL: { zh: '接口地址', en: 'Base URL' },
    ARK_VIDEO_MODEL: { zh: '视频模型', en: 'Video Model' },
    ARK_VIDEO_ENDPOINT: { zh: '接口地址', en: 'Endpoint' },
    DASHSCOPE_VIDEO_MODEL: { zh: '模型', en: 'Model' },
    DASHSCOPE_VIDEO_ENDPOINT: { zh: '接口地址', en: 'Endpoint' },
    RUNWAY_VIDEO_MODEL: { zh: '模型', en: 'Model' },
    RUNWAY_API_VERSION: { zh: 'API 版本', en: 'API Version' },
    RUNWAY_VIDEO_ENDPOINT: { zh: '接口地址', en: 'Endpoint' },
    LUMA_VIDEO_MODEL: { zh: '模型', en: 'Model' },
    LUMA_VIDEO_ENDPOINT: { zh: '接口地址', en: 'Endpoint' },
    FAL_VIDEO_MODEL: { zh: '模型路径', en: 'Model Path' },
    FAL_VIDEO_ENDPOINT: { zh: '接口地址', en: 'Endpoint' },
    FAL_IMAGE_MODEL: { zh: '图片模型路径', en: 'Image Model Path' },
    FAL_IMAGE_ENDPOINT: { zh: '图片接口地址', en: 'Image Endpoint' },
    DASHSCOPE_IMAGE_MODEL: { zh: '图片模型', en: 'Image Model' },
    DASHSCOPE_IMAGE_ENDPOINT: { zh: '图片接口地址', en: 'Image Endpoint' },
    ARK_IMAGE_MODEL: { zh: '图片模型', en: 'Image Model' },
    ARK_IMAGE_ENDPOINT: { zh: '图片接口地址', en: 'Image Endpoint' },
    KLING_IMAGE_MODEL: { zh: '图片模型', en: 'Image Model' },
    KLING_IMAGE_ENDPOINT: { zh: '图片接口地址', en: 'Image Endpoint' },
    REPLICATE_VIDEO_VERSION: { zh: '模型版本', en: 'Model Version' },
    REPLICATE_VIDEO_ENDPOINT: { zh: '接口地址', en: 'Endpoint' },
  }
  const localized = labels[field.key]
  if (localized) return language === 'en' ? localized.en : localized.zh
  return field.label
}

function localizeKnownMessage(message: string, language: Language) {
  if (language !== 'en') return message

  const exact: Record<string, string> = {
    读取视频结果失败: 'Could not read video results',
    查询视频结果失败: 'Could not check video result',
    保存视频失败: 'Could not save video',
    保存本地视频失败: 'Could not save the local video',
    保存到下载目录失败: 'Could not save to Downloads',
    删除视频任务失败: 'Could not delete video task',
    读取API设置失败: 'Could not read API settings',
    '读取 API 设置失败': 'Could not read API settings',
    '保存 API 设置失败': 'Could not save API settings',
    '读取图片 API 设置失败': 'Could not read image API settings',
    '保存图片 API 设置失败': 'Could not save image API settings',
    '创建图片任务失败': 'Could not create the image task',
    还没有读到这个平台的设置项: 'No settings were found for this provider yet',
    还没有读到这个图片平台的设置项: 'No settings were found for this image provider yet',
    找不到这个视频任务: 'Video task not found',
    读不到这个视频任务: 'Could not read this video task',
    '这个任务还没有平台任务 ID': 'This task does not have a provider task ID yet',
    '缺少 DASHSCOPE_API_KEY，不能查询阿里万象任务': 'Missing DASHSCOPE_API_KEY, so the Wanxiang task cannot be checked',
    平台结果已更新但本地摘要读取失败: 'Provider result was updated, but the local summary could not be read',
    '平台结果已更新，但本地摘要读取失败': 'Provider result was updated, but the local summary could not be read',
    平台还没有返回可下载的视频地址: 'The provider has not returned a downloadable video URL yet',
    平台视频文件为空: 'The provider video file is empty',
    视频已保存但本地摘要读取失败: 'Video was saved, but the local summary could not be read',
    '视频已保存，但本地摘要读取失败': 'Video was saved, but the local summary could not be read',
    '还没有本地视频文件，请先点“保存到本地”': 'There is no local video file yet. Click Save Locally first.',
    创建视频任务失败: 'Could not create the video task',
    读不到当前原图: 'Could not read the current source image',
    当前文件不是图片: 'The current file is not an image',
    '保存 Codex 任务失败': 'Could not save the Codex task',
    可以先从最近生成里点一张作为视频首帧: 'Pick a recent generated image first to use as the first frame.',
    '可以先从最近生成里点一张，作为视频首帧': 'Pick a recent generated image first to use as the first frame.',
    '可以先从最近 Codex 图片里点一张，作为视频首帧': 'Pick a recent generated image first to use as the first frame.',
  }

  if (exact[message]) return exact[message]

  return message
    .replace(/可灵/g, 'Kling')
    .replace(/火山方舟|火山/g, 'Volcano')
    .replace(/阿里万象|阿里/g, 'Wanxiang')
    .replace(/视频平台密钥/g, 'video provider key')
    .replace(/视频平台/g, 'video provider')
    .replace(/图片平台密钥/g, 'image provider key')
    .replace(/图片平台/g, 'image provider')
    .replace(/任务目录：/g, 'Task folder: ')
    .replace(/任务 ID：/g, 'Task ID: ')
    .replace(/平台状态：/g, 'Provider status: ')
    .replace(/缺少 API：/g, 'Missing API: ')
    .replace(/缺少 /g, 'Missing ')
    .replace(/下载平台视频失败：/g, 'Failed to download provider video: ')
    .replace(/读不到参考素材：/g, 'Could not read reference image: ')
    .replace(/参考素材不是图片：/g, 'Reference is not an image: ')
    .replace(/读不到图片：/g, 'Could not read image: ')
    .replace(/不是图片：/g, 'Not an image: ')
    .replace(/返回 /g, ' returned ')
}

function getDisplayPromptText(prompt: string, language: Language) {
  if (language !== 'en') return prompt

  const singleImagePrefix = '以这张图片作为首帧，生成自然、有镜头运动的视频：'
  if (prompt.startsWith(singleImagePrefix)) {
    return `Use this image as the first frame to generate a natural video with camera movement: ${prompt.slice(singleImagePrefix.length)}`
  }

  const multiImageMatch = prompt.match(/^以这 (\d+) 张图片作为首帧和参考图，生成自然、有镜头运动的视频：(.*)$/s)
  if (multiImageMatch?.[1]) {
    return `Use these ${multiImageMatch[1]} images as the first frame and references to generate a natural video with camera movement: ${multiImageMatch[2]?.trim() ?? ''}`
  }

  return prompt
}

function getDisplayProviderError(error: string | undefined, language: Language) {
  if (!error) return ''

  if (/input image may contain real person/i.test(error)) {
    return language === 'en'
      ? 'The provider rejected this request because the input image may contain a real person.'
      : '平台拒绝了这次请求，因为输入图片可能包含真人。'
  }

  if (/not activated the model|ModelNotOpen/i.test(error)) {
    const model = error.match(/model\s+([A-Za-z0-9._-]+)/i)?.[1]
    return language === 'en'
      ? `This Ark account has not activated ${model ?? 'this model'}. Activate it in the Ark Console or choose an activated model.`
      : `这个火山账号还没有开通 ${model ?? '这个模型'}。请在火山方舟控制台开通，或改用已开通的模型。`
  }

  return error
}

function isVideoTaskGenerating(task: VideoTaskSummary) {
  return task.status === 'submitted' && !getVideoPreviewUrl(task)
}

function VideoTaskMedia({ task, className = '' }: { task: VideoTaskSummary; className?: string }) {
  const previewUrl = getVideoPreviewUrl(task)
  if (previewUrl) return <video className={className} controls preload="metadata" src={previewUrl} />
  if (task.sourceImageUrl) return <img className={className} src={task.sourceImageUrl} alt={task.title} />
  return (
    <div className={`video-placeholder ${className}`}>
      <Video size={className.includes('hero') ? 32 : 20} />
    </div>
  )
}

function App() {
  const [language, setLanguage] = useState<Language>(() => readInitialLanguage())
  const tr = useCallback((zh: string, en: string) => (language === 'en' ? en : zh), [language])
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const referenceFileInputRef = useRef<HTMLInputElement | null>(null)
  const pendingReferenceSlotRef = useRef<number | null>(null)
  const workbenchRef = useRef<HTMLDivElement | null>(null)
  const canvasStageRef = useRef<HTMLDivElement | null>(null)
  const toolboxRef = useRef<HTMLDivElement | null>(null)
  const [images, setImages] = useState<GeneratedImage[]>([])
  const [activeImageId, setActiveImageId] = useState<string | null>(null)
  const [annotationMap, setAnnotationMap] = useState<Record<string, CanvasAnnotation[]>>({})
  const [imageDimensions, setImageDimensions] = useState<Record<string, ImageDimensions>>({})
  const [canvasScale, setCanvasScale] = useState(1)
  const [zoomMode, setZoomMode] = useState<ZoomMode>('fit')
  const [activeTool, setActiveTool] = useState<CanvasTool>('pin')
  const [draftShape, setDraftShape] = useState<ArrowAnnotation | CircleAnnotation | PenAnnotation | null>(null)
  const [annotationStyle, setAnnotationStyle] = useState<AnnotationStyle>({ color: '#dc2626', size: 'm' })
  const [isStylePanelOpen, setIsStylePanelOpen] = useState(false)
  const [isImageScaleDragging, setIsImageScaleDragging] = useState(false)
  const [referenceSlotCount, setReferenceSlotCount] = useState(0)
  const [canvasReferences, setCanvasReferences] = useState<CanvasReference[]>(
    () => Array.from({ length: maxCanvasReferenceImages }, (_, index) => createCanvasReference(index)),
  )
  const [referenceSlotSizes, setReferenceSlotSizes] = useState<number[]>(() => Array.from({ length: maxCanvasReferenceImages }, () => defaultReferenceSlotSize))
  const [imageSkillId, setImageSkillId] = useState<ImageGenerationSkillId>('strict-local-edit')
  const [prompt, setPrompt] = useState('')
  const [imageNegativePrompt, setImageNegativePrompt] = useState('')
  const [panelWidth, setPanelWidth] = useState(380)
  const [status, setStatus] = useState(() => getDefaultStatus(readInitialLanguage()))
  const [isWindowDragging, setIsWindowDragging] = useState(false)
  const [dragHint, setDragHint] = useState(() => getDragHintDefault(readInitialLanguage()))
  const [recentImages, setRecentImages] = useState<RecentImage[]>([])
  const [isRecentOpen, setIsRecentOpen] = useState(false)
  const [isRecentLoading, setIsRecentLoading] = useState(false)
  const [downloadImages, setDownloadImages] = useState<RecentImage[]>([])
  const [isDownloadsOpen, setIsDownloadsOpen] = useState(false)
  const [isDownloadsLoading, setIsDownloadsLoading] = useState(false)
  const [isVideoPanelOpen, setIsVideoPanelOpen] = useState(() => readInitialVideoPanelOpen())
  const [videoProvider, setVideoProvider] = useState<VideoProvider>('kling')
  const [videoPrompt, setVideoPrompt] = useState('')
  const [videoNegativePrompt, setVideoNegativePrompt] = useState('')
  const [videoDuration, setVideoDuration] = useState('4')
  const [videoAspectRatio, setVideoAspectRatio] = useState('16:9')
  const [videoResolution, setVideoResolution] = useState('720P')
  const [videoImageIds, setVideoImageIds] = useState<string[]>([])
  const [isVideoSubmitting, setIsVideoSubmitting] = useState(false)
  const [videoTaskMessage, setVideoTaskMessage] = useState('')
  const [videoTasks, setVideoTasks] = useState<VideoTaskSummary[]>([])
  const [activeVideoTaskId, setActiveVideoTaskId] = useState<string | null>(null)
  const [isVideoTasksLoading, setIsVideoTasksLoading] = useState(false)
  const [isVideoTaskRefreshing, setIsVideoTaskRefreshing] = useState(false)
  const [isVideoDownloading, setIsVideoDownloading] = useState(false)
  const [isSavingVideoToDownloads, setIsSavingVideoToDownloads] = useState(false)
  const [deletingVideoTaskId, setDeletingVideoTaskId] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(0)
  const [isApiSettingsOpen, setIsApiSettingsOpen] = useState(false)
  const [isApiConfigLoading, setIsApiConfigLoading] = useState(false)
  const [isApiConfigSaving, setIsApiConfigSaving] = useState(false)
  const [videoConfigProviders, setVideoConfigProviders] = useState<VideoConfigProvider[]>([])
  const [videoConfigValues, setVideoConfigValues] = useState<Record<string, string>>({})
  const [videoConfigMessage, setVideoConfigMessage] = useState('')

  useEffect(() => {
    window.localStorage.setItem('cowart-canvas-language', language)
    document.documentElement.lang = language === 'en' ? 'en' : 'zh-CN'
  }, [language])

  const activeImage = images.find((image) => image.id === activeImageId) ?? null
  const hasReferenceCanvas = referenceSlotCount > 0
  const visibleCanvasReferences = useMemo(() => canvasReferences.slice(0, referenceSlotCount), [canvasReferences, referenceSlotCount])
  const displayStatus = useMemo(() => {
    const defaultStatuses = [getDefaultStatus('zh'), getDefaultStatus('en')]
    const videoFirstFrameStatuses = [
      '可以先从最近 Codex 图片里点一张，作为视频首帧',
      '可以先从最近生成里点一张，作为视频首帧',
      'Pick a recent Codex image first to use as the first frame.',
      'Pick a recent generated image first to use as the first frame.',
    ]

    if (videoFirstFrameStatuses.includes(status)) {
      return isVideoPanelOpen && !activeImage ? tr('可以先从最近生成里点一张，作为视频首帧', 'Pick a recent generated image first to use as the first frame.') : localizeKnownMessage(status, language)
    }
    if (defaultStatuses.includes(status)) {
      return isVideoPanelOpen && !activeImage ? tr('可以先从最近生成里点一张，作为视频首帧', 'Pick a recent generated image first to use as the first frame.') : getDefaultStatus(language)
    }
    return localizeKnownMessage(status, language)
  }, [activeImage, isVideoPanelOpen, language, status, tr])
  const displayVideoTaskMessage = useMemo(() => videoTaskMessage.split('\n').map((line) => localizeKnownMessage(line, language)).join('\n'), [language, videoTaskMessage])
  const displayVideoConfigMessage = useMemo(() => localizeKnownMessage(videoConfigMessage, language), [language, videoConfigMessage])

  const filledCanvasReferences = useMemo(
    () =>
      visibleCanvasReferences.flatMap((reference, index) => {
        const image = reference.imageId ? images.find((item) => item.id === reference.imageId) : undefined
        return image ? [{ reference, index, image }] : []
      }),
    [images, visibleCanvasReferences],
  )
  const selectedVideoImages = useMemo(
    () => videoImageIds.map((id) => images.find((image) => image.id === id)).filter((image): image is GeneratedImage => Boolean(image)),
    [images, videoImageIds],
  )
  const activeImageKey = activeImage?.id ?? ''
  const activeDimensions = activeImageKey ? imageDimensions[activeImageKey] : undefined
  const annotations = useMemo(() => (activeImageKey ? (annotationMap[activeImageKey] ?? []) : []), [activeImageKey, annotationMap])
  const canvasZoomLabel = `${Math.round(canvasScale * 100)}%`
  const selectedVideoConfig = videoConfigProviders.find((provider) => provider.id === videoProvider)
  const imageCanvasStyle = activeDimensions
    ? ({
        width: `${Math.max(1, Math.round(activeDimensions.width * canvasScale))}px`,
        '--canvas-scale': canvasScale,
      } as CSSProperties)
    : ({ '--canvas-scale': canvasScale } as CSSProperties)
  const referenceSlotsStyle = activeDimensions
    ? ({
        width: `${Math.max(260, Math.round(activeDimensions.width * canvasScale))}px`,
      } as CSSProperties)
    : undefined

  const addVideoImages = useCallback((imageIds: string[]) => {
    setVideoImageIds((current) => {
      const next = [...current]
      for (const imageId of imageIds) {
        if (!next.includes(imageId) && next.length < maxVideoImages) next.push(imageId)
      }
      return next
    })
  }, [])

  const removeVideoImage = useCallback((imageId: string) => {
    setVideoImageIds((current) => current.filter((id) => id !== imageId))
  }, [])

  const addReferenceCanvasSlot = useCallback(() => {
    setReferenceSlotCount((current) => {
      if (current >= maxCanvasReferenceImages) {
        setStatus(tr(`最多先放 ${maxCanvasReferenceImages} 张参考图`, `You can add up to ${maxCanvasReferenceImages} reference images for now.`))
        return current
      }
      const next = current + 1
      setStatus(tr(`已增加第 ${next} 个参考图位，可放入任意产品、物件或风格参考图`, `Added reference slot ${next}. Drop any product, object, or style reference there.`))
      return next
    })
  }, [tr])

  const fillCanvasReferenceSlots = useCallback((imageIds: string[], targetSlotIndex?: number) => {
    const next = canvasReferences.map((reference) => ({ ...reference }))
    let nextSlotIndex =
      typeof targetSlotIndex === 'number'
        ? Math.min(Math.max(targetSlotIndex, 0), next.length - 1)
        : next.findIndex((reference, index) => index < referenceSlotCount && !reference.imageId)
    let highestSlotIndex = -1

    for (const imageId of imageIds) {
      const duplicateIndex = next.findIndex((reference) => reference.imageId === imageId)
      if (duplicateIndex >= 0 && typeof targetSlotIndex !== 'number') continue
      if (nextSlotIndex < 0) nextSlotIndex = Math.min(referenceSlotCount, next.length - 1)
      next[nextSlotIndex] = { ...next[nextSlotIndex], imageId }
      highestSlotIndex = Math.max(highestSlotIndex, nextSlotIndex)
      nextSlotIndex = next.findIndex((reference, index) => index > nextSlotIndex && index < maxCanvasReferenceImages && !reference.imageId)
    }

    if (highestSlotIndex >= 0) {
      setCanvasReferences(next)
      setReferenceSlotCount((current) => Math.min(maxCanvasReferenceImages, Math.max(current, highestSlotIndex + 1)))
    }
  }, [canvasReferences, referenceSlotCount])

  const addCanvasReferenceImage = useCallback(
    (imageId: string, targetSlotIndex?: number) => {
      const image = images.find((item) => item.id === imageId)
      if (!image) {
        setStatus(tr('没有找到这张素材图，重新导入一次', 'Could not find that reference image. Import it again.'))
        return
      }
      fillCanvasReferenceSlots([imageId], targetSlotIndex)
      setStatus(tr(`已把「${image.title}」放入下方参考素材槽`, `"${image.title}" was added to a reference slot below.`))
    },
    [fillCanvasReferenceSlots, images, tr],
  )

  const addReferenceFiles = useCallback(
    (files: File[], targetSlotIndex?: number) => {
      const imageFiles = files.filter((file) => file.type.startsWith('image/'))
      if (imageFiles.length === 0) {
        setStatus(tr('没有读到素材图片文件', 'No reference image files were found.'))
        return
      }

      const imported = imageFiles.slice(0, maxCanvasReferenceImages).map((file, index) => ({
        id: `reference-uploaded-${Date.now()}-${index}-${file.name}`,
        title: file.name.replace(/\.[^.]+$/, '') || tr('素材图片', 'Reference image'),
        src: URL.createObjectURL(file),
        prompt: tr(`用户导入参考素材：${file.name}`, `User imported reference image: ${file.name}`),
        source: 'uploaded' as const,
      }))

      setImages((items) => [...imported, ...items])
      fillCanvasReferenceSlots(imported.map((image) => image.id), targetSlotIndex)
      setStatus(tr(`已导入 ${imported.length} 张参考素材，可和主图融合生成`, `Imported ${imported.length} reference image${imported.length > 1 ? 's' : ''}. They can be blended with the main image.`))
    },
    [fillCanvasReferenceSlots, tr],
  )

  const openReferenceFilePicker = (slotIndex: number) => {
    pendingReferenceSlotRef.current = slotIndex
    referenceFileInputRef.current?.click()
  }

  const addImportedFiles = useCallback((files: File[]) => {
    const imported = files.map((file) => ({
      id: `uploaded-${Date.now()}-${file.name}`,
      title: file.name.replace(/\.[^.]+$/, '') || tr('粘贴图片', 'Pasted image'),
      src: URL.createObjectURL(file),
      prompt: tr(`用户导入图片：${file.name}`, `User imported image: ${file.name}`),
      source: 'uploaded' as const,
    }))

    setImages((items) => [...imported, ...items])
    if (!isVideoPanelOpen && hasReferenceCanvas && activeImageId) {
      fillCanvasReferenceSlots(imported.map((image) => image.id))
      setStatus(tr(`已导入 ${imported.length} 张图片，并放入下方参考素材槽`, `Imported ${imported.length} image${imported.length > 1 ? 's' : ''} and added them to the reference slots below.`))
      return
    }
    setActiveImageId(imported[0].id)
    if (isVideoPanelOpen) addVideoImages(imported.map((image) => image.id))
    setZoomMode('fit')
    setStatus(isVideoPanelOpen ? tr(`已导入 ${imported.length} 张图片，并加入视频参考图`, `Imported ${imported.length} image${imported.length > 1 ? 's' : ''} and added them to video references.`) : tr(`已导入 ${imported.length} 张图片，可以直接在画布上标注`, `Imported ${imported.length} image${imported.length > 1 ? 's' : ''}. You can mark them on the canvas now.`))
  }, [activeImageId, addVideoImages, fillCanvasReferenceSlots, hasReferenceCanvas, isVideoPanelOpen, tr])

  const editPrompt = useMemo(() => {
    if (!activeImage) return ''
    const selectedSkill = imageGenerationSkills.find((skill) => skill.id === imageSkillId) ?? imageGenerationSkills[0]
    const skillText = tr(
      `生成策略：${selectedSkill.labelZh}\n策略要求：${selectedSkill.promptZh}`,
      `Generation strategy: ${selectedSkill.labelEn}\nStrategy requirement: ${selectedSkill.promptEn}`,
    )
    const referenceNotes = filledCanvasReferences
      .map((item, index) => tr(`${index + 1}. ${getReferenceLabel(item.index, 'zh')}：${item.image.title}`, `${index + 1}. ${getReferenceLabel(item.index, 'en')}: ${item.image.title}`))
      .join('\n')
    const extra = prompt.trim() ? tr(`\n补充说明：${prompt.trim()}`, `\nExtra notes: ${prompt.trim()}`) : ''
    const negative = imageNegativePrompt.trim() ? tr(`\n反向提示词：${imageNegativePrompt.trim()}`, `\nNegative prompt: ${imageNegativePrompt.trim()}`) : ''
    if (annotations.length === 0 && filledCanvasReferences.length === 0) {
      return tr(`请基于这张图片继续改图：${activeImage.title}\n${skillText}\n还没有画布标注。${extra}${negative}`, `Continue editing this image: ${activeImage.title}\n${skillText}\nNo canvas annotations yet.${extra}${negative}`)
    }
    const notes = annotations
      .map((item, index) => {
        const anchor = getAnnotationAnchor(item)
        const kindLabel = getAnnotationKindLabel(item.kind, language)
        const note = item.text.trim() || tr(`按${annotationKindLabels[item.kind]}标注的位置修改`, `Edit the area marked by the ${annotationKindLabelsEn[item.kind]}.`)
        return tr(
          `${index + 1}. ${kindLabel}，图片约 ${Math.round(anchor.x)}%, ${Math.round(anchor.y)}% 位置：${note}`,
          `${index + 1}. ${kindLabel}, around ${Math.round(anchor.x)}%, ${Math.round(anchor.y)}% of the image: ${note}`,
        )
      })
      .join('\n')
    const referenceText =
      filledCanvasReferences.length > 0
        ? tr(
            `\n下方参考素材：\n${referenceNotes}\n请把这些素材作为任意产品、物件、局部元素或风格参考，自然融合进最终图片，不要机械拼贴。`,
            `\nReference materials below:\n${referenceNotes}\nUse these materials as products, objects, local elements, or style references. Blend them naturally into the final image instead of making a mechanical collage.`,
          )
        : ''
    const annotationText = notes ? tr(`\n画布标注：\n${notes}`, `\nCanvas annotations:\n${notes}`) : tr('\n没有额外标注，主要根据下方参考素材完成融合。', '\nNo extra annotations. Mainly use the reference materials below for blending.')
    const strictEditGuidance = getStrictImageEditGuidance(language, annotations, filledCanvasReferences.length > 0)
    const parameterText = tr(`\n改图参数：\n${strictEditGuidance}`, `\nEdit parameters:\n${strictEditGuidance}`)
    return tr(
      `请基于这张主图继续改图：${activeImage.title}\n保持主图主体、构图和质感。\n${skillText}${parameterText}${referenceText}${extra}${negative}${annotationText}`,
      `Continue editing this main image: ${activeImage.title}\nKeep the main subject, composition, and texture.\n${skillText}${parameterText}${referenceText}${extra}${negative}${annotationText}`,
    )
  }, [activeImage, annotations, filledCanvasReferences, imageNegativePrompt, imageSkillId, language, prompt, tr])

  const importFiles = (fileList: FileList | File[]) => {
    const files = Array.from(fileList).filter((file) => file.type.startsWith('image/'))
    if (files.length === 0) {
      setStatus(tr('没有读到图片文件', 'No image files were found.'))
      return
    }

    addImportedFiles(files)
  }

  const placeImageOnCanvas = (imageId: string) => {
    const image = images.find((item) => item.id === imageId)
    if (!image) {
      setStatus(tr('没有找到这张图片，重新上传一次', 'Could not find that image. Upload it again.'))
      return
    }
    setActiveImageId(image.id)
    setZoomMode('fit')
    setStatus(tr('已把图片放到画布，并自动适应右侧可视区域', 'Image placed on the canvas and fitted to the right-side viewport.'))
  }

  const removeImage = (imageId: string) => {
    const image = images.find((item) => item.id === imageId)
    if (!image) return

    const nextImages = images.filter((item) => item.id !== imageId)
    if (image.src.startsWith('blob:')) URL.revokeObjectURL(image.src)
    setImages(nextImages)
    setAnnotationMap((current) => {
      const next = { ...current }
      delete next[imageId]
      return next
    })
    setImageDimensions((current) => {
      const next = { ...current }
      delete next[imageId]
      return next
    })
    setCanvasReferences((current) => current.map((reference) => (reference.imageId === imageId ? { ...reference, imageId: undefined } : reference)))
    removeVideoImage(imageId)
    if (activeImageId === imageId) {
      setActiveImageId(nextImages[0]?.id ?? null)
      setDraftShape(null)
    }
    setStatus(nextImages.length > 0 ? tr(`已移除「${image.title}」`, `Removed "${image.title}".`) : tr('已移除图片，画布已清空', 'Image removed. The canvas is now empty.'))
  }

  const setCanvasZoom = (nextScale: number) => {
    const clamped = clampCanvasScale(nextScale)
    setZoomMode('manual')
    setCanvasScale(clamped)
    setStatus(tr(`画布缩放 ${Math.round(clamped * 100)}%`, `Canvas zoom ${Math.round(clamped * 100)}%`))
  }

  const fitCanvasToView = useCallback(() => {
    if (!activeDimensions || !canvasStageRef.current) return

    const stage = canvasStageRef.current
    const stageStyle = window.getComputedStyle(stage)
    const horizontalPadding = parseFloat(stageStyle.paddingLeft) + parseFloat(stageStyle.paddingRight)
    const verticalPadding = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom)
    const availableWidth = Math.max(240, stage.clientWidth - horizontalPadding - 12)
    const availableHeight = Math.max(180, stage.clientHeight - verticalPadding - 12)
    const nextScale = Math.min(1, availableWidth / activeDimensions.width, availableHeight / activeDimensions.height)
    setCanvasScale(clampCanvasScale(nextScale))
  }, [activeDimensions])

  const recordImageDimensions = (imageId: string, element: HTMLImageElement) => {
    const width = element.naturalWidth || element.width
    const height = element.naturalHeight || element.height
    if (!width || !height) return
    setImageDimensions((current) => {
      const existing = current[imageId]
      if (existing?.width === width && existing.height === height) return current
      return { ...current, [imageId]: { width, height } }
    })
  }

  const importImageUrl = useCallback((url: string) => {
    const trimmed = url.trim()
    const localUrl = toLocalImageUrl(trimmed)
    const filePath = toLocalImagePath(trimmed) ?? undefined
    const src = localUrl ?? trimmed
    if (!localUrl && !/^https?:\/\//.test(trimmed) && !trimmed.startsWith('blob:') && !trimmed.startsWith('data:image/')) return false
    const next: GeneratedImage = {
      id: `url-${Date.now()}`,
      title: localUrl ? trimmed.split('/').pop() || tr('本机图片', 'Local image') : tr('外部图片', 'External image'),
      src,
      prompt: tr(`外部图片：${trimmed}`, `External image: ${trimmed}`),
      source: 'url',
      filePath,
    }
    setImages((items) => [next, ...items])
    if (!isVideoPanelOpen && hasReferenceCanvas && activeImageId) {
      fillCanvasReferenceSlots([next.id])
      setStatus(tr('已从拖入的图片链接加入下方参考素材槽', 'Dropped image link added to the reference slot below.'))
      return true
    }
    setActiveImageId(next.id)
    if (isVideoPanelOpen) addVideoImages([next.id])
    setZoomMode('fit')
    setStatus(isVideoPanelOpen ? tr('已从拖入的图片链接加入视频参考图', 'Dropped image link added to video references.') : tr('已从拖入的图片链接创建画布图片', 'Canvas image created from the dropped image link.'))
    return true
  }, [activeImageId, addVideoImages, fillCanvasReferenceSlots, hasReferenceCanvas, isVideoPanelOpen, tr])

  const importReferenceImageUrl = useCallback(
    (url: string, targetSlotIndex: number) => {
      const trimmed = url.trim()
      const localUrl = toLocalImageUrl(trimmed)
      const filePath = toLocalImagePath(trimmed) ?? undefined
      const src = localUrl ?? trimmed
      if (!localUrl && !/^https?:\/\//.test(trimmed) && !trimmed.startsWith('blob:') && !trimmed.startsWith('data:image/')) return false

      const next: GeneratedImage = {
        id: `reference-url-${Date.now()}`,
        title: localUrl ? trimmed.split('/').pop() || tr('本机素材', 'Local reference') : tr('外部素材', 'External reference'),
        src,
        prompt: tr(`外部参考素材：${trimmed}`, `External reference: ${trimmed}`),
        source: 'url',
        filePath,
      }
      setImages((items) => [next, ...items])
      fillCanvasReferenceSlots([next.id], targetSlotIndex)
      setStatus(tr('已把拖入的图片加入这个参考素材槽', 'Dropped image added to this reference slot.'))
      return true
    },
    [fillCanvasReferenceSlots, tr],
  )

  const loadRecentImages = async () => {
    setIsRecentOpen(true)
    setIsRecentLoading(true)
    try {
      const response = await fetch('/api/recent-images', { cache: 'no-store' })
      if (!response.ok) throw new Error('recent images request failed')
      const data = (await response.json()) as { images?: RecentImage[] }
      const nextImages = data.images ?? []
      setRecentImages(nextImages)
      setStatus(
        nextImages.length > 0
          ? tr(`找到 ${nextImages.length} 张最近生成图片，点缩略图就能放进画布`, `Found ${nextImages.length} recent generated images. Click a thumbnail to place it on the canvas.`)
          : tr('没有找到最近生成图片，可以先生成或保存一张再刷新', 'No recent generated images found. Generate or save one, then refresh.'),
      )
    } catch {
      setStatus(tr('没有读到最近生成图片。可以继续用上传图片或 Cmd+V 粘贴。', 'Could not read recent generated images. You can still upload or paste with Cmd+V.'))
    } finally {
      setIsRecentLoading(false)
    }
  }

  const loadDownloadImages = async () => {
    setIsDownloadsOpen(true)
    setIsDownloadsLoading(true)
    try {
      const response = await fetch('/api/recent-download-images', { cache: 'no-store' })
      if (!response.ok) throw new Error('download images request failed')
      const data = (await response.json()) as { images?: RecentImage[] }
      const nextImages = data.images ?? []
      setDownloadImages(nextImages)
      setStatus(
        nextImages.length > 0
          ? tr(`找到 ${nextImages.length} 张最近下载图片，ChatGPT 命名的图片会排在前面`, `Found ${nextImages.length} recent downloaded images. ChatGPT-named images are listed first.`)
          : tr('Downloads 里没有找到最近图片，可以先从 ChatGPT 下载一张再刷新', 'No recent images found in Downloads. Download an image from ChatGPT, then refresh.'),
      )
    } catch {
      setStatus(tr('没有读到下载目录图片。可以继续用上传图片或 Cmd+V 粘贴。', 'Could not read downloaded images. You can still upload or paste with Cmd+V.'))
    } finally {
      setIsDownloadsLoading(false)
    }
  }

  const importRecentImage = (image: RecentImage) => {
    const next: GeneratedImage = {
      id: `recent-${image.mtimeMs}-${image.name}`,
      title: image.name.replace(/\.[^.]+$/, '') || tr('最近图片', 'Recent image'),
      src: image.url,
      prompt: tr(`最近本机图片：${image.path}`, `Recent local image: ${image.path}`),
      source: 'recent',
      filePath: image.path,
    }
    setImages((items) => [next, ...items.filter((item) => item.src !== image.url)])
    if (!isVideoPanelOpen && hasReferenceCanvas && activeImageId) {
      fillCanvasReferenceSlots([next.id])
      setStatus(tr('已把最近图片加入下方参考素材槽', 'Recent image added to the reference slot below.'))
      return
    }
    setActiveImageId(next.id)
    if (isVideoPanelOpen) addVideoImages([next.id])
    setZoomMode('fit')
    setStatus(isVideoPanelOpen ? tr('已把最近图片加入视频参考图', 'Recent image added to video references.') : tr('已把最近图片放到画布，并自动适应右侧可视区域', 'Recent image placed on the canvas and fitted to the right-side viewport.'))
  }

  const loadVideoTasks = useCallback(async (selectLatest = false) => {
    setIsVideoTasksLoading(true)
    try {
      const response = await fetch('/api/video-tasks', { cache: 'no-store' })
      const data = (await response.json()) as { tasks?: VideoTaskSummary[]; error?: string }
      if (!response.ok || data.error) throw new Error(data.error || '读取视频结果失败')
      const nextTasks = data.tasks ?? []
      setVideoTasks(nextTasks)
      setActiveVideoTaskId((current) => {
        if (selectLatest) return nextTasks[0]?.id ?? null
        if (current && nextTasks.some((task) => task.id === current)) return current
        return nextTasks[0]?.id ?? null
      })
    } catch (error) {
      setVideoTaskMessage(error instanceof Error ? localizeKnownMessage(error.message, language) : tr('读取视频结果失败', 'Could not read video results'))
    } finally {
      setIsVideoTasksLoading(false)
    }
  }, [language, tr])

  const updateVideoTaskSummary = useCallback((task: VideoTaskSummary) => {
    setVideoTasks((items) => {
      const hasTask = items.some((item) => item.id === task.id)
      return hasTask ? items.map((item) => (item.id === task.id ? task : item)) : [task, ...items]
    })
    setActiveVideoTaskId(task.id)
  }, [])

  const refreshVideoTaskResult = useCallback(
    async (taskId?: string, options?: { silent?: boolean }) => {
      if (!taskId) return
      if (!options?.silent) {
        setIsVideoTaskRefreshing(true)
        setVideoTaskMessage(tr('正在查询平台视频结果...', 'Checking provider video result...'))
      }

      try {
        const response = await fetch('/api/video-task-refresh', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: taskId }),
        })
        const data = (await response.json()) as VideoTaskActionResponse
        if (!response.ok || data.error || !data.task) throw new Error(data.error || '查询视频结果失败')

        updateVideoTaskSummary(data.task)
        const stateText = data.task.providerTaskStatus
          ? tr(`平台状态：${data.task.providerTaskStatus}`, `Provider status: ${data.task.providerTaskStatus}`)
          : getVideoStatusText(data.task.status, language)
        if (!options?.silent) {
          const message = getVideoPreviewUrl(data.task) ? tr('已经拿到视频，可以在右侧预览或下载', 'Video is ready. Preview or download it on the right.') : tr(`还在生成中，${stateText}`, `Still generating. ${stateText}`)
          setVideoTaskMessage(message)
          setStatus(message)
        }
      } catch (error) {
        if (!options?.silent) {
          const message = error instanceof Error ? localizeKnownMessage(error.message, language) : tr('查询视频结果失败', 'Could not check video result')
          setVideoTaskMessage(message)
          setStatus(tr(`查询视频结果失败：${message}`, `Could not check video result: ${message}`))
        }
      } finally {
        if (!options?.silent) setIsVideoTaskRefreshing(false)
      }
    },
    [language, tr, updateVideoTaskSummary],
  )

  const downloadVideoTaskResult = useCallback(
    async (taskId?: string) => {
      if (!taskId) return
      setIsVideoDownloading(true)
      setVideoTaskMessage(tr('正在保存平台视频到本地...', 'Saving provider video locally...'))

      try {
        const response = await fetch('/api/video-task-download', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: taskId }),
        })
        const data = (await response.json()) as VideoTaskActionResponse
        if (!response.ok || data.error || !data.task) throw new Error(data.error || '保存视频失败')

        updateVideoTaskSummary(data.task)
        setVideoTaskMessage(tr('视频已保存到本地，可以直接预览或下载', 'Video saved locally. You can preview or download it now.'))
        setStatus(tr('视频已保存到本地，可以直接预览或下载', 'Video saved locally. You can preview or download it now.'))
      } catch (error) {
        const message = error instanceof Error ? localizeKnownMessage(error.message, language) : tr('保存视频失败', 'Could not save video')
        setVideoTaskMessage(message)
        setStatus(tr(`保存视频失败：${message}`, `Could not save video: ${message}`))
      } finally {
        setIsVideoDownloading(false)
      }
    },
    [language, tr, updateVideoTaskSummary],
  )

  const saveVideoTaskToDownloads = useCallback(
    async (taskId?: string) => {
      if (!taskId) return
      setIsSavingVideoToDownloads(true)
      setVideoTaskMessage(tr('正在保存视频到下载目录...', 'Saving video to Downloads...'))

      try {
        let taskForDownloads = videoTasks.find((task) => task.id === taskId)
        if (taskForDownloads?.videoUrl && !taskForDownloads.localVideoUrl) {
          const response = await fetch('/api/video-task-download', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: taskId }),
          })
          const data = (await response.json()) as VideoTaskActionResponse
          if (!response.ok || data.error || !data.task) throw new Error(data.error || '保存本地视频失败')
          taskForDownloads = data.task
          updateVideoTaskSummary(data.task)
        }

        const response = await fetch('/api/video-task-save-downloads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: taskId }),
        })
        const data = (await response.json()) as VideoTaskActionResponse
        if (!response.ok || data.error || !data.task) throw new Error(data.error || '保存到下载目录失败')

        updateVideoTaskSummary(data.task)
        const path = data.downloadsVideoPath ?? data.task.downloadsVideoPath ?? '~/Downloads/Cowart Videos'
        setVideoTaskMessage(tr(`已保存到下载目录：${path}`, `Saved to Downloads: ${path}`))
        setStatus(tr(`已保存视频到下载目录：${path}`, `Video saved to Downloads: ${path}`))
      } catch (error) {
        const message = error instanceof Error ? localizeKnownMessage(error.message, language) : tr('保存到下载目录失败', 'Could not save to Downloads')
        setVideoTaskMessage(message)
        setStatus(tr(`保存到下载目录失败：${message}`, `Could not save to Downloads: ${message}`))
      } finally {
        setIsSavingVideoToDownloads(false)
      }
    },
    [language, tr, updateVideoTaskSummary, videoTasks],
  )

  const deleteVideoTask = useCallback(
    async (taskId?: string) => {
      if (!taskId) return
      setDeletingVideoTaskId(taskId)
      setVideoTaskMessage(tr('正在删除这条视频历史...', 'Deleting this video history item...'))

      try {
        const response = await fetch('/api/video-task-delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: taskId }),
        })
        const data = (await response.json()) as VideoTaskActionResponse
        if (!response.ok || data.error || !data.deletedId) throw new Error(data.error || '删除视频任务失败')

        const remainingTasks = videoTasks.filter((task) => task.id !== data.deletedId)
        setVideoTasks(remainingTasks)
        setActiveVideoTaskId((current) => {
          if (current && current !== data.deletedId && remainingTasks.some((task) => task.id === current)) return current
          return remainingTasks[0]?.id ?? null
        })
        setVideoTaskMessage(tr('已删除这条视频历史。', 'Video history item deleted.'))
        setStatus(tr('已删除这条视频历史。', 'Video history item deleted.'))
      } catch (error) {
        const message = error instanceof Error ? localizeKnownMessage(error.message, language) : tr('删除视频任务失败', 'Could not delete video task')
        setVideoTaskMessage(message)
        setStatus(tr(`删除视频任务失败：${message}`, `Could not delete video task: ${message}`))
      } finally {
        setDeletingVideoTaskId(null)
      }
    },
    [language, tr, videoTasks],
  )

  const applyVideoConfigResponse = (data: VideoConfigResponse) => {
    const providers = data.providers ?? []
    setVideoConfigProviders(providers)
    setVideoConfigValues((current) => {
      const next = { ...current }
      for (const provider of providers) {
        for (const field of provider.fields) {
          if (field.secret) {
            next[field.key] ??= ''
          } else {
            next[field.key] = field.value ?? ''
          }
        }
      }
      return next
    })
  }

  const loadVideoConfig = async () => {
    setIsApiConfigLoading(true)
    setVideoConfigMessage('')
    try {
      const response = await fetch('/api/video-config', { cache: 'no-store' })
      const data = (await response.json()) as VideoConfigResponse
      if (!response.ok || data.error) throw new Error(data.error || '读取 API 设置失败')
      applyVideoConfigResponse(data)
    } catch (error) {
      setVideoConfigMessage(error instanceof Error ? localizeKnownMessage(error.message, language) : tr('读取 API 设置失败', 'Could not read API settings'))
    } finally {
      setIsApiConfigLoading(false)
    }
  }

  const openApiSettings = () => {
    setIsApiSettingsOpen((isOpen) => !isOpen)
    if (!isApiSettingsOpen && videoConfigProviders.length === 0) void loadVideoConfig()
  }

  const saveApiSettings = async () => {
    const provider = selectedVideoConfig
    if (!provider) {
      setVideoConfigMessage(tr('还没有读到这个平台的设置项', 'No settings were found for this provider yet'))
      return
    }

    const values = Object.fromEntries(provider.fields.map((field) => [field.key, videoConfigValues[field.key] ?? '']))
    setIsApiConfigSaving(true)
    setVideoConfigMessage('')
    try {
      const response = await fetch('/api/video-config', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: provider.id, values }),
      })
      const data = (await response.json()) as VideoConfigResponse
      if (!response.ok || data.error) throw new Error(data.error || '保存 API 设置失败')
      applyVideoConfigResponse(data)
      const providerName = getVideoProviderText(provider.id, language, provider.name)
      setVideoConfigMessage(tr(`${providerName} API 设置已保存`, `${providerName} API settings saved`))
      setStatus(tr(`${providerName} API 设置已保存，可以继续生成视频`, `${providerName} API settings saved. You can generate videos now.`))
    } catch (error) {
      setVideoConfigMessage(error instanceof Error ? localizeKnownMessage(error.message, language) : tr('保存 API 设置失败', 'Could not save API settings'))
    } finally {
      setIsApiConfigSaving(false)
    }
  }

  const importDataTransfer = async (dataTransfer: DataTransfer | null) => {
    if (!dataTransfer) return false

    const files = Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))
    if (files.length > 0) {
      importFiles(files)
      return true
    }

    const itemFiles = Array.from(dataTransfer.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
      .filter((file) => file.type.startsWith('image/'))
    if (itemFiles.length > 0) {
      importFiles(itemFiles)
      return true
    }

    const imageId = dataTransfer.getData('application/x-cowart-image-id') || dataTransfer.getData('text/plain')
    if (images.some((item) => item.id === imageId)) {
      placeImageOnCanvas(imageId)
      return true
    }

    const directCandidates = [
      dataTransfer.getData('text/uri-list'),
      imageId,
      dataTransfer.getData('URL'),
      dataTransfer.getData('public.url'),
    ].filter(Boolean)

    for (const candidate of directCandidates) {
      for (const source of extractImageLikeSources(candidate)) {
        if (importImageUrl(source)) return true
      }
    }

    const downloadUrl = dataTransfer.getData('DownloadURL')
    if (downloadUrl) {
      const parts = downloadUrl.split(':')
      const maybeUrl = parts.slice(2).join(':')
      if (maybeUrl && importImageUrl(maybeUrl)) return true
    }

    const html = dataTransfer.getData('text/html')
    for (const source of extractImageLikeSources(html)) {
      if (importImageUrl(source)) return true
    }

    const stringItems = await Promise.all(
      Array.from(dataTransfer.items)
        .filter((item) => item.kind === 'string')
        .map(
          (item) =>
            new Promise<string>((resolve) => {
              item.getAsString((value) => resolve(value))
            }),
        ),
    )
    for (const value of stringItems) {
      for (const source of extractImageLikeSources(value)) {
        if (importImageUrl(source)) return true
      }
    }

    const types = Array.from(dataTransfer.types).join(', ') || tr('无', 'none')
    setStatus(tr(`没有识别到图片。拖拽数据类型：${types}。可以复制图片后按 Cmd+V，或点上传图片。`, `No image was detected. Drag data types: ${types}. Copy the image and press Cmd+V, or click Upload Image.`))
    return false
  }

  const importDataTransferAsReference = async (dataTransfer: DataTransfer | null, targetSlotIndex: number) => {
    if (!dataTransfer) return false

    const files = Array.from(dataTransfer.files).filter((file) => file.type.startsWith('image/'))
    if (files.length > 0) {
      addReferenceFiles(files, targetSlotIndex)
      return true
    }

    const itemFiles = Array.from(dataTransfer.items)
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter((file): file is File => file !== null)
      .filter((file) => file.type.startsWith('image/'))
    if (itemFiles.length > 0) {
      addReferenceFiles(itemFiles, targetSlotIndex)
      return true
    }

    const imageId = dataTransfer.getData('application/x-cowart-image-id') || dataTransfer.getData('text/plain')
    if (imageId && images.some((image) => image.id === imageId)) {
      addCanvasReferenceImage(imageId, targetSlotIndex)
      return true
    }

    const directCandidates = [
      dataTransfer.getData('text/uri-list'),
      imageId,
      dataTransfer.getData('URL'),
      dataTransfer.getData('public.url'),
    ].filter(Boolean)

    for (const candidate of directCandidates) {
      for (const source of extractImageLikeSources(candidate)) {
        if (importReferenceImageUrl(source, targetSlotIndex)) return true
      }
    }

    const downloadUrl = dataTransfer.getData('DownloadURL')
    if (downloadUrl) {
      const parts = downloadUrl.split(':')
      const maybeUrl = parts.slice(2).join(':')
      if (maybeUrl && importReferenceImageUrl(maybeUrl, targetSlotIndex)) return true
    }

    const html = dataTransfer.getData('text/html')
    for (const source of extractImageLikeSources(html)) {
      if (importReferenceImageUrl(source, targetSlotIndex)) return true
    }

    const stringItems = await Promise.all(
      Array.from(dataTransfer.items)
        .filter((item) => item.kind === 'string')
        .map(
          (item) =>
            new Promise<string>((resolve) => {
              item.getAsString((value) => resolve(value))
            }),
        ),
    )
    for (const value of stringItems) {
      for (const source of extractImageLikeSources(value)) {
        if (importReferenceImageUrl(source, targetSlotIndex)) return true
      }
    }

    const types = Array.from(dataTransfer.types).join(', ') || tr('无', 'none')
    setStatus(tr(`没有识别到素材图片。拖拽数据类型：${types}。可以先把图片导入左侧，再拖到这个素材槽。`, `No reference image was detected. Drag data types: ${types}. Import the image on the left first, then drag it into this slot.`))
    return false
  }

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith('image/'))
      if (files.length > 0) {
        event.preventDefault()
        addImportedFiles(files)
        return
      }

      const html = event.clipboardData?.getData('text/html') ?? ''
      const srcMatch = html.match(/<img[^>]+src=["']([^"']+)["']/i)
      if (srcMatch?.[1] && importImageUrl(srcMatch[1])) {
        event.preventDefault()
        return
      }

      const text = event.clipboardData?.getData('text/plain') ?? ''
      if (text && importImageUrl(text)) {
        event.preventDefault()
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [addImportedFiles, importImageUrl])

  useEffect(() => {
    const describeDrag = (dataTransfer: DataTransfer | null) => {
      const types = Array.from(dataTransfer?.types ?? [])
      return types.length > 0 ? tr(`检测到拖拽：${types.join(', ')}`, `Drag detected: ${types.join(', ')}`) : tr('检测到拖拽，但没有公开数据类型', 'Drag detected, but no public data type was exposed.')
    }

    const handleNativeDragEnter = (event: DragEvent) => {
      event.preventDefault()
      setIsWindowDragging(true)
      setDragHint(describeDrag(event.dataTransfer))
    }

    const handleNativeDragOver = (event: DragEvent) => {
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
      setIsWindowDragging(true)
      setDragHint(describeDrag(event.dataTransfer))
    }

    const handleNativeDragLeave = (event: DragEvent) => {
      if (event.clientX <= 0 || event.clientY <= 0 || event.clientX >= window.innerWidth || event.clientY >= window.innerHeight) {
        setIsWindowDragging(false)
      }
    }

    const handleNativeDrop = (event: DragEvent) => {
      if (isReferenceSlotEventTarget(event.target)) {
        setIsWindowDragging(false)
        return
      }
      event.preventDefault()
      event.stopPropagation()
      setIsWindowDragging(false)
      void importDataTransfer(event.dataTransfer)
    }

    window.addEventListener('dragenter', handleNativeDragEnter, true)
    window.addEventListener('dragover', handleNativeDragOver, true)
    window.addEventListener('dragleave', handleNativeDragLeave, true)
    window.addEventListener('drop', handleNativeDrop, true)

    return () => {
      window.removeEventListener('dragenter', handleNativeDragEnter, true)
      window.removeEventListener('dragover', handleNativeDragOver, true)
      window.removeEventListener('dragleave', handleNativeDragLeave, true)
      window.removeEventListener('drop', handleNativeDrop, true)
    }
  })

  useEffect(() => {
    if (zoomMode !== 'fit') return

    fitCanvasToView()
    const observer = new ResizeObserver(fitCanvasToView)
    const workbench = workbenchRef.current
    const stage = canvasStageRef.current
    const toolbox = toolboxRef.current
    if (workbench) observer.observe(workbench)
    if (stage) observer.observe(stage)
    if (toolbox) observer.observe(toolbox)
    window.addEventListener('resize', fitCanvasToView)

    return () => {
      observer.disconnect()
      window.removeEventListener('resize', fitCanvasToView)
    }
  }, [activeImageId, fitCanvasToView, panelWidth, zoomMode])

  const pasteFromClipboard = async () => {
    if (!navigator.clipboard?.read) {
      setStatus(tr('当前浏览器不支持直接读取剪贴板。请复制图片后按 Cmd+V，或用上传图片。', 'This browser cannot read the clipboard directly. Copy the image and press Cmd+V, or use Upload Image.'))
      return
    }

    try {
      const items = await navigator.clipboard.read()
      const files: File[] = []
      for (const item of items) {
        const imageType = item.types.find((type) => type.startsWith('image/'))
        if (!imageType) continue
        const blob = await item.getType(imageType)
        files.push(new File([blob], `clipboard-${Date.now()}.${imageType.split('/')[1] || 'png'}`, { type: imageType }))
      }
      if (files.length > 0) {
        addImportedFiles(files)
        return
      }
      setStatus(tr('剪贴板里没有读到图片。可以先复制图片，再点这个按钮或按 Cmd+V。', 'No image was found in the clipboard. Copy an image first, then click this button or press Cmd+V.'))
    } catch {
      setStatus(tr('读取剪贴板被浏览器拦截。请按 Cmd+V 粘贴，或点上传图片。', 'The browser blocked clipboard reading. Press Cmd+V to paste, or click Upload Image.'))
    }
  }

  const startResize = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const startX = event.clientX
    const startWidth = panelWidth

    const move = (moveEvent: PointerEvent) => {
      const nextWidth = startWidth + moveEvent.clientX - startX
      setPanelWidth(Math.min(680, Math.max(280, nextWidth)))
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const startImageScaleDrag = (event: ReactPointerEvent<HTMLButtonElement>, corner: ImageResizeCorner) => {
    if (!activeDimensions) return

    event.preventDefault()
    event.stopPropagation()
    setDraftShape(null)
    setZoomMode('manual')
    setIsImageScaleDragging(true)

    const startX = event.clientX
    const startY = event.clientY
    const startScale = canvasScale
    const startWidth = activeDimensions.width * startScale
    const startHeight = activeDimensions.height * startScale
    const horizontalDirection = corner.endsWith('right') ? 1 : -1
    const verticalDirection = corner.startsWith('bottom') ? 1 : -1
    let latestScale = startScale

    const move = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      const widthScale = (startWidth + horizontalDirection * (moveEvent.clientX - startX)) / activeDimensions.width
      const heightScale = (startHeight + verticalDirection * (moveEvent.clientY - startY)) / activeDimensions.height
      latestScale = clampCanvasScale(Math.max(widthScale, heightScale))
      setCanvasScale(latestScale)
      setStatus(tr(`拖拽缩放 ${Math.round(latestScale * 100)}%`, `Drag resize ${Math.round(latestScale * 100)}%`))
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      setIsImageScaleDragging(false)
      setStatus(tr(`图片缩放 ${Math.round(latestScale * 100)}%，可以继续放大局部标注`, `Image zoom ${Math.round(latestScale * 100)}%. You can keep enlarging areas for annotation.`))
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const addAnnotation = (annotation: CanvasAnnotation) => {
    if (!activeImage) return
    setAnnotationMap((current) => ({
      ...current,
      [activeImage.id]: [...(current[activeImage.id] ?? []), annotation],
    }))
    setStatus(tr(`已添加${annotationKindLabels[annotation.kind]}标注`, `Added ${annotationKindLabelsEn[annotation.kind]} annotation.`))
  }

  const startAnnotation = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!activeImage || activeTool === 'select') return
    if (isAnnotationControlTarget(event.target)) return

    const point = getCanvasPoint(event)
    const id = `ann-${Date.now()}`

    if (activeTool === 'pin') {
      addAnnotation({ id, kind: 'pin', x: point.x, y: point.y, text: tr('这里需要修改', 'Needs edit here'), style: annotationStyle })
      return
    }

    if (activeTool === 'text') {
      addAnnotation({ id, kind: 'text', x: point.x, y: point.y, text: tr('输入文字', 'Enter text'), style: annotationStyle })
      return
    }

    event.currentTarget.setPointerCapture(event.pointerId)
    if (activeTool === 'arrow') {
      setDraftShape({ id, kind: 'arrow', x: point.x, y: point.y, x2: point.x, y2: point.y, text: '', style: annotationStyle })
    }
    if (activeTool === 'circle') {
      setDraftShape({ id, kind: 'circle', x: point.x, y: point.y, w: 0, h: 0, text: '', style: annotationStyle })
    }
    if (activeTool === 'pen') {
      setDraftShape({ id, kind: 'pen', points: [point], text: '', style: annotationStyle })
    }
  }

  const moveAnnotation = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!draftShape) return
    const point = getCanvasPoint(event)
    if (draftShape.kind === 'arrow') {
      setDraftShape({ ...draftShape, x2: point.x, y2: point.y })
    }
    if (draftShape.kind === 'circle') {
      setDraftShape({ ...draftShape, w: point.x - draftShape.x, h: point.y - draftShape.y })
    }
    if (draftShape.kind === 'pen') {
      setDraftShape({ ...draftShape, points: [...draftShape.points, point] })
    }
  }

  const finishAnnotation = () => {
    if (!draftShape) return

    if (draftShape.kind === 'circle') {
      const x = draftShape.w < 0 ? draftShape.x + draftShape.w : draftShape.x
      const y = draftShape.h < 0 ? draftShape.y + draftShape.h : draftShape.y
      const w = Math.abs(draftShape.w)
      const h = Math.abs(draftShape.h)
      if (w > 1 && h > 1) {
        addAnnotation({ ...draftShape, x, y, w, h, text: draftShape.text || tr('圈出的区域需要修改', 'The circled area needs editing') })
      }
    } else if (draftShape.kind === 'arrow') {
      const length = Math.hypot(draftShape.x2 - draftShape.x, draftShape.y2 - draftShape.y)
      if (length > 1) {
        addAnnotation({ ...draftShape, text: draftShape.text || tr('箭头指向的位置需要修改', 'Edit the area indicated by the arrow') })
      }
    } else if (draftShape.points.length > 1) {
      addAnnotation({ ...draftShape, text: draftShape.text || tr('画笔标出的区域需要修改', 'Edit the area marked by the pen') })
    }

    setDraftShape(null)
  }

  const updateAnnotation = (id: string, text: string) => {
    if (!activeImage) return
    setAnnotationMap((current) => ({
      ...current,
      [activeImage.id]: (current[activeImage.id] ?? []).map((item) => (item.id === id ? { ...item, text } : item)),
    }))
  }

  const updateAnnotationStyle = (id: string, nextStyle: Partial<AnnotationStyle>) => {
    if (!activeImage) return
    setAnnotationMap((current) => ({
      ...current,
      [activeImage.id]: (current[activeImage.id] ?? []).map((item) => {
        if (item.id !== id) return item
        const style = getAnnotationStyle(item)
        return { ...item, style: { ...style, ...nextStyle } }
      }),
    }))
  }

  const startAnnotationBoxResize = (event: ReactPointerEvent<HTMLButtonElement>, annotation: CanvasAnnotation) => {
    event.preventDefault()
    event.stopPropagation()

    const style = getAnnotationStyle(annotation)
    const startMetrics = getAnnotationMetrics(style)
    const startX = event.clientX
    const startY = event.clientY
    let latestWidth = startMetrics.boxWidth
    let latestFontSize = startMetrics.fontSize

    const move = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      const dragDistance = Math.max(moveEvent.clientX - startX, moveEvent.clientY - startY)
      const scaleFactor = Math.max(canvasScale, 0.25)
      latestWidth = clampAnnotationBoxWidth(startMetrics.boxWidth + dragDistance / scaleFactor)
      latestFontSize = clampAnnotationFontSize(startMetrics.fontSize + dragDistance / (scaleFactor * 18))
      updateAnnotationStyle(annotation.id, { boxWidth: latestWidth, fontSize: latestFontSize })
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      setStatus(tr(`标注框已调整：${latestWidth}px / ${Math.round(latestFontSize)}px`, `Annotation box resized: ${latestWidth}px / ${Math.round(latestFontSize)}px`))
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const removeAnnotation = (id: string) => {
    if (!activeImage) return
    setAnnotationMap((current) => ({
      ...current,
      [activeImage.id]: (current[activeImage.id] ?? []).filter((item) => item.id !== id),
    }))
  }

  const handleDrop = (event: ReactDragEvent<HTMLElement>) => {
    if (isReferenceSlotEventTarget(event.target)) return

    event.preventDefault()
    event.stopPropagation()
    void importDataTransfer(event.dataTransfer)
  }

  const handleReferenceSlotDrop = (event: ReactDragEvent<HTMLDivElement>, slotIndex: number) => {
    event.preventDefault()
    event.stopPropagation()
    void importDataTransferAsReference(event.dataTransfer, slotIndex)
  }

  const exportTask = () => {
    if (!activeImage) {
      setStatus(tr('还没有图片可以导出', 'There is no image to export yet.'))
      return
    }
    const blob = new Blob(
      [
        JSON.stringify(
          {
            image: activeImage,
            references: filledCanvasReferences.map((item) => ({
              label: getReferenceLabel(item.index, language),
              image: item.image,
            })),
            annotations,
            skill: {
              id: imageSkillId,
              name: tr(selectedImageSkill.labelZh, selectedImageSkill.labelEn),
            },
            editPrompt,
            negativePrompt: imageNegativePrompt.trim() || undefined,
          },
          null,
          2,
        ),
      ],
      { type: 'application/json' },
    )
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'cowart-image-edit-task.json'
    link.click()
    URL.revokeObjectURL(url)
    setStatus(tr('已导出图片修改任务和标注', 'Exported the image edit task and annotations.'))
  }

  const resetCanvas = () => {
    if (!activeImage) return
    setAnnotationMap((current) => ({ ...current, [activeImage.id]: [] }))
    setStatus(tr('已清空当前图片的画布标注', 'Cleared the canvas annotations for the current image.'))
  }

  const removeReferenceCanvasSlot = (slotIndex: number) => {
    setCanvasReferences((current) => {
      const visible = current.slice(0, referenceSlotCount).filter((_, index) => index !== slotIndex)
      const hidden = current.slice(referenceSlotCount)
      const compacted = [...visible, ...hidden].slice(0, maxCanvasReferenceImages)
      while (compacted.length < maxCanvasReferenceImages) {
        const index = compacted.length
        compacted.push(createCanvasReference(index))
      }
      return compacted.map((reference, index) => ({ ...reference, id: `reference-${index + 1}`, label: `reference-${index + 1}` }))
    })
    setReferenceSlotSizes((current) => {
      const visible = current.slice(0, referenceSlotCount).filter((_, index) => index !== slotIndex)
      const hidden = current.slice(referenceSlotCount)
      const compacted = [...visible, ...hidden].slice(0, maxCanvasReferenceImages)
      while (compacted.length < maxCanvasReferenceImages) compacted.push(defaultReferenceSlotSize)
      return compacted
    })
    setReferenceSlotCount((current) => Math.max(0, current - 1))
    setStatus(tr(`已删除第 ${slotIndex + 1} 个参考图位`, `Deleted reference slot ${slotIndex + 1}.`))
  }

  const startReferenceSlotResize = (event: ReactPointerEvent<HTMLButtonElement>, slotIndex: number) => {
    event.preventDefault()
    event.stopPropagation()

    const startX = event.clientX
    const startY = event.clientY
    const startSize = referenceSlotSizes[slotIndex] ?? defaultReferenceSlotSize
    let latestSize = startSize

    const move = (moveEvent: PointerEvent) => {
      moveEvent.preventDefault()
      const delta = Math.max(moveEvent.clientX - startX, moveEvent.clientY - startY)
      latestSize = clampReferenceSlotSize(startSize + delta)
      setReferenceSlotSizes((current) => current.map((size, index) => (index === slotIndex ? latestSize : size)))
      setStatus(tr(`第 ${slotIndex + 1} 个参考图 ${latestSize}px`, `Reference image ${slotIndex + 1}: ${latestSize}px`))
    }

    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
      setStatus(tr(`已调整第 ${slotIndex + 1} 个参考图大小：${latestSize}px`, `Resized reference image ${slotIndex + 1}: ${latestSize}px`))
    }

    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  const sendEditTask = async () => {
    if (!activeImage) {
      setStatus(tr('先放入一张要修改的图片', 'Place an image to edit first.'))
      return
    }
    if (annotations.length === 0 && filledCanvasReferences.length === 0) {
      setStatus(tr('还没有画布标注或参考素材，先标出要改的地方，或把素材图放到下方槽里', 'No canvas annotations or reference materials yet. Mark the areas to edit, or drop reference images into the slots below.'))
      return
    }

    try {
      setStatus(tr('正在保存主图、参考素材和标注，准备交给 Codex 生成...', 'Saving the main image, references, and annotations for Codex...'))
      const imageResponse = await fetch(activeImage.src)
      if (!imageResponse.ok) throw new Error('读不到当前原图')
      const imageBlob = await imageResponse.blob()
      if (!imageBlob.type.startsWith('image/')) throw new Error('当前文件不是图片')
      const imageDataUrl = await blobToDataUrl(imageBlob)
      const referenceImageDataUrls = await Promise.all(
        filledCanvasReferences.map(async (item) => {
          const referenceResponse = await fetch(item.image.src)
          if (!referenceResponse.ok) throw new Error(`读不到参考素材：${item.image.title}`)
          const referenceBlob = await referenceResponse.blob()
          if (!referenceBlob.type.startsWith('image/')) throw new Error(`参考素材不是图片：${item.image.title}`)
          return blobToDataUrl(referenceBlob)
        }),
      )
      const response = await fetch('/api/codex-image-task', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          image: activeImage,
          references: filledCanvasReferences.map((item) => ({
            label: getReferenceLabel(item.index, language),
            image: item.image,
          })),
          annotations,
          editPrompt,
          negativePrompt: imageNegativePrompt.trim(),
          imageDataUrl,
          referenceImageDataUrls,
        }),
      })
      const task = (await response.json()) as CodexTaskResponse
      if (!response.ok || task.error) throw new Error(task.error || '保存 Codex 任务失败')

      try {
        await navigator.clipboard.writeText(task.codexInstruction)
        setStatus(tr(`已保存任务并复制给 Codex 的生成指令。把剪贴板内容粘贴到左边聊天，我就能按标注和 ${filledCanvasReferences.length} 张素材重新生成。`, `Saved the task and copied the Codex instruction. Paste the clipboard into the chat on the left, and I can regenerate from the annotations and ${filledCanvasReferences.length} reference image${filledCanvasReferences.length > 1 ? 's' : ''}.`))
      } catch {
        setStatus(tr(`已保存任务，但浏览器没允许复制。生成指令在：${task.codexInstructionPath}`, `Saved the task, but the browser did not allow copying. The generation instruction is at: ${task.codexInstructionPath}`))
      }
    } catch (error) {
      const message = error instanceof Error ? localizeKnownMessage(error.message, language) : ''
      setStatus(message ? tr(`交给 Codex 失败：${message}`, `Could not send to Codex: ${message}`) : tr('交给 Codex 失败', 'Could not send to Codex'))
    }
  }

  const submitVideoTask = async () => {
    setIsVideoPanelOpen(true)
    setVideoTaskMessage('')
    const inputImages = selectedVideoImages.length > 0 ? selectedVideoImages : activeImage ? [activeImage] : []

    if (inputImages.length === 0) {
      setStatus(tr('先上传或选择 1 到 5 张图片，作为视频首帧和参考图', 'Upload or select 1 to 5 images first for the first frame and references.'))
      setVideoTaskMessage(tr('还没有选择视频参考图。', 'No video reference images selected yet.'))
      return
    }

    const limitedImages = inputImages.slice(0, maxVideoImages)
    const finalPrompt =
      videoPrompt.trim() ||
      prompt.trim() ||
      (limitedImages.length > 1
        ? tr(`以这 ${limitedImages.length} 张图片作为首帧和参考图，生成自然、有镜头运动的视频：${limitedImages.map((image) => image.title).join('、')}`, `Use these ${limitedImages.length} images as the first frame and references to generate a natural video with camera movement: ${limitedImages.map((image) => image.title).join(', ')}`)
        : tr(`以这张图片作为首帧，生成自然、有镜头运动的视频：${limitedImages[0]?.title ?? '参考图'}`, `Use this image as the first frame to generate a natural video with camera movement: ${limitedImages[0]?.title ?? 'reference image'}`))

    try {
      setIsVideoSubmitting(true)
      setStatus(tr(`正在保存 ${limitedImages.length} 张视频参考图并创建任务...`, `Saving ${limitedImages.length} video reference image${limitedImages.length > 1 ? 's' : ''} and creating the task...`))
      const imageDataUrls = await Promise.all(
        limitedImages.map(async (image) => {
          const imageResponse = await fetch(image.src)
          if (!imageResponse.ok) throw new Error(`读不到图片：${image.title}`)
          const imageBlob = await imageResponse.blob()
          if (!imageBlob.type.startsWith('image/')) throw new Error(`不是图片：${image.title}`)
          return blobToDataUrl(imageBlob)
        }),
      )
      const response = await fetch('/api/video-generation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: videoProvider,
          image: limitedImages[0],
          images: limitedImages,
          imageDataUrl: imageDataUrls[0],
          imageDataUrls,
          prompt: finalPrompt,
          negativePrompt: videoNegativePrompt.trim(),
          duration: Number(videoDuration),
          aspectRatio: videoAspectRatio,
          resolution: videoResolution,
        }),
      })
      const task = (await response.json()) as VideoTaskResponse
      if (!response.ok || task.error) throw new Error(task.error || '创建视频任务失败')

      if (task.status === 'needs_config') {
        const missing = task.missingEnv?.join(language === 'en' ? ', ' : '、') || tr('视频平台密钥', 'video provider key')
        const providerName = getVideoProviderText(task.provider, language, task.providerName) ?? tr('视频平台', 'video provider')
        const message = tr(`已保存视频任务，但还没提交到 ${providerName}：缺少 ${missing}`, `Video task saved, but it was not submitted to ${providerName}: missing ${missing}`)
        setVideoTaskMessage(`${message}\n${tr(`任务目录：${task.directory}`, `Task folder: ${task.directory}`)}`)
        setStatus(message)
        void loadVideoTasks(true)
        return
      }

      const providerName = getVideoProviderText(task.provider, language, task.providerName) ?? tr('视频平台', 'video provider')
      const taskId = task.providerTaskId ? tr(`，任务 ID：${task.providerTaskId}`, `, task ID: ${task.providerTaskId}`) : ''
      const message = tr(`已提交到 ${providerName}${taskId}`, `Submitted to ${providerName}${taskId}`)
      setVideoTaskMessage(`${message}\n${tr(`任务目录：${task.directory}`, `Task folder: ${task.directory}`)}`)
      setStatus(tr(`${message}。结果会显示在右侧视频结果里`, `${message}. Results will appear in the video results panel on the right.`))
      void loadVideoTasks(true)
    } catch (error) {
      const message = error instanceof Error ? localizeKnownMessage(error.message, language) : tr('创建视频任务失败', 'Could not create the video task')
      setVideoTaskMessage(message)
      setStatus(tr(`生成视频失败：${message}`, `Video generation failed: ${message}`))
      void loadVideoTasks(true)
    } finally {
      setIsVideoSubmitting(false)
    }
  }

  const displayAnnotations = draftShape ? [...annotations, draftShape] : annotations
  const latestVideoTask = videoTasks[0] ?? null
  const activeVideoTask = videoTasks.find((task) => task.id === activeVideoTaskId) ?? latestVideoTask
  const activeVideoTaskIsGenerating = activeVideoTask ? isVideoTaskGenerating(activeVideoTask) : false
  const activeVideoPreviewUrl = activeVideoTask ? getVideoPreviewUrl(activeVideoTask) : null
  const getToolLabel = (toolId: CanvasTool) => {
    const labels: Record<CanvasTool, string> = {
      select: tr('选择', 'Select'),
      pin: tr('编号标注', 'Pin'),
      arrow: tr('箭头', 'Arrow'),
      pen: tr('画笔', 'Pen'),
      text: tr('文字', 'Text'),
      circle: tr('圆圈', 'Circle'),
    }
    return labels[toolId]
  }
  const getVideoStatusLabel = (statusValue: VideoTaskStatus) => {
    return getVideoStatusText(statusValue, language)
  }
  const getVideoTaskStatusLabel = (task: VideoTaskSummary) => {
    if (/not activated the model|ModelNotOpen/i.test(task.providerError ?? '')) {
      return tr('模型未开通', 'Model Not Activated')
    }
    if (/input image may contain real person/i.test(task.providerError ?? '')) {
      return tr('真人图片被拦截', 'Real Person Blocked')
    }
    return getVideoStatusLabel(task.status)
  }

  useEffect(() => {
    if (!isVideoPanelOpen) return undefined
    const timer = window.setInterval(() => setNowTick(Date.now()), 1000)
    return () => window.clearInterval(timer)
  }, [isVideoPanelOpen])

  useEffect(() => {
    if (!isVideoPanelOpen || videoTasks.length > 0 || isVideoTasksLoading) return
    const timer = window.setTimeout(() => {
      void loadVideoTasks()
    }, 0)
    return () => window.clearTimeout(timer)
  }, [isVideoPanelOpen, isVideoTasksLoading, loadVideoTasks, videoTasks.length])

  useEffect(() => {
    if (!isVideoPanelOpen || !activeVideoTask?.id || !activeVideoTaskIsGenerating) return undefined
    const timer = window.setInterval(() => {
      void refreshVideoTaskResult(activeVideoTask.id, { silent: true })
    }, 15000)
    return () => window.clearInterval(timer)
  }, [activeVideoTask?.id, activeVideoTaskIsGenerating, isVideoPanelOpen, refreshVideoTaskResult])

  const selectedImageSkill = imageGenerationSkills.find((skill) => skill.id === imageSkillId) ?? imageGenerationSkills[0]
  const editControlBlock = (
    <section className="chat-block prompt-control-block">
      <label htmlFor="prompt">{tr('提示词 / 补充说明（可选）', 'Prompt / Extra Notes (Optional)')}</label>
      <textarea
        id="prompt"
        value={prompt}
        onChange={(event) => setPrompt(event.target.value)}
        placeholder={tr('比如：整体风格别变，只修我标出来的地方', 'Example: keep the overall style, only fix the areas I marked')}
      />
      <label htmlFor="image-negative-prompt">{tr('反向提示词（可选）', 'Negative Prompt (Optional)')}</label>
      <textarea
        id="image-negative-prompt"
        value={imageNegativePrompt}
        onChange={(event) => setImageNegativePrompt(event.target.value)}
        placeholder={tr('比如：不要换脸、不要改变背景、不要多手指、不要模糊', 'Example: no face swap, no background changes, no extra fingers, no blur')}
      />
      <label className="api-field" htmlFor="image-skill-select">
        <span>{tr('Skill / 生成策略', 'Skill / Strategy')}</span>
        <select id="image-skill-select" value={imageSkillId} onChange={(event) => setImageSkillId(event.target.value as ImageGenerationSkillId)}>
          {imageGenerationSkills.map((skill) => (
            <option key={skill.id} value={skill.id}>
              {tr(skill.labelZh, skill.labelEn)}
            </option>
          ))}
        </select>
      </label>
      <p className="skill-description">{tr(selectedImageSkill.descriptionZh, selectedImageSkill.descriptionEn)}</p>
      <p className="block-title">{tr('从画布读到的改图意见', 'Edit Notes Read From Canvas')}</p>
      <pre className="edit-prompt">{editPrompt || tr('还没有放入图片。', 'No image placed yet.')}</pre>
      <button type="button" className="primary-button" onClick={() => void sendEditTask()}>
        <Send size={16} />
        {tr('交给 Codex 重新生成', 'Send to Codex')}
      </button>
    </section>
  )

  return (
    <main
      className="image-edit-app"
      style={{ '--panel-width': `${panelWidth}px` } as CSSProperties}
      onDragEnterCapture={(event) => event.preventDefault()}
      onDragOverCapture={(event) => {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'copy'
      }}
      onDropCapture={handleDrop}
    >
      <aside className="codex-panel">
        <header className="panel-header">
          <button
            type="button"
            className="mode-entry-button"
            onClick={() => {
              window.location.href = '/image-generator.html'
            }}
          >
            {tr('图片', 'Image')}
          </button>
          <button
            type="button"
            className="video-entry-button"
            onClick={() => {
              window.location.href = '/product-detail-generator.html'
            }}
          >
            {tr('设计', 'Design')}
          </button>
          <button
            type="button"
            className={`video-entry-button ${isVideoPanelOpen ? 'active' : ''}`}
            onClick={() => {
              setIsVideoPanelOpen(true)
              void loadVideoTasks()
              if (!activeImage) setStatus(tr('可以先从最近生成里点一张，作为视频首帧', 'Pick a recent generated image first to use as the first frame.'))
            }}
          >
            {tr('视频', 'Video')}
          </button>
          <button
            type="button"
            className={`mode-entry-button ${!isVideoPanelOpen ? 'active' : ''}`}
            onClick={() => {
              setIsVideoPanelOpen(false)
              setStatus(activeImage ? tr('已进入改图画布，可以继续标注要修改的位置', 'Image canvas is active. Keep marking the areas to edit.') : getDefaultStatus(language))
            }}
          >
            {tr('画布', 'Canvas')}
          </button>
          <label className="language-select">
            <Globe2 size={14} />
            <select aria-label={tr('语言', 'Language')} value={language} onChange={(event) => setLanguage(event.target.value as Language)}>
              {languageOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </header>

        {isVideoPanelOpen ? (
          <section className="chat-block video-block">
            <div className="video-block-header">
              <p className="block-title">{tr('图片生成视频', 'Image to Video')}</p>
              <button type="button" className={`config-toggle-button ${isApiSettingsOpen ? 'active' : ''}`} onClick={openApiSettings}>
                <SlidersHorizontal size={14} />
                {tr('API 设置', 'API Settings')}
              </button>
            </div>
            <div className="source-chip" title={activeImage?.filePath ?? activeImage?.src ?? ''}>
              <Video size={14} />
              {selectedVideoImages.length > 0
                ? tr(`已选 ${selectedVideoImages.length}/${maxVideoImages} 张视频参考图`, `${selectedVideoImages.length}/${maxVideoImages} video reference images selected`)
                : activeImage
                  ? tr(`当前图：${activeImage.title}`, `Current image: ${activeImage.title}`)
                  : tr('先选择 1 到 5 张图片', 'Select 1 to 5 images first')}
            </div>
            <div className="video-image-picker">
              <div className="video-image-picker-header">
                <strong>{tr('视频参考图', 'Video References')}</strong>
                <span>{selectedVideoImages.length}/{maxVideoImages}</span>
              </div>
              {selectedVideoImages.length > 0 ? (
                <div className="video-image-strip">
                  {selectedVideoImages.map((image, index) => (
                    <div key={image.id} className="video-image-thumb">
                      <img src={image.src} alt={image.title} />
                      <span>{index === 0 ? tr('首帧', 'First frame') : tr(`参考 ${index + 1}`, `Ref ${index + 1}`)}</span>
                      <button
                        type="button"
                        aria-label={tr(`移除 ${image.title}`, `Remove ${image.title}`)}
                        onClick={() => {
                          removeVideoImage(image.id)
                          setStatus(tr('已移除一张视频参考图', 'Removed one video reference image.'))
                        }}
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="recent-empty">{tr('上传、粘贴、拖入或从图片结果里加入，最多 5 张。', 'Upload, paste, drop, or add from image results. Up to 5 images.')}</p>
              )}
              <div className="video-image-actions">
                <button
                  type="button"
                  onClick={() => {
                    if (!activeImage) {
                      setStatus(tr('先放入或选择一张图片', 'Add or select an image first.'))
                      return
                    }
                    addVideoImages([activeImage.id])
                    setStatus(tr('已把当前图片加入视频参考图', 'Current image added to video references.'))
                  }}
                  disabled={!activeImage || selectedVideoImages.length >= maxVideoImages}
                >
                  <Plus size={14} />
                  {tr('加入当前图', 'Add Current')}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setVideoImageIds([])
                    setStatus(tr('已清空视频参考图', 'Video references cleared.'))
                  }}
                  disabled={selectedVideoImages.length === 0}
                >
                  <Trash2 size={14} />
                  {tr('清空', 'Clear')}
                </button>
              </div>
            </div>
            <div className="segmented-row" aria-label={tr('视频供应商', 'Video providers')}>
              {videoProviders.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  className={videoProvider === provider.id ? 'active' : ''}
                  onClick={() => setVideoProvider(provider.id)}
                  title={tr(provider.noteZh, provider.noteEn)}
                >
                  {tr(provider.labelZh, provider.labelEn)}
                </button>
              ))}
            </div>
            {isApiSettingsOpen ? (
              <div className="api-settings-panel">
                <div className="api-settings-title">
                  <strong>
                    {selectedVideoConfig
                      ? tr(
                          `${getVideoProviderText(selectedVideoConfig.id, language, selectedVideoConfig.name)} API 设置`,
                          `${getVideoProviderText(selectedVideoConfig.id, language, selectedVideoConfig.name)} API Settings`,
                        )
                      : tr('API 设置', 'API Settings')}
                  </strong>
                  <button type="button" onClick={() => void loadVideoConfig()} disabled={isApiConfigLoading}>
                    <RefreshCcw size={13} />
                    {tr('刷新', 'Refresh')}
                  </button>
                </div>
                {isApiConfigLoading ? (
                  <p className="recent-empty">{tr('正在读取本地 API 设置...', 'Reading local API settings...')}</p>
                ) : selectedVideoConfig ? (
                  <div className="api-field-list">
                    {selectedVideoConfig.fields.map((field) => (
                      <label key={field.key} className="api-field">
                        <span>
                          {getVideoConfigFieldLabel(field, language)}
                          {field.secret && field.configured ? <small>{tr('已保存', 'Saved')}</small> : null}
                        </span>
                        <input
                          type={field.secret ? 'password' : 'text'}
                          value={videoConfigValues[field.key] ?? ''}
                          onChange={(event) => setVideoConfigValues((values) => ({ ...values, [field.key]: event.target.value }))}
                          placeholder={field.secret && field.configured ? tr('已保存，留空不修改', 'Saved. Leave blank to keep it.') : field.placeholder || field.key}
                          autoComplete="off"
                        />
                      </label>
                    ))}
                  </div>
                ) : (
                  <p className="recent-empty">{tr('还没有读到这个平台的设置项。', 'No settings were found for this provider yet.')}</p>
                )}
                {videoConfigMessage ? <p className="config-message">{displayVideoConfigMessage}</p> : null}
                <button type="button" className="secondary-button wide-button" onClick={() => void saveApiSettings()} disabled={isApiConfigSaving || !selectedVideoConfig}>
                  {isApiConfigSaving ? tr('正在保存...', 'Saving...') : tr('保存 API 设置', 'Save API Settings')}
                </button>
              </div>
            ) : null}
            <label htmlFor="video-prompt">{tr('视频提示词', 'Video Prompt')}</label>
            <textarea
              id="video-prompt"
              className="video-textarea"
              value={videoPrompt}
              onChange={(event) => setVideoPrompt(event.target.value)}
              placeholder={tr('比如：镜头慢慢推进，人物轻微转头，光影自然变化', 'Example: slowly push the camera in, subtle head turn, natural lighting changes')}
            />
            <label htmlFor="video-negative-prompt">{tr('不想出现的内容（可选）', 'Negative Prompt (Optional)')}</label>
            <input
              id="video-negative-prompt"
              value={videoNegativePrompt}
              onChange={(event) => setVideoNegativePrompt(event.target.value)}
              placeholder={tr('比如：变形、模糊、抖动、低清晰度', 'Example: distortion, blur, jitter, low resolution')}
            />
            <div className="video-options-grid">
              <label>
                {tr('时长', 'Duration')}
                <select value={videoDuration} onChange={(event) => setVideoDuration(event.target.value)}>
                  {videoDurationOptions.map((seconds) => (
                    <option key={seconds} value={seconds}>
                      {tr(`${seconds} 秒`, `${seconds}s`)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {tr('比例', 'Aspect')}
                <select value={videoAspectRatio} onChange={(event) => setVideoAspectRatio(event.target.value)}>
                  <option value="16:9">16:9</option>
                  <option value="9:16">9:16</option>
                  <option value="1:1">1:1</option>
                </select>
              </label>
              <label>
                {tr('清晰度', 'Resolution')}
                <select value={videoResolution} onChange={(event) => setVideoResolution(event.target.value)}>
                  <option value="720P">720P</option>
                  <option value="1080P">1080P</option>
                </select>
              </label>
            </div>
            {videoTaskMessage ? <pre className="video-task-message">{displayVideoTaskMessage}</pre> : null}
            <button type="button" className="primary-button" onClick={() => void submitVideoTask()} disabled={isVideoSubmitting}>
              <Video size={16} />
              {isVideoSubmitting ? tr('正在创建视频任务...', 'Creating video task...') : tr('用这张图生成视频', 'Generate Video')}
            </button>
          </section>
        ) : null}

        <section className="chat-block">
          <div className="button-row">
            <button type="button" className="secondary-button" onClick={() => fileInputRef.current?.click()}>
              <Upload size={16} />
              {tr('上传图片', 'Upload Image')}
            </button>
            <button type="button" className="secondary-button" onClick={pasteFromClipboard}>
              <ImagePlus size={16} />
              {tr('粘贴图片', 'Paste Image')}
            </button>
            <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => event.target.files && importFiles(event.target.files)} />
            <input
              ref={referenceFileInputRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(event) => {
                const targetSlotIndex = pendingReferenceSlotRef.current
                pendingReferenceSlotRef.current = null
                if (event.target.files && targetSlotIndex !== null) addReferenceFiles(Array.from(event.target.files), targetSlotIndex)
                event.target.value = ''
              }}
            />
          </div>
          <div className="button-row">
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                if (isRecentOpen) {
                  setIsRecentOpen(false)
                  return
                }
                void loadRecentImages()
              }}
            >
              <ImagePlus size={16} />
              {tr('最近生成', 'Generated')}
            </button>
            <button
              type="button"
              className="secondary-button"
              onClick={() => {
                if (isDownloadsOpen) {
                  setIsDownloadsOpen(false)
                  return
                }
                void loadDownloadImages()
              }}
            >
              <Download size={16} />
              {tr('最近下载', 'Downloads')}
            </button>
          </div>
          {isRecentOpen ? (
            <div className="recent-import">
              <div className="recent-import-header">
                <span>{isRecentLoading ? tr('正在读取最近图片', 'Reading recent images') : tr(`最近图片 ${recentImages.length} 张`, `${recentImages.length} recent images`)}</span>
                <button type="button" onClick={() => void loadRecentImages()}>
                  <RefreshCcw size={14} />
                  {tr('刷新', 'Refresh')}
                </button>
              </div>
              {recentImages.length > 0 ? (
                <div className="recent-list">
                  {recentImages.map((image) => (
                    <button key={image.path} type="button" className="recent-image" onClick={() => importRecentImage(image)} title={image.path}>
                      <img src={image.url} alt={image.name} />
                      <span>{image.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="recent-empty">{tr('没列到最近图片；复制图片后按 Cmd+V，或从电脑文件拖入。', 'No recent images found. Copy an image and press Cmd+V, or drop a file from your computer.')}</p>
              )}
            </div>
          ) : null}
          {isDownloadsOpen ? (
            <div className="recent-import">
              <div className="recent-import-header">
                <span>{isDownloadsLoading ? tr('正在读取下载目录图片', 'Reading downloaded images') : tr(`下载图片 ${downloadImages.length} 张`, `${downloadImages.length} downloaded images`)}</span>
                <button type="button" onClick={() => void loadDownloadImages()}>
                  <RefreshCcw size={14} />
                  {tr('刷新', 'Refresh')}
                </button>
              </div>
              {downloadImages.length > 0 ? (
                <div className="recent-list">
                  {downloadImages.map((image) => (
                    <button key={image.path} type="button" className="recent-image" onClick={() => importRecentImage(image)} title={image.path}>
                      <img src={image.url} alt={image.name} />
                      <span>{image.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <p className="recent-empty">{tr('没列到下载图片；从 ChatGPT 下载图片后点刷新，或直接拖入/粘贴。', 'No downloaded images found. Download from ChatGPT, then refresh, or drag/paste directly.')}</p>
              )}
            </div>
          ) : null}
        </section>

        <section className="chat-block">
          <p className="block-title">{tr('图片结果', 'Image Results')}</p>
          {images.length > 0 ? (
            <div className="result-list">
              {images.map((image) => (
                <div
                  key={image.id}
                  className={`image-result ${activeImageId === image.id ? 'selected' : ''}`}
                  draggable
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = 'copy'
                    event.dataTransfer.setData('application/x-cowart-image-id', image.id)
                    event.dataTransfer.setData('text/plain', image.id)
                  }}
                >
                  <img src={image.src} alt={image.title} draggable={false} />
                  <span>{image.title}</span>
                  <small>{tr(imageSourceLabels[image.source], image.source === 'uploaded' ? 'Uploaded' : image.source === 'url' ? 'Image URL' : 'Recent Image')}</small>
                  <div className="image-result-actions">
                    <button
                      type="button"
                      onClick={() => {
                        if (isVideoPanelOpen) {
                          addVideoImages([image.id])
                          setStatus(tr('已加入视频参考图', 'Added to video references.'))
                          return
                        }
                        placeImageOnCanvas(image.id)
                      }}
                      disabled={isVideoPanelOpen && (videoImageIds.includes(image.id) || selectedVideoImages.length >= maxVideoImages)}
                    >
                      <Plus size={14} />
                      {isVideoPanelOpen
                        ? videoImageIds.includes(image.id)
                          ? tr('已加入', 'Added')
                          : tr('加入视频', 'Add to Video')
                        : tr('放到画布', 'Place on Canvas')}
                    </button>
                    {!isVideoPanelOpen ? (
                      <button
                        type="button"
                        onClick={() => addCanvasReferenceImage(image.id)}
                        disabled={filledCanvasReferences.some((item) => item.image.id === image.id)}
                      >
                        <ImagePlus size={14} />
                        {filledCanvasReferences.some((item) => item.image.id === image.id) ? tr('已在素材', 'In References') : tr('素材', 'Reference')}
                      </button>
                    ) : null}
                    <button
                      type="button"
                      className="danger-icon-button"
                      aria-label={tr(`删除 ${image.title}`, `Delete ${image.title}`)}
                      title={tr('删除这张图片', 'Delete this image')}
                      onPointerDown={(event) => event.stopPropagation()}
                      onClick={(event) => {
                        event.stopPropagation()
                        removeImage(image.id)
                      }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty-state">
              <ImagePlus size={22} />
              <span>{tr('这里会出现你导入的任意图片。没有默认示例图。', 'Imported images appear here. No default sample images.')}</span>
            </div>
          )}
        </section>

        {!isVideoPanelOpen ? editControlBlock : null}

      </aside>

      <button type="button" className="resize-handle" aria-label={tr('调整左侧宽度', 'Resize side panel')} onPointerDown={startResize} />

      <section
        className="canvas-area"
        onDragEnter={(event) => event.preventDefault()}
        onDragOver={(event) => {
          event.preventDefault()
          event.dataTransfer.dropEffect = 'copy'
        }}
        onDrop={handleDrop}
      >
        <header className="canvas-topbar">
          <p>{displayStatus}</p>
          {isVideoPanelOpen ? (
            <button type="button" onClick={() => void loadVideoTasks()} disabled={isVideoTasksLoading}>
              <RefreshCcw size={16} />
              {tr('刷新视频结果', 'Refresh Video Results')}
            </button>
          ) : (
            <>
              <div className="zoom-control" aria-label={tr('画布缩放', 'Canvas zoom')}>
                <button
                  type="button"
                  className={zoomMode === 'fit' ? 'active' : ''}
                  aria-label={tr('适应可视区域', 'Fit to view')}
                  title={tr('适应可视区域', 'Fit to view')}
                  onClick={() => {
                    setZoomMode('fit')
                    fitCanvasToView()
                    setStatus(tr('已自动适应右侧可视区域', 'Canvas fitted to the right-side viewport.'))
                  }}
                >
                  {tr('适应', 'Fit')}
                </button>
                <button type="button" aria-label={tr('缩小画布', 'Zoom out')} title={tr('缩小画布', 'Zoom out')} onClick={() => setCanvasZoom(canvasScale - 0.1)}>
                  <ZoomOut size={16} />
                </button>
                <span>{canvasZoomLabel}</span>
                <button type="button" aria-label={tr('放大画布', 'Zoom in')} title={tr('放大画布', 'Zoom in')} onClick={() => setCanvasZoom(canvasScale + 0.1)}>
                  <ZoomIn size={16} />
                </button>
              </div>
              <button type="button" onClick={resetCanvas}>
                <RefreshCcw size={16} />
                {tr('重置', 'Reset')}
              </button>
              {activeImage && referenceSlotCount < maxCanvasReferenceImages ? (
                <button type="button" onClick={addReferenceCanvasSlot}>
                  <ImagePlus size={16} />
                  {tr('添加参考', 'Add Reference')}
                </button>
              ) : null}
              <button type="button" onClick={exportTask}>
                <Download size={16} />
                {tr('导出', 'Export')}
              </button>
            </>
          )}
        </header>

        <div
          ref={workbenchRef}
          className={`workbench ${activeImage && !isVideoPanelOpen ? 'has-image' : ''} ${isVideoPanelOpen ? 'video-workbench' : ''}`}
          onDragEnter={(event) => event.preventDefault()}
          onDragOver={(event) => {
            event.preventDefault()
            event.dataTransfer.dropEffect = 'copy'
          }}
          onDrop={handleDrop}
        >
          {isVideoPanelOpen ? (
            <section className="video-showcase">
              <div className="video-showcase-heading">
                <div>
                  <span>{tr('生成视频结果', 'Generated Video')}</span>
                  <strong>{activeVideoTask ? activeVideoTask.title : tr('还没有视频任务', 'No video tasks yet')}</strong>
                </div>
                <button
                  type="button"
                  onClick={() => (activeVideoTask ? void refreshVideoTaskResult(activeVideoTask.id) : void loadVideoTasks())}
                  disabled={isVideoTasksLoading || isVideoTaskRefreshing}
                >
                  <RefreshCcw className={isVideoTaskRefreshing ? 'spin-icon' : undefined} size={16} />
                  {activeVideoTask ? tr('查询结果', 'Check Result') : tr('刷新', 'Refresh')}
                </button>
              </div>

              {isVideoTasksLoading ? (
                <div className="video-showcase-empty">
                  <RefreshCcw className="spin-icon" size={30} />
                  <strong>{tr('正在读取视频结果', 'Reading video results')}</strong>
                </div>
              ) : activeVideoTask ? (
                <div className="video-showcase-content">
                  <article className="video-hero-card">
                    <VideoTaskMedia task={activeVideoTask} className="video-hero-media" />
                    <div className="video-hero-info">
                      <span className={`video-status video-status-${activeVideoTask.status}`}>{getVideoTaskStatusLabel(activeVideoTask)}</span>
                      {activeVideoTaskIsGenerating ? (
                        <div className="video-progress">
                          <RefreshCcw className="spin-icon" size={15} />
                          <strong>{tr('生成中', 'Generating')} {formatElapsedTime(activeVideoTask.createdAt, nowTick, language)}</strong>
                          <span>{activeVideoTask.providerTaskStatus ? tr(`平台状态：${activeVideoTask.providerTaskStatus}`, `Provider status: ${activeVideoTask.providerTaskStatus}`) : tr('等待平台返回视频', 'Waiting for the provider to return the video')}</span>
                        </div>
                      ) : null}
                      <h2>{activeVideoTask.title}</h2>
                      <p>{getVideoTaskDetailText(activeVideoTask, language) || tr('视频任务', 'Video task')}</p>
                      {activeVideoTask.prompt ? <small>{getDisplayPromptText(activeVideoTask.prompt, language)}</small> : null}
                      {activeVideoTask.missingEnv && activeVideoTask.missingEnv.length > 0 ? <em>{tr(`缺少 API：${activeVideoTask.missingEnv.join('、')}`, `Missing API: ${activeVideoTask.missingEnv.join(', ')}`)}</em> : null}
                      {activeVideoTask.taskId ? <em>{tr(`任务 ID：${activeVideoTask.taskId}`, `Task ID: ${activeVideoTask.taskId}`)}</em> : null}
                      {activeVideoTask.providerTaskStatus && !activeVideoTaskIsGenerating ? <em>{tr(`平台状态：${activeVideoTask.providerTaskStatus}`, `Provider status: ${activeVideoTask.providerTaskStatus}`)}</em> : null}
                      {activeVideoTask.providerError ? <em>{tr(`平台错误：${getDisplayProviderError(activeVideoTask.providerError, language)}`, `Provider error: ${getDisplayProviderError(activeVideoTask.providerError, language)}`)}</em> : null}
                      <span>{tr(`提交：${formatTaskTime(activeVideoTask.createdAt, language)}`, `Submitted: ${formatTaskTime(activeVideoTask.createdAt, language)}`)}</span>
                      {activeVideoTask.updatedAt ? <span>{tr(`更新：${formatTaskTime(activeVideoTask.updatedAt, language)}`, `Updated: ${formatTaskTime(activeVideoTask.updatedAt, language)}`)}</span> : null}
                      {activeVideoTask.downloadsVideoPath ? <em>{tr(`下载目录：${activeVideoTask.downloadsVideoPath}`, `Downloads folder: ${activeVideoTask.downloadsVideoPath}`)}</em> : null}
                      <div className="video-actions">
                        <button type="button" onClick={() => void refreshVideoTaskResult(activeVideoTask.id)} disabled={isVideoTaskRefreshing}>
                          <RefreshCcw className={isVideoTaskRefreshing ? 'spin-icon' : undefined} size={15} />
                          {tr('查询结果', 'Check Result')}
                        </button>
                        {activeVideoTask.videoUrl ? (
                          <a href={activeVideoTask.videoUrl} target="_blank" rel="noreferrer">
                            {tr('打开平台视频', 'Open Provider Video')}
                          </a>
                        ) : null}
                        {activeVideoPreviewUrl ? (
                          <a href={activeVideoPreviewUrl} download>
                            <Download size={15} />
                            {tr('下载视频', 'Download Video')}
                          </a>
                        ) : null}
                        {activeVideoPreviewUrl || activeVideoTask.videoUrl ? (
                          <button type="button" onClick={() => void saveVideoTaskToDownloads(activeVideoTask.id)} disabled={isSavingVideoToDownloads}>
                            <Download size={15} />
                            {isSavingVideoToDownloads ? tr('正在保存', 'Saving') : tr('存到下载目录', 'Save to Downloads')}
                          </button>
                        ) : null}
                        {activeVideoTask.videoUrl && !activeVideoTask.localVideoUrl ? (
                          <button type="button" onClick={() => void downloadVideoTaskResult(activeVideoTask.id)} disabled={isVideoDownloading}>
                            <Download size={15} />
                            {isVideoDownloading ? tr('保存中', 'Saving') : tr('保存到本地', 'Save Locally')}
                          </button>
                        ) : null}
                        <button
                          type="button"
                          className="danger-action-button"
                          onClick={() => void deleteVideoTask(activeVideoTask.id)}
                          disabled={deletingVideoTaskId === activeVideoTask.id}
                        >
                          <Trash2 size={15} />
                          {deletingVideoTaskId === activeVideoTask.id ? tr('删除中', 'Deleting') : tr('删除记录', 'Delete Record')}
                        </button>
                      </div>
                    </div>
                  </article>

                  <aside className="video-history-panel">
                    <div className="video-history-title">
                      <strong>{tr('历史生成', 'History')}</strong>
                      <span>{tr(`${videoTasks.length} 条`, `${videoTasks.length} items`)}</span>
                    </div>
                    <div className="video-showcase-list" aria-label={tr('历史生成视频', 'Video history')}>
                      {videoTasks.slice(0, 24).map((task) => (
                        <div
                          key={task.id}
                          className={`video-showcase-item ${activeVideoTask.id === task.id ? 'selected' : ''}`}
                        >
                          <button
                            type="button"
                            className="video-showcase-main"
                            onClick={() => setActiveVideoTaskId(task.id)}
                          >
                            <VideoTaskMedia task={task} />
                            <div>
                              <strong>{task.title}</strong>
                              <span>{getVideoTaskDetailText(task, language) || getVideoProviderText(task.provider, language, task.providerName) || tr('视频任务', 'Video task')}</span>
                              {isVideoTaskGenerating(task) ? (
                                <span className="video-mini-progress">
                                  <RefreshCcw className="spin-icon" size={11} />
                                  {formatElapsedTime(task.createdAt, nowTick, language)}
                                </span>
                              ) : task.providerTaskStatus ? (
                                <span>{tr(`平台状态：${task.providerTaskStatus}`, `Provider status: ${task.providerTaskStatus}`)}</span>
                              ) : task.providerError ? (
                                <span>{tr(`平台错误：${getDisplayProviderError(task.providerError, language)}`, `Provider error: ${getDisplayProviderError(task.providerError, language)}`)}</span>
                              ) : null}
                              <small className={`video-status video-status-${task.status}`}>{getVideoTaskStatusLabel(task)}</small>
                            </div>
                          </button>
                          <button
                            type="button"
                            className="video-history-delete"
                            aria-label={tr(`删除 ${task.title}`, `Delete ${task.title}`)}
                            onClick={() => void deleteVideoTask(task.id)}
                            disabled={deletingVideoTaskId === task.id}
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      ))}
                    </div>
                  </aside>
                </div>
              ) : (
                <div className="video-showcase-empty">
                  <Video size={34} />
                  <strong>{tr('视频结果会显示在这里', 'Video results appear here')}</strong>
                  <span>{tr('先选择首帧图片，点左侧“用这张图生成视频”。', 'Select a first-frame image, then click Generate Video on the left.')}</span>
                </div>
              )}
            </section>
          ) : (
            <>
          {isStylePanelOpen ? (
            <div className="style-panel" onPointerDown={(event) => event.stopPropagation()}>
              <div className="color-grid">
                {colorOptions.map((color) => (
                  <button
                    key={color}
                    type="button"
                    className={annotationStyle.color === color ? 'selected' : ''}
                    aria-label={tr(`颜色 ${color}`, `Color ${color}`)}
                    title={tr(`颜色 ${color}`, `Color ${color}`)}
                    style={{ backgroundColor: color }}
                    onClick={() => setAnnotationStyle((style) => ({ ...style, color }))}
                  />
                ))}
              </div>
              <div className="size-row">
                {sizeOptions.map((size) => (
                  <button
                    key={size}
                    type="button"
                    className={annotationStyle.size === size ? 'selected' : ''}
                    onClick={() => setAnnotationStyle((style) => ({ ...style, size }))}
                  >
                    {sizeLabel[size]}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          <div ref={canvasStageRef} className="canvas-stage">
            {activeImage ? (
              <div className={`composition-canvas ${hasReferenceCanvas ? 'has-reference-slots' : ''}`}>
                <div
                  className={`image-canvas ${isImageScaleDragging ? 'show-resize-handles' : ''}`}
                  style={imageCanvasStyle}
                  draggable={false}
                  onDragStart={(event) => event.preventDefault()}
                  onPointerDown={startAnnotation}
                  onPointerMove={moveAnnotation}
                  onPointerUp={finishAnnotation}
                  onPointerCancel={() => setDraftShape(null)}
                >
                  <img
                    src={activeImage.src}
                    alt={activeImage.title}
                    draggable={false}
                    onLoad={(event) => recordImageDimensions(activeImage.id, event.currentTarget)}
                  />
                  <svg className="drawing-layer" viewBox="0 0 100 100" preserveAspectRatio="none">
                    <defs>
                      <marker id="arrow-head" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                        <path d="M0,0 L8,4 L0,8 Z" />
                      </marker>
                    </defs>
                    {displayAnnotations.map((annotation) => {
                      const style = getAnnotationStyle(annotation)
                      if (annotation.kind === 'arrow') {
                        return (
                          <g key={annotation.id}>
                            <defs>
                              <marker id={`arrow-head-${annotation.id}`} markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto" markerUnits="strokeWidth">
                                <path d="M0,0 L8,4 L0,8 Z" fill={style.color} />
                              </marker>
                            </defs>
                            <line
                              x1={annotation.x}
                              y1={annotation.y}
                              x2={annotation.x2}
                              y2={annotation.y2}
                              stroke={style.color}
                              strokeWidth={strokeWidth[style.size]}
                              markerEnd={`url(#arrow-head-${annotation.id})`}
                            />
                          </g>
                        )
                      }
                      if (annotation.kind === 'circle') {
                        return (
                          <ellipse
                            key={annotation.id}
                            cx={annotation.x + annotation.w / 2}
                            cy={annotation.y + annotation.h / 2}
                            rx={Math.abs(annotation.w / 2)}
                            ry={Math.abs(annotation.h / 2)}
                            stroke={style.color}
                            strokeWidth={strokeWidth[style.size]}
                          />
                        )
                      }
                      if (annotation.kind === 'pen') {
                        return (
                          <polyline
                            key={annotation.id}
                            points={annotation.points.map((point) => `${point.x},${point.y}`).join(' ')}
                            stroke={style.color}
                            strokeWidth={strokeWidth[style.size]}
                          />
                        )
                      }
                      return null
                    })}
                  </svg>
                  {annotations.map((annotation, index) => {
                    const anchor = getAnnotationAnchor(annotation)
                    const style = getAnnotationStyle(annotation)
                    const metrics = getAnnotationMetrics(style)
                    return (
                    <div
                      key={annotation.id}
                      className={`annotation-control annotation-${style.size} ${annotation.kind === 'pin' ? 'annotation-pin' : ''}`}
                      style={
                        {
                          left: `${anchor.x}%`,
                          top: `${anchor.y}%`,
                          '--annotation-color': style.color,
                          '--annotation-box-width': `${metrics.boxWidth}px`,
                          '--annotation-font-size': `${metrics.fontSize}px`,
                        } as CSSProperties
                      }
                      onClick={(event) => event.stopPropagation()}
                      onPointerDown={(event) => event.stopPropagation()}
                    >
                      <span className="annotation-index">{index + 1}</span>
                      {annotation.kind === 'pin' ? <ArrowRight size={34} /> : null}
                      <span className="annotation-text-frame">
                        <input value={annotation.text} onChange={(event) => updateAnnotation(annotation.id, event.target.value)} />
                        <button
                          type="button"
                          className="annotation-text-resize"
                          aria-label={tr('拖拽调整标注框和字号', 'Drag to resize the annotation box and text')}
                          title={tr('拖拽调整标注框和字号', 'Drag to resize the annotation box and text')}
                          onPointerDown={(event) => startAnnotationBoxResize(event, annotation)}
                        />
                      </span>
                      <button
                        type="button"
                        className="annotation-delete-button"
                        aria-label={tr('删除标注', 'Delete annotation')}
                        onClick={(event) => {
                          event.stopPropagation()
                          removeAnnotation(annotation.id)
                        }}
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    )
                  })}
                  {imageResizeCorners.map((corner) => (
                    <button
                      key={corner}
                      type="button"
                      className={`image-scale-handle image-scale-handle-${corner}`}
                      aria-label={tr(`${corner} 拖拽缩放图片`, `${corner} drag to resize image`)}
                      title={tr('拖拽缩放图片', 'Drag to resize image')}
                      onPointerDown={(event) => startImageScaleDrag(event, corner)}
                    />
                  ))}
                </div>
                {hasReferenceCanvas ? (
                  <div className="reference-slots" style={referenceSlotsStyle}>
                    {visibleCanvasReferences.map((reference, index) => {
                      const referenceImage = reference.imageId ? images.find((image) => image.id === reference.imageId) : undefined
                      const referenceLabel = getReferenceLabel(index, language)
                      return (
                        <div
                          key={reference.id}
                          className={`reference-slot ${referenceImage ? 'filled' : ''}`}
                          role="button"
                          tabIndex={0}
                          aria-label={referenceImage ? tr(`替换 ${getReferenceLabel(index, 'zh')}`, `Replace ${referenceLabel}`) : tr(`添加 ${getReferenceLabel(index, 'zh')}`, `Add ${referenceLabel}`)}
                          onClick={() => openReferenceFilePicker(index)}
                          onKeyDown={(event) => {
                            if (event.key === 'Enter' || event.key === ' ') {
                              event.preventDefault()
                              openReferenceFilePicker(index)
                            }
                          }}
                          onDragEnter={(event) => event.preventDefault()}
                          onDragOver={(event) => {
                            event.preventDefault()
                            event.dataTransfer.dropEffect = 'copy'
                          }}
                          onDrop={(event) => handleReferenceSlotDrop(event, index)}
                          style={{ '--reference-slot-size': `${referenceSlotSizes[index] ?? defaultReferenceSlotSize}px` } as CSSProperties}
                        >
                          <button
                            type="button"
                            className="reference-slot-delete"
                            aria-label={tr(`删除 ${getReferenceLabel(index, 'zh')}`, `Delete ${referenceLabel}`)}
                            onClick={(event) => {
                              event.stopPropagation()
                              removeReferenceCanvasSlot(index)
                            }}
                          >
                            <Trash2 size={13} />
                          </button>
                          {referenceImage ? (
                            <>
                              <span className="reference-slot-badge">{referenceLabel}</span>
                              <img src={referenceImage.src} alt={referenceImage.title} draggable={false} />
                              <span className="reference-slot-title">{referenceImage.title}</span>
                              <div className="reference-slot-actions">
                                <button
                                  type="button"
                                  aria-label={tr(`移除 ${getReferenceLabel(index, 'zh')} 图片`, `Remove image from ${referenceLabel}`)}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    setCanvasReferences((current) => current.map((item, itemIndex) => (itemIndex === index ? { ...item, imageId: undefined } : item)))
                                  }}
                                >
                                  {tr('移除', 'Remove')}
                                </button>
                                <button
                                  type="button"
                                  aria-label={tr(`替换 ${getReferenceLabel(index, 'zh')} 图片`, `Replace image in ${referenceLabel}`)}
                                  onClick={(event) => {
                                    event.stopPropagation()
                                    openReferenceFilePicker(index)
                                  }}
                                >
                                  {tr('替换', 'Replace')}
                                </button>
                              </div>
                            </>
                          ) : (
                            <>
                              <ImagePlus size={18} />
                              <strong>{referenceLabel}</strong>
                              <span>{tr('点击或拖入', 'Click or drop')}</span>
                            </>
                          )}
                          <button
                            type="button"
                            className="reference-slot-resize"
                            aria-label={tr(`调整 ${getReferenceLabel(index, 'zh')} 大小`, `Resize ${referenceLabel}`)}
                            title={tr('拖拽调整参考图大小', 'Drag to resize reference image')}
                            onPointerDown={(event) => startReferenceSlotResize(event, index)}
                          />
                        </div>
                      )
                    })}
                    {referenceSlotCount < maxCanvasReferenceImages ? (
                      <button
                        type="button"
                        className="add-reference-canvas-button"
                        onClick={addReferenceCanvasSlot}
                        style={{ '--reference-slot-size': `${defaultReferenceSlotSize}px` } as CSSProperties}
                      >
                        <ImagePlus size={17} />
                        {tr('添加参考', 'Add Reference')}
                      </button>
                    ) : null}
                  </div>
                ) : (
                  <button
                    type="button"
                    className="add-reference-canvas-button"
                    onClick={addReferenceCanvasSlot}
                    style={{ '--reference-slot-size': `${defaultReferenceSlotSize}px` } as CSSProperties}
                  >
                    <ImagePlus size={17} />
                    {tr('添加参考', 'Add Reference')}
                  </button>
                )}
              </div>
            ) : (
              <div className="drop-zone">
                <ImagePlus size={40} />
                <strong>{tr('把任意图片拖到这里', 'Drop any image here')}</strong>
              </div>
            )}
          </div>

          <div ref={toolboxRef} className="canvas-toolbox" aria-label={tr('画布工具', 'Canvas tools')}>
            {toolButtons.map((tool) => {
              const Icon = tool.icon
              return (
                <button
                  key={tool.id}
                  type="button"
                  className={activeTool === tool.id ? 'active' : ''}
                  aria-label={getToolLabel(tool.id)}
                  title={getToolLabel(tool.id)}
                  onClick={() => {
                    setActiveTool(tool.id)
                    setStatus(tr(`已切换到${tool.label}工具`, `Switched to ${getToolLabel(tool.id)} tool`))
                  }}
                >
                  <Icon size={21} />
                </button>
              )
            })}
            <button
              type="button"
              className={isStylePanelOpen ? 'active' : ''}
              aria-label={tr('样式', 'Style')}
              title={tr('样式', 'Style')}
              onClick={() => setIsStylePanelOpen((open) => !open)}
            >
              <SlidersHorizontal size={21} />
            </button>
          </div>
            </>
          )}
        </div>
      </section>

      {isWindowDragging ? (
        <div className="drop-debug-overlay">
          <div>
            <ImagePlus size={42} />
            <strong>{tr('松手导入图片', 'Release to import image')}</strong>
            <span>{dragHint}</span>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
