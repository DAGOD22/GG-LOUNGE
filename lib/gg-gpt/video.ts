/**
 * Keyless video generation.
 *
 * The honest situation on a zero-budget tier: there is no free, keyless
 * text-to-video model that reliably answers from a datacenter IP. Every service
 * that can actually synthesise motion (Veo, Sora, Kling, Runway) wants a key and
 * money. So this module does the two things that *are* possible for free, in
 * order of quality:
 *
 *   1. Ask any keyless AI-video host that is configured or discovered. If one
 *      ever answers, use it — the result is checked, not assumed.
 *   2. Otherwise build a real video from generated keyframes: several AI frames
 *      of the same scene, blended with a Ken Burns pan/zoom and cross-fades,
 *      encoded in the browser with MediaRecorder (canvas → WebM). That is a
 *      genuine video file the user can download and play, made with zero keys,
 *      and it moves.
 *
 * What it will never do is pretend: `videoPlan()` reports which of those paths
 * produced the result, and the UI says so.
 */

import { imageUrl, enhanceImagePrompt, type ImageStyle } from "./engine";

export interface VideoShot {
  /** The prompt for this keyframe, already style-enhanced where relevant. */
  prompt: string;
  url: string;
  /** Camera move for the browser renderer. */
  move: "zoom-in" | "zoom-out" | "pan-left" | "pan-right" | "tilt-up";
}

export interface VideoPlan {
  kind: "video" | "image";
  /** Present for direct-link AI hosts; otherwise rendered client-side. */
  url: string;
  /** Keyframes, for the browser renderer. */
  frames: VideoShot[];
  /** Human-readable account of what this actually is. */
  note: string;
  width: number;
  height: number;
  /** Seconds the client should render. */
  durationSec: number;
  fps: number;
  /** True when the browser must assemble the frames into a file. */
  renderInBrowser: boolean;
}

/** Camera moves, cycled so a montage does not feel like one repeated effect. */
const MOVES = ["zoom-in", "pan-right", "zoom-out", "pan-left", "tilt-up"] as const;

/** Beat-sheet scaffolding: a shot list is what turns one image into a film. */
const BEATS = [
  "wide establishing shot, environment visible, sense of scale",
  "medium shot of the subject, motion implied, mid-action",
  "close detail shot, texture and light, shallow depth of field",
  "dramatic wide shot, low angle, atmosphere and depth",
];

/**
 * Plan a video for a prompt.
 *
 * `hostUrl` lets a deployment plug in any keyless video endpoint it finds
 * (see /api/gg-gpt/diag?probe=video). It is only trusted after a HEAD/GET
 * check by the caller; here it simply becomes the fast path.
 */
export function videoPlan(
  prompt: string,
  opts: { width?: number; height?: number; style?: ImageStyle; hostUrl?: string | null; frames?: number } = {},
): VideoPlan {
  const subject = prompt.replace(/\s+/g, " ").trim().slice(0, 400);
  const width = opts.width ?? 768;
  const height = opts.height ?? 768;
  const count = Math.max(2, Math.min(opts.frames ?? 4, 4));

  if (opts.hostUrl) {
    return {
      kind: "video",
      url: opts.hostUrl,
      frames: [],
      note: "Rendered by a keyless AI video host.",
      width,
      height,
      durationSec: 6,
      fps: 24,
      renderInBrowser: false,
    };
  }

  // Keyframe prompts: same subject, different framing, so the montage reads as
  // one scene rather than four unrelated pictures.
  const frames: VideoShot[] = BEATS.slice(0, count).map((beat, i) => ({
    prompt: `${subject}, ${beat}, cinematic film still, ${BEATS.length > 1 ? `shot ${i + 1} of ${count}` : ""}`,
    url: imageUrl(`${subject}, ${beat}, cinematic film still`, {
      width,
      height,
      seed: hashSeed(subject) + i * 7919,
      style: opts.style ?? "cinematic",
    }),
    move: MOVES[i % MOVES.length],
  }));

  return {
    kind: "video",
    url: frames[0]?.url ?? "",
    frames,
    note:
      "No free keyless text-to-video model responds reliably, so this is assembled in your browser from " +
      `${frames.length} generated keyframes with camera moves and cross-fades — a real, downloadable video file.`,
    width,
    height,
    durationSec: 6,
    fps: 24,
    renderInBrowser: true,
  };
}

/** Stable seed per prompt so a re-run of the same idea stays coherent. */
function hashSeed(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h) % 1_000_000;
}

/** One-line description shown in chat under the player. */
export function describeVideoPlan(plan: VideoPlan, prompt: string): string {
  const head = `**${prompt}** — ${plan.durationSec}s, ${plan.width}×${plan.height}, ${plan.fps} fps.`;
  return `${head}\n\n${plan.note}`;
}

/** The prompt-enhancer is worth exposing for tests. */
export { enhanceImagePrompt };
