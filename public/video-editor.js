const state = {
  mode: 'highlights',
  source: null,
  segments: [],
  activeId: null,
  aspectRatio: '16:9',
  analysis: null,
  muteOriginal: false,
  muteNarration: false,
  cropZoom: 1,
  cropX: 0.5,
  cropY: 0.5,
  timelineScale: 14,
  videoTrackCount: 3,
  undoStack: [],
  redoStack: [],
  proxyLoading: false,
}

const $ = (selector) => document.querySelector(selector)
const apiBase = location.protocol === 'file:' ? 'http://127.0.0.1:43219' : ''
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character])
const fmt = (seconds) => {
  const value = Math.max(0, Number(seconds) || 0)
  const mins = Math.floor(value / 60)
  return `${mins}:${String(Math.floor(value % 60)).padStart(2, '0')}`
}
const uid = () => `clip-${Date.now()}-${Math.random().toString(16).slice(2)}`
const setStatus = (text) => { $('#status').textContent = text }
const cloneSegments = () => state.segments.map((segment) => ({ ...segment }))
const selectedDuration = () => state.segments.reduce((sum, segment) => sum + Math.max(0, segment.end - segment.start), 0)
const clipPixelWidth = (segment) => Math.max(36, (segment.end - segment.start) * state.timelineScale)
const thumbnailUrl = (time) => {
  const filePath = state.source?.proxyPath || state.source?.path
  if (!filePath) return ''
  return `${apiBase}/api/video-editor-thumbnail?path=${encodeURIComponent(filePath)}&time=${Math.max(0, Number(time) || 0).toFixed(2)}`
}

const timelineLayout = () => {
  let x = 4
  let editTime = 0
  const items = state.segments.map((segment) => {
    const duration = Math.max(0.12, segment.end - segment.start)
    const width = clipPixelWidth(segment)
    const item = { segment, x, width, editStart: editTime, editEnd: editTime + duration }
    x += width + 4
    editTime += duration
    return item
  })
  return { items, width: Math.max(900, x + 4), duration: editTime }
}

const editTimeToX = (time, layout = timelineLayout()) => {
  if (!layout.items.length) return 4
  const value = Math.max(0, Math.min(layout.duration, Number(time) || 0))
  const item = layout.items.find((candidate) => value <= candidate.editEnd) || layout.items[layout.items.length - 1]
  const ratio = Math.max(0, Math.min(1, (value - item.editStart) / Math.max(0.12, item.editEnd - item.editStart)))
  return item.x + ratio * item.width
}

const xToEditTime = (x, layout = timelineLayout()) => {
  if (!layout.items.length) return 0
  const value = Math.max(4, Math.min(layout.width, x))
  let nearest = layout.items[0]
  for (const item of layout.items) {
    if (value >= item.x && value <= item.x + item.width) {
      const ratio = (value - item.x) / item.width
      return item.editStart + ratio * (item.editEnd - item.editStart)
    }
    if (Math.abs(value - item.x) < Math.abs(value - nearest.x)) nearest = item
  }
  return value < nearest.x ? nearest.editStart : nearest.editEnd
}

const saveProject = () => {
  localStorage.setItem('cowart-video-editor-project', JSON.stringify({
    mode: state.mode,
    source: state.source,
    segments: state.segments,
    aspectRatio: state.aspectRatio,
    activeId: state.activeId,
    cropZoom: state.cropZoom,
    cropX: state.cropX,
    cropY: state.cropY,
    timelineScale: state.timelineScale,
    videoTrackCount: state.videoTrackCount,
    commentaryScript: $('#commentaryScript').value,
    editGoal: $('#editGoal').value,
  }))
  $('#saveState').textContent = '已自动保存'
}

const updateHistoryButtons = () => {
  $('#undoButton').disabled = state.undoStack.length === 0
  $('#redoButton').disabled = state.redoStack.length === 0
  const hasActive = Boolean(state.segments.find((segment) => segment.id === state.activeId))
  $('#deleteSelectedButton').disabled = !hasActive
  $('#duplicateButton').disabled = !hasActive
  $('#splitButton').disabled = !hasActive
}

const pushHistory = (snapshot = cloneSegments()) => {
  state.undoStack.push(snapshot)
  if (state.undoStack.length > 50) state.undoStack.shift()
  state.redoStack = []
  updateHistoryButtons()
}

const restoreHistory = (from, to, message) => {
  if (!from.length) return
  to.push(cloneSegments())
  state.segments = from.pop()
  state.activeId = state.segments.find((segment) => segment.id === state.activeId)?.id || state.segments[0]?.id || null
  renderSegments()
  saveProject()
  setStatus(message)
}

const updateMetrics = () => {
  const source = state.source?.meta?.duration || 0
  const edit = selectedDuration()
  $('#sourceDuration').textContent = fmt(source)
  $('#editDuration').textContent = fmt(edit)
  $('#clipCount').textContent = state.segments.length
  $('#savedDuration').textContent = fmt(Math.max(0, source - edit))
  $('#segmentCount').textContent = `${state.segments.length} 条`
  $('#timelineSummary').textContent = state.segments.length
    ? `当前保留 ${state.segments.length} 个片段，共 ${fmt(edit)}。点击定位，拖动排序，拖动边缘裁切。`
    : 'AI 选择的片段会出现在这里，可以拖动排序、分割或删除。'
  updateHistoryButtons()
}

const applyTimelineGeometry = () => {
  const layout = timelineLayout()
  const totalWidth = 82 + layout.width
  $('#timelineContent').style.width = `${totalWidth}px`
  $('#timelineStack').style.width = `${totalWidth}px`
  $('#timelineScrollTopSpacer').style.width = `${totalWidth}px`
  $('#timelineScrollBottomSpacer').style.width = `${totalWidth}px`
  $('#ruler').style.width = `${layout.width}px`
  document.querySelectorAll('.track').forEach((track) => { track.style.width = `${layout.width}px` })
  return layout
}

