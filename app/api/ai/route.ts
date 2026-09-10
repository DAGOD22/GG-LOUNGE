import { gateway } from '@ai-sdk/gateway'
import { generateText } from 'ai'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  const { prompt, model = 'alibaba/qwen3.5-flash' } = await request.json()
  if (typeof prompt !== 'string' || !prompt.trim()) return NextResponse.json({ error: 'Prompt required' }, { status: 400 })
  try {
    const candidates = [String(model), 'alibaba/qwen3.5-flash', 'alibaba/qwen-3-14b'].filter((value, index, list) => list.indexOf(value) === index)
    let lastError: unknown
    for (const candidate of candidates) {
      try {
        const result = await generateText({ model: gateway(candidate), system: 'You are GG-Lounge Studio, a concise and creative assistant. Help with writing, planning, coding, image prompts, and video concepts. Never claim to have generated a file unless you actually have.', prompt: prompt.slice(0, 12000) })
        return NextResponse.json({ text: result.text, model: candidate })
      } catch (error) { lastError = error }
    }
    console.error('[v0] AI generation failed', lastError)
    return NextResponse.json({ error: 'AI Gateway is not connected to this preview yet. Publish with the project AI Gateway connection, then retry.' }, { status: 503 })
  } catch (error) {
    console.error('[v0] AI request failed', error)
    return NextResponse.json({ error: 'Invalid AI request.' }, { status: 400 })
  }
}
