# GG-GPT providers

GG-GPT answers from a chain of providers, not from one API. The chain is ordered
per request, and a provider that is not configured is simply not in the chain —
there is no "missing key" error path to debug.

## Adding a key

Set any of these in the deployment environment. Nothing else has to change: the
chain, the model picker in `/gg-gpt` and the vision capability list are all
derived from what is present.

| Variable | Provider | What you get |
| --- | --- | --- |
| `ZAI_API_KEY` | Z.ai (GLM) | `glm-4.7-flash` for text/code, `glm-4.6v-flash` for images. Strongest free coding model in the chain. |
| `OPENROUTER_API_KEY` | OpenRouter | `meta-llama/llama-3.3-70b-instruct:free` |
| `GG_GPT_KEY` | Z.ai, as a fallback name | Used when `ZAI_API_KEY` is absent, so one variable can mean "the keyed provider". |
| `GROQ_API_KEY` | Groq | `llama-3.3-70b-versatile` — fastest first token |
| `HUGGINGFACE_API_KEY` | Hugging Face | `Llama-3.1-8B-Instruct` |
| `ZAI_BASE_URL` | Z.ai | Override the base. Default `https://api.z.ai`. |
| `ZAI_MODEL` / `ZAI_VISION_MODEL` | Z.ai | Override the model ids. Keep them **lowercase** — the free tier is selected by the lowercase alias, and `GLM-4.7-Flash` is a paid id that answers 402. |

Without any key the chain falls back to the keyless paths (Pollinations,
Hack Club). Those work, but they cannot see images and they are rate-limited
harder than a keyed provider.

## The two things that are easy to get wrong

**The Z.ai host is `api.z.ai`, not `z.ai`.** The documented OpenAI-compatible
base is `https://api.z.ai/api/paas/v4`, with chat at `/chat/completions`. A
request to `https://z.ai/api/...` answers 404, which looks exactly like a
rejected key. `zaiEndpoint()` in `lib/gg-gpt/engine.ts` builds the URL and is
covered by a test, including the case where `ZAI_BASE_URL` already ends in
`/paas/v4`.

**`glm-4.7-flash` is a text model.** Z.ai's vision ids carry a `v`
(`glm-4.6v-flash`). The provider sends an image-bearing turn to the vision model
and everything else to the text model, because the text model rejects the
content-parts request shape outright.

## How the chain is ordered

`orderProviders()` in `lib/gg-gpt/engine.ts` takes the request's task and adds
each provider's affinity for that task to its base tier:

| Task | Ordered for |
| --- | --- |
| `code` | Z.ai first (its affinity is +8), then the keyless paths |
| `long` | Z.ai (+6) — long single-shot rewrites |
| `vision` | Only providers with a real vision model; the rest are dropped, not asked to guess |
| `chat` | Base tiers: Z.ai 96, OpenRouter 100, Groq 95, Hugging Face 90, Pollinations 75/55/50/45, Hack Club 40 |

The route works the task out from the request (`task` field, then an image
attachment, then the wording) and a wrong guess only costs a slightly worse
ordering — the chain still answers.

## Code sandbox

`POST /api/gg-gpt/sandbox` does not execute anything. It assembles a document
from a model reply (fences split by language, TypeScript annotations stripped)
and the browser runs it in an iframe with `sandbox="allow-scripts"` only, plus an
in-document CSP of `connect-src 'none'`. See `lib/gg-gpt/sandbox.ts`.