const renderRuler = () => {
  const ruler = $('#ruler')
  ruler.innerHTML = ''
  const layout = applyTimelineGeometry()
  if (!layout.duration) return
  const marks = Math.max(6, Math.min(24, Math.ceil(layout.width / 150)))
  for (let index = 0; index <= marks; index += 1) {
    const editTime = layout.duration * index / marks
    const span = document.createElement('span')
    span.style.left = `${editTimeToX(editTime, layout)}px`
    span.textContent = fmt(editTime)
    ruler.append(span)
  }
}

const syncClipEditor = () => {
  const segment = state.segments.find((item) => item.id === state.activeId)
  $('#clipEditor').hidden = !segment
  if (!segment) return
  $('#clipLabel').value = segment.label || ''
  $('#clipStart').value = segment.start.toFixed(2)
  $('#clipEnd').value = segment.end.toFixed(2)
}

const updatePlayhead = () => {
  if (!state.source || !state.segments.length) return
  const video = $('#preview')
  let index = state.segments.findIndex((segment) => segment.id === state.activeId && video.currentTime >= segment.start - 0.05 && video.currentTime <= segment.end + 0.05)
  if (index < 0) index = state.segments.findIndex((segment) => video.currentTime >= segment.start - 0.05 && video.currentTime <= segment.end + 0.05)
  if (index < 0) return
  const segment = state.segments[index]
  const clip = [...document.querySelectorAll('.video-track-layer .clip')].find((node) => node.dataset.id === segment.id)
  if (!clip) return
  const ratio = Math.max(0, Math.min(1, (video.currentTime - segment.start) / Math.max(0.12, segment.end - segment.start)))
  $('#playhead').hidden = false
  $('#playhead').style.left = `${82 + clip.offsetLeft + ratio * clip.offsetWidth}px`
}

const selectSegment = (segment, sourceTime = segment.start) => {
  state.activeId = segment.id
  $('#preview').currentTime = Math.max(segment.start, Math.min(segment.end - 0.01, sourceTime))
  document.querySelectorAll('.video-track-layer .clip').forEach((clip) => clip.classList.toggle('active', clip.dataset.id === segment.id))
  document.querySelectorAll('#segmentList .segment-row').forEach((row, index) => row.classList.toggle('active', state.segments[index]?.id === segment.id))
  syncClipEditor()
  updateHistoryButtons()
  updatePlayhead()
}

const seekEditTime = (editTime) => {
  const layout = timelineLayout()
  const item = layout.items.find((candidate) => editTime <= candidate.editEnd) || layout.items[layout.items.length - 1]
  if (!item) return
  const ratio = Math.max(0, Math.min(1, (editTime - item.editStart) / Math.max(0.12, item.editEnd - item.editStart)))
  selectSegment(item.segment, item.segment.start + ratio * (item.segment.end - item.segment.start))
}

const startTrim = (event, segment, side, clip) => {
  event.preventDefault()
  event.stopPropagation()
  const historySnapshot = cloneSegments()
  const startX = event.clientX
  const initialStart = segment.start
  const initialEnd = segment.end
  const sourceDuration = state.source?.meta?.duration || 1
  const clipWidth = Math.max(1, clip.getBoundingClientRect().width)
  const span = Math.max(0.12, initialEnd - initialStart)
  let changed = false
  const move = (moveEvent) => {
    const delta = (moveEvent.clientX - startX) / clipWidth * span
    if (side === 'left') segment.start = Math.max(0, Math.min(initialEnd - 0.12, initialStart + delta))
    else segment.end = Math.min(sourceDuration, Math.max(initialStart + 0.12, initialEnd + delta))
    changed = Math.abs(segment.start - initialStart) > 0.001 || Math.abs(segment.end - initialEnd) > 0.001
    clip.querySelector('small').textContent = `${fmt(segment.start)} - ${fmt(segment.end)}`
  }
  const finish = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    if (changed) pushHistory(historySnapshot)
    state.activeId = segment.id
    renderSegments()
    saveProject()
    setStatus(changed ? '片段边缘已裁剪' : '片段范围未改变')
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
}

let nativeTrackDrag = null

const configureVideoTrackDrop = (row) => {
  row.ondragover = (event) => {
    if (!nativeTrackDrag) return
    event.preventDefault()
    nativeTrackDrag.lastY = event.clientY
    clearTrackDropTargets()
    row.classList.add('drop-target')
  }
  row.ondragleave = (event) => {
    if (!row.contains(event.relatedTarget)) row.classList.remove('drop-target')
  }
  row.ondrop = (event) => {
    event.preventDefault()
    const drag = nativeTrackDrag
    nativeTrackDrag = null
    clearTrackDropTargets()
    if (!drag) return
    const segment = state.segments.find((item) => item.id === drag.id)
    if (!segment) return
    let targetTrack = Number(row.dataset.videoTrack || 1)
    const topRow = document.querySelector('.video-track-layer')
    const rowRect = row.getBoundingClientRect()
    const dropY = Number.isFinite(drag.lastY) ? drag.lastY : event.clientY
    if (row === topRow && dropY <= rowRect.top + 30 && state.videoTrackCount < 8) {
      targetTrack = state.videoTrackCount + 1
      ensureVideoTrackCount(targetTrack)
    }
    const previousTrack = Number(segment.videoTrack) || 1
    let from = state.segments.findIndex((item) => item.id === segment.id)
    let to = from
    const trackRect = row.querySelector('.video-track').getBoundingClientRect()
    const dropX = event.clientX - trackRect.left
    let closest = Number.POSITIVE_INFINITY
    timelineLayout().items.forEach((item, index) => {
      if (item.segment.id === segment.id) return
      const distance = Math.abs(dropX - (item.x + item.width / 2))
      if (distance < closest) {
        closest = distance
        to = index
      }
    })
    const orderChanged = from >= 0 && to >= 0 && from !== to && Math.abs(event.clientX - drag.startX) >= 20
    const trackChanged = targetTrack !== previousTrack
    if (!orderChanged && !trackChanged) {
      renderSegments()
      setStatus('片段位置未改变')
      return
    }
    pushHistory(drag.snapshot)
    segment.videoTrack = targetTrack
    if (orderChanged) {
      const [dragged] = state.segments.splice(from, 1)
      if (to > from) to -= 1
      state.segments.splice(Math.max(0, to), 0, dragged)
    }
    state.activeId = segment.id
    renderSegments()
    saveProject()
    setStatus(trackChanged ? `片段已移动到 V${targetTrack} 视频轨` : '片段顺序已调整')
  }
}

