import axios from 'axios'
import sharp from 'sharp'
import { GoogleGenAI } from '@google/genai'
import Anthropic from '@anthropic-ai/sdk'
import { env } from '../config/env'
import { uploadFile } from './storage'

// ── Background Removal (remove.bg) ──

export async function removeBackground(imageUrl: string): Promise<Buffer> {
  if (!env.REMOVEBG_API_KEY) throw new Error('REMOVEBG_API_KEY not configured')

  const res = await axios.post(
    'https://api.remove.bg/v1.0/removebg',
    { image_url: imageUrl, size: 'auto', format: 'png' },
    {
      headers: { 'X-Api-Key': env.REMOVEBG_API_KEY },
      responseType: 'arraybuffer',
    }
  )

  return Buffer.from(res.data)
}

// ── Image Polish (Sharp — free, local) ──

export async function polishImage(imageBuffer: Buffer): Promise<Buffer> {
  return sharp(imageBuffer)
    .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
    .sharpen({ sigma: 1.2 })
    .modulate({ brightness: 1.05, saturation: 1.1 })
    .webp({ quality: 90 })
    .toBuffer()
}

// ── Scene Generation (Google Gemini) ──

export type GenerateMode = 'create' | 'extract' | 'collage'

export async function generateScene(productImageUrl: string, prompt: string, count: number = 3, mode: GenerateMode = 'create'): Promise<Buffer[]> {
  if (!env.GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY not configured')

  const productRes = await axios.get(productImageUrl, { responseType: 'arraybuffer' })
  const base64Image = Buffer.from(productRes.data).toString('base64')

  const ai = new GoogleGenAI({ apiKey: env.GOOGLE_AI_API_KEY })

  let finalPrompt: string
  if (mode === 'extract') {
    finalPrompt = `This image is a supplier product collage or composite showing multiple views/angles of a product. Identify every distinct angle or view of the product shown (front, back, inside, side, bottom, etc.). For each one, generate a separate clean standalone professional product photo — no text, no circles, no annotations, no overlays, just the product from that angle on a clean background. ${prompt}`
  } else if (mode === 'collage') {
    finalPrompt = `Generate a single image that is a professional collage/composite showing this product in ${count} different scenes or angles side by side. Professional product photography style. ${prompt}`
  } else {
    finalPrompt = count > 1
      ? `Generate ${count} separate images. ${prompt}`
      : prompt
  }

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [
      { inlineData: { data: base64Image, mimeType: 'image/png' } },
      finalPrompt,
    ],
  })

  const candidates = (response as any).candidates
  if (!candidates || candidates.length === 0) throw new Error('Gemini returned no candidates')

  const images: Buffer[] = []
  for (const candidate of candidates) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        const imageBuffer = Buffer.from(part.inlineData.data, 'base64')
        const optimized = await sharp(imageBuffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 90 })
          .toBuffer()
        images.push(optimized)
      }
    }
  }

  if (images.length === 0) throw new Error('Gemini response did not contain any images')
  return images
}

// ── Text-to-image (no source photo — logos, favicons, category art) ──

export async function generateFromPrompt(prompt: string, count: number = 1): Promise<Buffer[]> {
  if (!env.GOOGLE_AI_API_KEY) throw new Error('GOOGLE_AI_API_KEY not configured')

  const ai = new GoogleGenAI({ apiKey: env.GOOGLE_AI_API_KEY })
  const finalPrompt = count > 1 ? `Generate ${count} separate images. ${prompt}` : prompt

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash-image',
    contents: [finalPrompt],
  })

  const candidates = (response as any).candidates
  if (!candidates || candidates.length === 0) throw new Error('Gemini returned no candidates')

  const images: Buffer[] = []
  for (const candidate of candidates) {
    for (const part of candidate.content.parts) {
      if (part.inlineData) {
        const imageBuffer = Buffer.from(part.inlineData.data, 'base64')
        const optimized = await sharp(imageBuffer)
          .resize(1200, 1200, { fit: 'inside', withoutEnlargement: true })
          .webp({ quality: 90 })
          .toBuffer()
        images.push(optimized)
      }
    }
  }

  if (images.length === 0) throw new Error('Gemini response did not contain any images')
  return images
}

export async function generateFromPromptAndUpload(prompt: string, count: number = 1): Promise<string[]> {
  const images = await generateFromPrompt(prompt, count)
  const urls = await Promise.all(
    images.map((buf, i) => uploadFile(buf, `generated-${Date.now()}-${i}.webp`, 'image/webp', 'studio'))
  )
  return urls
}

// ── Combined pipeline helpers ──

export async function removeBackgroundAndUpload(imageUrl: string): Promise<string> {
  const noBgBuffer = await removeBackground(imageUrl)
  return uploadFile(noBgBuffer, `nobg-${Date.now()}.png`, 'image/png', 'studio')
}

export async function polishAndUpload(imageUrl: string): Promise<string> {
  const res = await axios.get(imageUrl, { responseType: 'arraybuffer' })
  const polished = await polishImage(Buffer.from(res.data))
  return uploadFile(polished, `polished-${Date.now()}.webp`, 'image/webp', 'studio')
}

export async function generateSceneAndUpload(imageUrl: string, prompt: string, count: number = 3, mode: GenerateMode = 'create'): Promise<string[]> {
  const images = await generateScene(imageUrl, prompt, count, mode)
  const urls = await Promise.all(
    images.map((buf, i) => uploadFile(buf, `scene-${Date.now()}-${i}.webp`, 'image/webp', 'studio'))
  )
  return urls
}

// ── AI Scene Suggestions (Claude Vision) ──

export interface SceneSuggestion {
  label: string
  prompt: string
}

export async function suggestScenes(imageUrl: string): Promise<SceneSuggestion[]> {
  if (!env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured')

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY })

  const message = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'image',
          source: { type: 'url', url: imageUrl },
        },
        {
          type: 'text',
          text: `You are a product photography director. Look at this product image and identify what the product is.

Suggest exactly 6 background scenes where this SPECIFIC product would look natural, appealing, and professionally photographed for an e-commerce store.

For each suggestion provide:
- "label": a short 2-3 word name (e.g. "Café table", "Beach towel")
- "prompt": a description of ONLY the background/surface/setting (do NOT mention the product). This will be used as an AI image generator prompt. Describe the surface, lighting, surroundings, mood. Keep it under 30 words.

Think about where customers would actually USE or DISPLAY this product. Be specific to this product type — don't give generic suggestions.

Return ONLY a valid JSON array, no other text:
[{"label": "...", "prompt": "..."}, ...]`,
        },
      ],
    }],
  })

  const text = message.content[0].type === 'text' ? message.content[0].text : ''
  const match = text.match(/\[[\s\S]*\]/)
  if (!match) throw new Error('AI returned unexpected format')

  return JSON.parse(match[0]) as SceneSuggestion[]
}
