import axios from 'axios'
import sharp from 'sharp'
import { uploadFile } from '../services/storage'

// Supplier product descriptions (CJ's `description`, AliExpress's `detail`) are raw HTML that
// often embeds real, useful images inline — size charts, feature callouts, material close-ups —
// via <img> tags or CSS background-image, separate from the "official" gallery images. Some
// suppliers lazy-load these with data-src/data-original holding the real URL and src holding a
// placeholder pixel, so src alone can't be trusted as the only source.
function extractAttr(tag: string, name: string): string | undefined {
  const re = new RegExp(`${name}\\s*=\\s*["']([^"']+)["']`, 'i')
  return re.exec(tag)?.[1]
}

const fixUrl = (u: string) => (u.startsWith('//') ? `https:${u}` : u)

export function extractDescriptionImages(html: string, max = 20): string[] {
  if (!html) return []
  const urls: string[] = []

  const imgTagRegex = /<img\b[^>]*>/gi
  let match: RegExpExecArray | null
  while ((match = imgTagRegex.exec(html))) {
    const tag = match[0]
    const src = extractAttr(tag, 'data-src') ?? extractAttr(tag, 'data-original') ?? extractAttr(tag, 'src')
    if (src) urls.push(src)
  }

  const bgRegex = /background(?:-image)?\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/gi
  while ((match = bgRegex.exec(html))) {
    urls.push(match[1])
  }

  const cleaned = urls
    .map((u) => fixUrl(u.trim()))
    .filter((u) => /^https:\/\//.test(u))
    .filter((u) => !/1x1|blank\.gif|spacer\.gif|pixel\.(gif|png)/i.test(u))

  return Array.from(new Set(cleaned)).slice(0, max)
}

// Description images are almost always large (often several MB — they're meant to be viewed
// full-width in a scrolling description, not thumbnailed), and sometimes shaped as multi-panel
// infographics that are much taller/wider than a normal product photo. Size alone isn't a
// reason to drop them — we compress/resize them the same way the admin's own image upload does
// (resize to fit 1200x1200, re-encode as WebP, host on our own storage) so a multi-MB original
// becomes a small, fast, consistently-sized gallery image. Shape is the real dealbreaker: a
// tall stacked infographic still looks broken in a square/4:3 gallery slot no matter how small
// the file is, so those are skipped rather than resized.
const MIN_DIMENSION = 150 // px — filters out tiny icons/dividers
const MAX_ASPECT_RATIO = 2.2 // longest side / shortest side — filters out tall stacked infographics
const MAX_DOWNLOAD_BYTES = 8 * 1024 * 1024 // guard against pathological originals, not a quality bar

async function processDescriptionImage(url: string): Promise<string | null> {
  try {
    const res = await axios.get<ArrayBuffer>(url, {
      responseType: 'arraybuffer',
      timeout: 10000,
      maxContentLength: MAX_DOWNLOAD_BYTES,
    })
    const buffer = Buffer.from(res.data)

    const meta = await sharp(buffer).metadata()
    if (!meta.width || !meta.height) return null
    if (meta.width < MIN_DIMENSION || meta.height < MIN_DIMENSION) return null
    if (Math.max(meta.width / meta.height, meta.height / meta.width) > MAX_ASPECT_RATIO) return null

    const processed = await sharp(buffer)
      .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer()

    return await uploadFile(processed, `${Date.now()}.webp`, 'image/webp', 'products')
  } catch {
    return null // couldn't fetch/process — safer to skip than risk a broken image
  }
}

// Compresses and re-hosts each candidate description image that has a usable shape, in
// parallel — these hit generic supplier CDNs (not the rate-limited CJ/AliExpress product
// APIs), so parallel requests are safe here. Returns the final hosted URLs.
export async function processDescriptionImages(urls: string[]): Promise<string[]> {
  const results = await Promise.allSettled(urls.map(processDescriptionImage))
  return results
    .filter((r): r is PromiseFulfilledResult<string | null> => r.status === 'fulfilled')
    .map((r) => r.value)
    .filter((url): url is string => url != null)
}

// Removes embedded images from description HTML once they've been pulled into the product's
// image gallery, so they aren't shown twice (once in the gallery, once — however imperfectly —
// inline in the text).
export function stripDescriptionImages(html: string): string {
  if (!html) return html
  return html
    .replace(/<img\b[^>]*>/gi, '')
    .replace(/background(?:-image)?\s*:\s*url\([^)]*\)\s*;?/gi, '')
}