const ensureVideoTrackCount = (requestedCount) => {
  const count = Math.max(3, Math.min(8, Number(requestedCount) || 3))
  const stack = $('#timelineStack')
  for (let number = 4; number <= count; number += 1) {
    if (stack.querySelector(`[data-video-track="${number}"]`)) continue
    const row = document.createElement('div')
    row.className = 'track-row video-track-layer'
    row.dataset.videoTrack = String(number)
    row.innerHTML = `<div class="track-label"><span>V${number} 视频</span><button type="button" title="隐藏视频轨">◉</button></div><div class="track video-track" id="videoTrack${number}"><span class="track-empty">向上拖动片段可继续增加轨道</span></div>`
    const firstVideoRow = stack.querySelector('.video-track-layer')
    stack.insertBefore(row, firstVideoRow)
    configureVideoTrackDrop(row)
  }
  state.videoTrackCount = Math.max(state.videoTrackCount, count)
}

const videoTrackElement = (number) => document.querySelector(`[data-video-track="${number}"] .video-track`)

const clearTrackDropTargets = () => {
  document.querySelectorAll('.video-track-layer.drop-target').forEach((row) => row.classList.remove('drop-target'))
}

const closestVideoTrack = (clientY) => {
  const rows = [...document.querySelectorAll('.video-track-layer')]
  return rows
    .map((row) => ({ row, distance: Math.abs(clientY - (row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2)) }))
    .sort((left, right) => left.distance - right.distance)[0]?.row || null
}

const startClipDrag = (event, segment, clip) => {
  if (event.button !== 0 || event.target.closest('.trim-handle')) return
  event.preventDefault()
  const historySnapshot = cloneSegments()
  const startX = event.clientX
  const startY = event.clientY
  let moved = false
  let lastX = startX
  let lastY = startY
  const move = (moveEvent) => {
    lastX = moveEvent.clientX
    lastY = moveEvent.clientY
    const deltaX = lastX - startX
    const deltaY = lastY - startY
    if (!moved && Math.hypot(deltaX, deltaY) < 5) return
    moved = true
    clip.classList.add('dragging')
    clip.style.transform = `translate(${deltaX}px, ${deltaY}px)`
    clip.style.zIndex = '7'
    clearTrackDropTargets()
    const rows = [...document.querySelectorAll('.video-track-layer')]
    const topRow = rows[0]
    if (topRow && lastY < topRow.getBoundingClientRect().top - 12 && state.videoTrackCount < 8) topRow.classList.add('drop-target')
    else closestVideoTrack(lastY)?.classList.add('drop-target')
  }
  const finish = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    clip.classList.remove('dragging')
    clip.style.transform = ''
    clip.style.zIndex = ''
    clearTrackDropTargets()
    if (!moved) {
      const rect = clip.getBoundingClientRect()
      const ratio = Math.max(0, Math.min(1, (startX - rect.left) / rect.width))
      selectSegment(segment, segment.start + ratio * (segment.end - segment.start))
      return
    }
    const from = state.segments.findIndex((item) => item.id === segment.id)
    const previousTrack = Math.max(1, Number(segment.videoTrack) || 1)
    const rows = [...document.querySelectorAll('.video-track-layer')]
    const topRow = rows[0]
    let targetTrack = Number(closestVideoTrack(lastY)?.dataset.videoTrack || previousTrack)
    if (topRow && lastY < topRow.getBoundingClientRect().top - 12 && state.videoTrackCount < 8) {
      targetTrack = state.videoTrackCount + 1
      ensureVideoTrackCount(targetTrack)
    }
    const siblings = [...document.querySelectorAll('.video-track-layer .clip')].filter((node) => node !== clip)
    let to = from
    let closest = Number.POSITIVE_INFINITY
    if (Math.abs(lastX - startX) >= 20) {
      siblings.forEach((node) => {
        const rect = node.getBoundingClientRect()
        const distance = Math.abs(lastX - (rect.left + rect.width / 2))
        if (distance < closest) {
          closest = distance
          to = state.segments.findIndex((item) => item.id === node.dataset.id)
        }
      })
    }
    const trackChanged = targetTrack !== previousTrack
    const orderChanged = from >= 0 && to >= 0 && from !== to
    if (trackChanged || orderChanged) {
      pushHistory(historySnapshot)
      segment.videoTrack = targetTrack
      if (orderChanged) {
        const [dragged] = state.segments.splice(from, 1)
        state.segments.splice(to, 0, dragged)
      }
      state.activeId = segment.id
      renderSegments()
      saveProject()
      setStatus(trackChanged ? `片段已移动到 V${targetTrack} 视频轨` : '片段顺序已调整')
    } else {
      renderSegments()
      setStatus('片段位置未改变')
    }
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
}

