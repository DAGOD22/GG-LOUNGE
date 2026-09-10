import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { prompt, model = 'google/gemini-2.5-flash-lite' } = await request.json()
  if (typeof prompt !== 'string' || !prompt.trim()) return NextResponse.json({ error: 'Prompt required' }, { status: 400 })
  try {
    const result = await generateText({ model: gateway(String(model)), system: 'You are GG-Lounge Studio, a concise and creative assistant. Help with writing, planning, coding, image prompts, and video concepts. Never claim to have generated a file unless you actually have.', prompt: prompt.slice(0, 12000) })
    return NextResponse.json({ text: result.text })
  } catch (error) {
    console.error('[v0] AI generation failed', error)
    return NextResponse.json({ error: 'The selected model is unavailable right now.' }, { status: 503 })
  }
}
