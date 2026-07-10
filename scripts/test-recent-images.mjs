import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

const generatedRoot = path.join(os.homedir(), '.codex', 'generated_images')
const baseUrl = process.env.COWART_URL || 'http://127.0.0.1:43219'

async function findExecImages(directory, depth = 2) {
  if (depth < 0) return []
  let entries
  try {
    entries = await fs.readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const images = []
  for (const entry of entries) {
    const filePath = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      images.push(...await findExecImages(filePath, depth - 1))
    } else if (entry.isFile() && /^exec-[a-f0-9-]+\.(?:png|jpe?g|webp)$/i.test(entry.name)) {
      images.push(filePath)
    }
  }
  return images
}

const execImages = await findExecImages(generatedRoot)
if (execImages.length === 0) {
  console.log('SKIP: no exec-* generated image exists yet')
  process.exit(0)
}

const response = await fetch(`${baseUrl}/api/recent-images`, { cache: 'no-store' })
if (!response.ok) throw new Error(`Recent images endpoint returned ${response.status}`)
const payload = await response.json()
const returnedPaths = new Set((payload.images || []).map((image) => image.path))
const visibleExecImage = execImages.some((filePath) => returnedPaths.has(filePath))

if (!visibleExecImage) {
  throw new Error('The recent images endpoint filtered out every exec-* Codex generated image')
}

console.log(`PASS: recent images includes an exec-* Codex image (${payload.images.length} returned)`)