const deleteSegment = (id) => {
  if (!state.segments.some((segment) => segment.id === id)) return
  pushHistory()
  state.segments = state.segments.filter((segment) => segment.id !== id)
  if (state.activeId === id) state.activeId = state.segments[0]?.id || null
  renderSegments()
  saveProject()
  setStatus('片段已删除，可使用撤销恢复')
}

const renderSegments = () => {
  const scrollLeft = $('#timelineViewport').scrollLeft
  const audioTrack = $('#audioTrack')
  const narrationTrack = $('#narrationTrack')
  const captionTrack = $('#captionTrack')
  const highestAssignedTrack = state.segments.reduce((highest, segment) => Math.max(highest, Number(segment.videoTrack) || 1), 3)
  const requiredTrackCount = Math.max(3, Math.min(8, highestAssignedTrack))
  document.querySelectorAll('.video-track-layer').forEach((row) => {
    if (Number(row.dataset.videoTrack) > requiredTrackCount) row.remove()
  })
  state.videoTrackCount = requiredTrackCount
  ensureVideoTrackCount(requiredTrackCount)
  document.querySelectorAll('.video-track-layer .clip').forEach((node) => node.remove())
  audioTrack.querySelectorAll('.audio-clip').forEach((node) => node.remove())
  narrationTrack.querySelectorAll('.narration-clip').forEach((node) => node.remove())
  captionTrack.querySelectorAll('.caption-clip').forEach((node) => node.remove())
  const list = $('#segmentList')
  list.innerHTML = ''
  const layout = timelineLayout()

  state.segments.forEach((segment, index) => {
    const item = layout.items[index]
    const width = item.width
    const trackNumber = Math.max(1, Math.min(state.videoTrackCount, Number(segment.videoTrack) || 1))
    segment.videoTrack = trackNumber
    const clip = document.createElement('button')
    clip.type = 'button'
    clip.className = `clip${segment.id === state.activeId ? ' active' : ''}`
    clip.dataset.id = segment.id
    clip.draggable = true
    clip.style.width = `${width}px`
    clip.style.left = `${item.x}px`
    clip.style.backgroundImage = `url("${thumbnailUrl(segment.start + Math.min(0.6, Math.max(0.1, (segment.end - segment.start) * 0.12)))}")`
    clip.innerHTML = `<span class="trim-handle left" title="拖动片段起点"></span><strong>${esc(segment.label || `片段 ${index + 1}`)}</strong><small>${fmt(segment.start)} - ${fmt(segment.end)}</small><span class="trim-handle right" title="拖动片段终点"></span>`
    clip.querySelector('.trim-handle.left').onpointerdown = (event) => startTrim(event, segment, 'left', clip)
    clip.querySelector('.trim-handle.right').onpointerdown = (event) => startTrim(event, segment, 'right', clip)
    clip.onpointerdown = (event) => startClipDrag(event, segment, clip)
    clip.ondragstart = (event) => {
      nativeTrackDrag = { id: segment.id, snapshot: cloneSegments(), startX: event.clientX }
      event.dataTransfer.effectAllowed = 'move'
      event.dataTransfer.setData('text/plain', segment.id)
      clip.classList.add('dragging')
    }
    clip.ondragend = () => {
      nativeTrackDrag = null
      clip.classList.remove('dragging')
      clearTrackDropTargets()
    }
    videoTrackElement(trackNumber).append(clip)

    const audio = document.createElement('div')
    audio.className = 'audio-clip'
    audio.style.width = `${width}px`
    audio.style.left = `${item.x}px`
    audio.textContent = `原声 ${index + 1}`
    audioTrack.append(audio)

    if (state.mode === 'commentary') {
      const caption = document.createElement('div')
      caption.className = 'caption-clip'
      caption.style.width = `${width}px`
      caption.style.left = `${item.x}px`
      caption.textContent = `字幕 ${index + 1}`
      captionTrack.append(caption)
    }

    const row = document.createElement('div')
    row.className = `segment-row${segment.id === state.activeId ? ' active' : ''}`
    row.innerHTML = `<button type="button"><strong>${esc(segment.label || `片段 ${index + 1}`)}</strong><small>${fmt(segment.start)} - ${fmt(segment.end)} · ${fmt(segment.end - segment.start)}</small></button><button type="button" class="delete" title="删除片段">×</button>`
    row.querySelector('button').onclick = () => selectSegment(segment)
    row.querySelector('.delete').onclick = () => deleteSegment(segment.id)
    list.append(row)
  })

  const narrationText = $('#commentaryScript').value.trim()
  if (state.mode === 'commentary' && narrationText) {
    const narration = document.createElement('div')
    narration.className = 'narration-clip'
    narration.style.width = `${Math.max(120, timelineLayout().width - 8)}px`
    narration.style.left = '4px'
    narration.textContent = 'AI 解说配音'
    narrationTrack.append(narration)
  }

  document.querySelectorAll('.video-track-layer').forEach((row) => {
    row.querySelector('.track-empty').hidden = Boolean(row.querySelector('.clip'))
  })
  audioTrack.querySelector('.track-empty').hidden = state.segments.length > 0
  narrationTrack.querySelector('.track-empty').hidden = state.mode === 'commentary' && Boolean(narrationText)
  captionTrack.querySelector('.track-empty').hidden = state.mode === 'commentary' && state.segments.length > 0
  renderRuler()
  syncClipEditor()
  updateMetrics()
  updatePlayhead()
  $('#timelineViewport').scrollLeft = scrollLeft
  $('#timelineScrollTop').scrollLeft = scrollLeft
  $('#timelineScrollBottom').scrollLeft = scrollLeft
}

const attachProxy = async (source) => {
  if (!source?.path || source.proxyUrl || state.proxyLoading) return
  state.proxyLoading = true
  setStatus('正在生成流畅预览，完成前仍可使用原片...')
  try {
    const response = await fetch(`${apiBase}/api/video-editor-proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: source.path }),
    })
    const data = await response.json()
    if (!response.ok || data.error) throw new Error(data.error || '无法创建流畅预览')
    if (state.source?.path !== source.path) return
    state.source.proxyUrl = data.url
    state.source.proxyPath = data.path
    const video = $('#preview')
    const currentTime = video.currentTime
    const wasPlaying = !video.paused
    video.src = `${apiBase}${data.url}`
    video.onloadedmetadata = () => {
      video.currentTime = Math.min(currentTime, video.duration || currentTime)
      if (wasPlaying) video.play().catch(() => {})
      updatePlayhead()
    }
    saveProject()
    setStatus('流畅预览已就绪，最终导出仍使用高清原片')
  } catch (error) {
    setStatus(`流畅预览创建失败，继续使用原片：${error.message || '未知错误'}`)
  } finally {
    state.proxyLoading = false
  }
}

const loadSource = (source) => {
  state.source = source
  $('#fileName').textContent = source.name
  $('#fileMeta').textContent = `${source.meta.width} × ${source.meta.height} · ${fmt(source.meta.duration)} · ${(source.meta.size / 1024 / 1024).toFixed(1)} MB`
  $('#fileSummary').classList.add('visible')
  $('.file-poster').style.backgroundImage = `url("${thumbnailUrl(0.5)}")`
  $('#dropzone').hidden = true
  const video = $('#preview')
  video.preload = 'auto'
  video.src = `${apiBase}${source.proxyUrl || source.url}`
  video.hidden = false
  $('#previewEmpty').hidden = true
  $('#safeZone').hidden = false
  renderSegments()
  setStatus(source.proxyUrl ? '流畅预览已启用，导出使用高清原片' : '视频已导入，正在准备流畅预览')
  saveProject()
  if (!source.proxyUrl) attachProxy(source)
}

const uploadFile = async (file) => {
  if (!file) return
  $('#uploadProgress').classList.add('visible')
  setStatus('正在导入视频...')
  try {
    const response = await fetch(`${apiBase}/api/video-editor-upload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) },
      body: file,
    })
    const data = await response.json()
    if (!response.ok || data.error) throw new Error(data.error || '导入失败')
    state.undoStack = []
    state.redoStack = []
    state.videoTrackCount = 3
    state.segments = [{ id: uid(), start: 0, end: data.meta.duration, label: '完整原片', videoTrack: 1 }]
    state.activeId = state.segments[0].id
    loadSource(data)
  } catch (error) {
    setStatus(error.message || '导入视频失败')
    alert(error.message || '导入视频失败')
  } finally {
    $('#uploadProgress').classList.remove('visible')
  }
}

const analyze = async () => {
  if (!state.source) return alert('请先导入视频')
  if (state.mode === 'manual') {
    pushHistory()
    state.segments = [{ id: uid(), start: 0, end: state.source.meta.duration, label: '完整原片', videoTrack: 1 }]
    state.activeId = state.segments[0].id
    renderSegments()
    saveProject()
    return
  }
  $('#analyzeProgress').classList.add('visible')
  $('#analyzeButton').disabled = true
  setStatus(state.mode === 'commentary' ? '正在提取解说画面和叙事节奏...' : '正在识别静音、节奏和高价值片段...')
  try {
    const response = await fetch(`${apiBase}/api/video-editor-analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: state.source.path,
        targetDuration: Number($('#targetDuration').value),
        mode: state.mode,
        goal: $('#editGoal').value.trim(),
        pace: $('#pace').value,
        removeSilence: $('#removeSilence').checked,
        keepOpening: $('#keepOpening').checked,
      }),
    })
    const data = await response.json()
    if (!response.ok || data.error) throw new Error(data.error || '分析失败')
    pushHistory()
    state.analysis = data
    state.segments = data.segments.map((segment) => ({ ...segment, id: uid(), videoTrack: 1 }))
    state.activeId = state.segments[0]?.id || null
    $('#analysisSummary').textContent = data.summary
    if (state.mode === 'commentary' && !$('#commentaryScript').value.trim()) draftCommentary()
    renderSegments()
    setStatus(`分析完成，已保留 ${state.segments.length} 个精华片段`)
    saveProject()
  } catch (error) {
    setStatus(error.message || '分析失败')
    alert(error.message || '分析失败')
  } finally {
    $('#analyzeProgress').classList.remove('visible')
    $('#analyzeButton').disabled = false
  }
}

const draftCommentary = () => {
  const style = $('#commentaryStyle').value
  const goal = $('#editGoal').value.trim()
  const lines = state.segments.map((segment, index) => `第 ${index + 1} 段（${fmt(segment.start)}）：这里呈现关键情节，说明人物行动、变化和它对后续发展的影响。`)
  $('#commentaryScript').value = `${style}解说稿\n\n开场：用一句明确的问题带观众进入内容。${goal ? `\n重点：${goal}` : ''}\n\n${lines.join('\n\n')}\n\n结尾：回到核心观点，补充自己的判断，而不是简单复述原片。`
  saveProject()
}

const setMode = (mode) => {
  state.mode = mode
  document.querySelectorAll('#modeTabs button').forEach((button) => button.classList.toggle('active', button.dataset.mode === mode))
  const manual = mode === 'manual'
  $('#aiPanel').hidden = manual
  $('#commentaryPanel').hidden = mode !== 'commentary'
  $('#workflowTitle').textContent = mode === 'commentary' ? '影视解说设置' : 'AI 精剪设置'
  $('#workflowHint').textContent = mode === 'commentary' ? '提取关键情节并重组' : '自动保留主要精华'
  setStatus(manual ? '手动模式：使用时间线上的分割、删除和排序工具' : mode === 'commentary' ? '影视解说模式：先分析关键画面，再编辑解说文案' : 'AI 精剪模式：自动提取主要精华')
  renderSegments()
  saveProject()
}

const applyCropPreview = () => {
  const video = $('#preview')
  state.cropZoom = Number($('#cropZoom').value) / 100
  state.cropX = Number($('#cropX').value) / 100
  state.cropY = Number($('#cropY').value) / 100
  video.style.objectPosition = `${state.cropX * 100}% ${state.cropY * 100}%`
  video.style.transform = `scale(${state.cropZoom})`
  video.style.transformOrigin = `${state.cropX * 100}% ${state.cropY * 100}%`
  $('#cropZoomValue').textContent = `${Math.round(state.cropZoom * 100)}%`
  $('#cropXValue').textContent = `${Math.round(state.cropX * 100)}%`
  $('#cropYValue').textContent = `${Math.round(state.cropY * 100)}%`
  $('#focusX').value = String(Math.round(state.cropX * 100))
  saveProject()
}

const setAspect = (aspect) => {
  state.aspectRatio = aspect
  const shell = $('#previewShell')
  shell.className = `preview-shell ${aspect === '9:16' ? 'portrait' : aspect === '1:1' ? 'square' : 'landscape'}`
  $('#framingPanel').style.opacity = aspect === '9:16' ? '1' : '0.55'
  applyCropPreview()
}

const splitAtPlayhead = () => {
  if (!state.source || !state.segments.length) return
  const time = $('#preview').currentTime
  let index = state.segments.findIndex((segment) => segment.id === state.activeId && time > segment.start + 0.04 && time < segment.end - 0.04)
  if (index < 0) index = state.segments.findIndex((segment) => time > segment.start + 0.04 && time < segment.end - 0.04)
  if (index < 0) {
    setStatus('请先在片段内部点击分割位置，再按“分割”')
    return
  }
  pushHistory()
  const original = state.segments[index]
  const left = { ...original, id: uid(), end: time, label: `${original.label} A` }
  const right = { ...original, id: uid(), start: time, label: `${original.label} B` }
  state.segments.splice(index, 1, left, right)
  state.activeId = right.id
  renderSegments()
  saveProject()
  setStatus(`已在 ${fmt(time)} 分割片段`)
}

const duplicateSelected = () => {
  const index = state.segments.findIndex((segment) => segment.id === state.activeId)
  if (index < 0) return
  pushHistory()
  const copy = { ...state.segments[index], id: uid(), label: `${state.segments[index].label} 副本` }
  state.segments.splice(index + 1, 0, copy)
  state.activeId = copy.id
  renderSegments()
  saveProject()
  setStatus('片段已复制')
}

const addAtPlayhead = () => {
  if (!state.source) return
  pushHistory()
  const start = $('#preview').currentTime
  const segment = { id: uid(), start, end: Math.min(start + 5, state.source.meta.duration), label: `新增片段 ${state.segments.length + 1}`, videoTrack: 1 }
  state.segments.push(segment)
  state.activeId = segment.id
  renderSegments()
  saveProject()
  setStatus('已加入当前位置之后的 5 秒片段')
}

const restoreFullVideo = () => {
  if (!state.source) return
  pushHistory()
  state.segments = [{ id: uid(), start: 0, end: state.source.meta.duration, label: '完整原片', videoTrack: 1 }]
  state.activeId = state.segments[0].id
  renderSegments()
  saveProject()
  setStatus('已恢复完整原片，可撤销')
}

const exportVideo = async () => {
  if (!state.source || !state.segments.length) return alert('请先导入视频并保留至少一个片段')
  const startedAt = Date.now()
  $('#exportButton').disabled = true
  $('#exportButton').textContent = '导出中'
  $('#exportProgress').classList.add('visible')
  const timer = window.setInterval(() => { $('#exportElapsed').textContent = `正在导出 ${Math.floor((Date.now() - startedAt) / 1000)} 秒` }, 1000)
  setStatus('正在使用高清原片合成 MP4，长视频需要一些时间...')
  try {
    const response = await fetch(`${apiBase}/api/video-editor-export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        path: state.source.path,
        segments: state.segments,
        aspectRatio: state.aspectRatio,
        focusX: state.cropX,
        focusY: state.cropY,
        cropZoom: state.cropZoom,
        title: state.source.name,
        quality: 'standard',
        muteOriginal: state.muteOriginal,
        commentaryScript: $('#commentaryScript').value,
        narrationEnabled: !state.muteNarration && $('#narrationEnabled').checked && state.mode === 'commentary',
      }),
    })
    const data = await response.json()
    if (!response.ok || data.error) throw new Error(data.error || '导出失败')
    $('#resultPanel').classList.add('visible')
    $('#resultVideo').src = `${apiBase}${data.url}`
    $('#downloadLink').href = `${apiBase}${data.url}`
    $('#downloadLink').download = data.outputPath.split('/').pop()
    $('#resultPath').textContent = `已保存：${data.outputPath}`
    $('#resultPanel').scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    setStatus(`导出完成，用时 ${Math.max(1, Math.round((Date.now() - startedAt) / 1000))} 秒`)
  } catch (error) {
    const message = error.message || '导出失败'
    setStatus(`导出失败：${message}`)
    alert(`导出失败：${message}`)
  } finally {
    window.clearInterval(timer)
    $('#exportProgress').classList.remove('visible')
    $('#exportButton').disabled = false
    $('#exportButton').textContent = '导出 MP4'
  }
}

const scrubTimeline = (event) => {
  if (!state.source || event.target.closest('.clip')) return
  event.preventDefault()
  const ruler = $('#ruler')
  const rect = ruler.getBoundingClientRect()
  const update = (moveEvent) => {
    const x = Math.max(0, Math.min(rect.width, moveEvent.clientX - rect.left))
    seekEditTime(xToEditTime(x))
  }
  update(event)
  const finish = () => {
    window.removeEventListener('pointermove', update)
    window.removeEventListener('pointerup', finish)
  }
  window.addEventListener('pointermove', update)
  window.addEventListener('pointerup', finish, { once: true })
}

const dragPlayhead = (event) => {
  if (!state.source || !state.segments.length) return
  event.preventDefault()
  event.stopPropagation()
  const ruler = $('#ruler')
  const update = (moveEvent) => {
    const rect = ruler.getBoundingClientRect()
    const x = Math.max(0, Math.min(rect.width, moveEvent.clientX - rect.left))
    seekEditTime(xToEditTime(x))
  }
  update(event)
  const finish = () => {
    window.removeEventListener('pointermove', update)
    window.removeEventListener('pointerup', finish)
    saveProject()
  }
  window.addEventListener('pointermove', update)
  window.addEventListener('pointerup', finish, { once: true })
}

const panTimeline = (event) => {
  if (event.button !== 0 || event.target.closest('button, input, .clip, .playhead, .ruler')) return
  const viewport = $('#timelineViewport')
  const startX = event.clientX
  const startScroll = viewport.scrollLeft
  let moved = false
  const move = (moveEvent) => {
    const delta = moveEvent.clientX - startX
    if (!moved && Math.abs(delta) < 4) return
    moved = true
    event.preventDefault()
    viewport.scrollLeft = startScroll - delta
  }
  const finish = () => {
    window.removeEventListener('pointermove', move)
    window.removeEventListener('pointerup', finish)
    if (moved) setStatus('时间线位置已移动')
  }
  window.addEventListener('pointermove', move)
  window.addEventListener('pointerup', finish, { once: true })
}

const applyClipEditor = () => {
  const segment = state.segments.find((item) => item.id === state.activeId)
  if (!segment || !state.source) return
  const start = Math.max(0, Number($('#clipStart').value))
  const end = Math.min(state.source.meta.duration, Number($('#clipEnd').value))
  if (!(end > start + 0.1)) return alert('结束时间必须晚于开始时间')
  pushHistory()
  segment.start = start
  segment.end = end
  segment.label = $('#clipLabel').value.trim() || segment.label
  renderSegments()
  saveProject()
  setStatus('片段范围已更新')
}

document.querySelectorAll('[data-page]').forEach((button) => { button.onclick = () => { location.href = button.dataset.page } })
document.querySelectorAll('#modeTabs button').forEach((button) => { button.onclick = () => setMode(button.dataset.mode) })
$('#dropzone').onclick = () => $('#fileInput').click()
$('#replaceButton').onclick = () => $('#fileInput').click()
$('#fileInput').onchange = (event) => uploadFile(event.target.files[0])
$('#dropzone').ondragover = (event) => { event.preventDefault(); $('#dropzone').classList.add('dragging') }
$('#dropzone').ondragleave = () => $('#dropzone').classList.remove('dragging')
$('#dropzone').ondrop = (event) => { event.preventDefault(); $('#dropzone').classList.remove('dragging'); uploadFile(event.dataTransfer.files[0]) }

$('#ruler').onpointerdown = scrubTimeline
$('#track').onpointerdown = scrubTimeline
$('#playhead').onpointerdown = dragPlayhead
$('#timelineStack').onpointerdown = panTimeline
$('#analyzeButton').onclick = analyze
$('#draftScriptButton').onclick = draftCommentary
$('#splitButton').onclick = splitAtPlayhead
$('#deleteSelectedButton').onclick = () => deleteSegment(state.activeId)
$('#duplicateButton').onclick = duplicateSelected
$('#restoreButton').onclick = restoreFullVideo
$('#addButton').onclick = addAtPlayhead
$('#undoButton').onclick = () => restoreHistory(state.undoStack, state.redoStack, '已撤销')
$('#redoButton').onclick = () => restoreHistory(state.redoStack, state.undoStack, '已重做')
$('#exportButton').onclick = exportVideo
$('#applyClipButton').onclick = applyClipEditor

$('#timelineZoom').oninput = (event) => {
  const viewport = $('#timelineViewport')
  const ratio = viewport.scrollWidth > viewport.clientWidth ? viewport.scrollLeft / (viewport.scrollWidth - viewport.clientWidth) : 0
  state.timelineScale = Number(event.target.value)
  renderSegments()
  const maxScroll = Math.max(0, viewport.scrollWidth - viewport.clientWidth)
  viewport.scrollLeft = ratio * maxScroll
  $('#timelineScrollTop').scrollLeft = viewport.scrollLeft
  $('#timelineScrollBottom').scrollLeft = viewport.scrollLeft
  saveProject()
}

let syncingScroll = false
$('#timelineViewport').onscroll = () => {
  if (syncingScroll) return
  syncingScroll = true
  $('#timelineScrollTop').scrollLeft = $('#timelineViewport').scrollLeft
  $('#timelineScrollBottom').scrollLeft = $('#timelineViewport').scrollLeft
  syncingScroll = false
}
$('#timelineScrollTop').onscroll = () => {
  if (syncingScroll) return
  syncingScroll = true
  $('#timelineViewport').scrollLeft = $('#timelineScrollTop').scrollLeft
  $('#timelineScrollBottom').scrollLeft = $('#timelineScrollTop').scrollLeft
  syncingScroll = false
}
$('#timelineScrollBottom').onscroll = () => {
  if (syncingScroll) return
  syncingScroll = true
  $('#timelineViewport').scrollLeft = $('#timelineScrollBottom').scrollLeft
  $('#timelineScrollTop').scrollLeft = $('#timelineScrollBottom').scrollLeft
  syncingScroll = false
}

$('#aspectRatio').onchange = (event) => setAspect(event.target.value)
$('#focusX').oninput = () => { $('#cropX').value = $('#focusX').value; applyCropPreview() }
;['cropZoom', 'cropX', 'cropY'].forEach((id) => { $(`#${id}`).oninput = applyCropPreview })
$('#resetCropButton').onclick = () => {
  $('#cropZoom').value = '100'
  $('#cropX').value = '50'
  $('#cropY').value = '50'
  applyCropPreview()
  setStatus('画面裁切已重置')
}

$('#preview').ontimeupdate = () => {
  if (!state.source) return
  const video = $('#preview')
  let activeIndex = state.segments.findIndex((segment) => segment.id === state.activeId && video.currentTime >= segment.start - 0.05 && video.currentTime <= segment.end + 0.08)
  if (activeIndex < 0) activeIndex = state.segments.findIndex((segment) => video.currentTime >= segment.start - 0.05 && video.currentTime <= segment.end + 0.08)
  if (activeIndex < 0) return
  if (state.activeId !== state.segments[activeIndex].id) {
    state.activeId = state.segments[activeIndex].id
    document.querySelectorAll('.video-track-layer .clip').forEach((clip) => clip.classList.toggle('active', clip.dataset.id === state.activeId))
    syncClipEditor()
  }
  updatePlayhead()
  if (!video.paused && video.currentTime >= state.segments[activeIndex].end - 0.04) {
    const next = state.segments[activeIndex + 1]
    if (next) {
      state.activeId = next.id
      video.currentTime = next.start
    } else {
      video.pause()
    }
  }
}

document.querySelectorAll('.track-mute').forEach((button) => {
  button.onclick = () => {
    const isOriginal = button.dataset.track === 'original'
    if (isOriginal) {
      state.muteOriginal = !state.muteOriginal
      $('#preview').muted = state.muteOriginal
      button.classList.toggle('active', state.muteOriginal)
    } else {
      state.muteNarration = !state.muteNarration
      button.classList.toggle('active', state.muteNarration)
    }
    setStatus(isOriginal ? (state.muteOriginal ? '原声音频已静音' : '原声音频已恢复') : (state.muteNarration ? '解说配音已静音' : '解说配音已恢复'))
  }
})

$('#commentaryScript').oninput = () => { renderSegments(); saveProject() }
$('#editGoal').oninput = saveProject

document.addEventListener('keydown', (event) => {
  const target = event.target
  const editingText = target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || target instanceof HTMLSelectElement
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z') {
    event.preventDefault()
    if (event.shiftKey) restoreHistory(state.redoStack, state.undoStack, '已重做')
    else restoreHistory(state.undoStack, state.redoStack, '已撤销')
    return
  }
  if (editingText) return
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
    event.preventDefault()
    splitAtPlayhead()
  } else if (event.key === 'Delete' || event.key === 'Backspace') {
    event.preventDefault()
    deleteSegment(state.activeId)
  } else if (event.code === 'Space') {
    event.preventDefault()
    const video = $('#preview')
    if (video.paused) video.play().catch(() => {})
    else video.pause()
  } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
    event.preventDefault()
    const amount = event.shiftKey ? 5 : 1
    $('#preview').currentTime = Math.max(0, Math.min(state.source?.meta?.duration || 0, $('#preview').currentTime + (event.key === 'ArrowRight' ? amount : -amount)))
  }
})

try {
  document.querySelectorAll('.video-track-layer').forEach(configureVideoTrackDrop)
  const saved = JSON.parse(localStorage.getItem('cowart-video-editor-project') || 'null')
  if (saved) {
    state.timelineScale = Math.max(6, Math.min(30, Number(saved.timelineScale || 14)))
    $('#timelineZoom').value = String(state.timelineScale)
    if (saved.editGoal) $('#editGoal').value = saved.editGoal
    if (saved.commentaryScript) $('#commentaryScript').value = saved.commentaryScript
    state.videoTrackCount = Math.max(3, Math.min(8, Number(saved.videoTrackCount || 3)))
    state.segments = (saved.segments || []).map((segment) => ({
      ...segment,
      videoTrack: Math.max(1, Math.min(state.videoTrackCount, Number(segment.videoTrack) || 1)),
    }))
    state.activeId = saved.activeId || state.segments[0]?.id || null
    $('#cropZoom').value = String(Math.round(Number(saved.cropZoom || 1) * 100))
    $('#cropX').value = String(Math.round(Number(saved.cropX ?? 0.5) * 100))
    $('#cropY').value = String(Math.round(Number(saved.cropY ?? 0.5) * 100))
    if (saved.source?.path) loadSource(saved.source)
    setMode(saved.mode || 'highlights')
    $('#aspectRatio').value = saved.aspectRatio || '16:9'
    setAspect($('#aspectRatio').value)
  } else {
    renderSegments()
  }
} catch {
  renderSegments()
}
