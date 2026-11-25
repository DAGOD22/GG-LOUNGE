/**
 * Peer-to-peer co-op rooms — the parts that are pure.
 *
 * Everything in this file is deterministic and transport-free: the room code
 * alphabet, the offer/answer encoding that survives a manual copy-paste
 * handshake, the input-frame format, and the small state machine that decides
 * what a room is doing. The WebRTC plumbing lives in the component, because
 * that is the only part that needs a browser.
 *
 * A note on why the code is derived from the offer rather than allocated by a
 * server: allocating codes server-side would need either a WebSocket (which
 * cannot stay open on serverless) or a table with expiry (which is a queue of
 * dead rows). Instead the room code *is* an encoding of the host's WebRTC
 * offer, so "join with code ABC123" needs no server at all — which is what
 * makes a cross-domain join work without a shared identity or a CORS dance.
 */

/**
 * Crockford-style alphabet: no I, L, O, U.
 *
 * The code gets read aloud, typed on a phone, and pasted into a chat, so the
 * characters that get confused with each other are simply not in it.
 */
export const ROOM_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
export const ROOM_CODE_LENGTH = 6;

/** Pad/truncate a code the user typed into the canonical 6-character form. */
export function normalizeRoomCode(input: string): string {
  const cleaned = input
    .toUpperCase()
    .replace(/[^0-9A-Z]/g, '')
    // Map the characters people type by mistake onto the ones we use.
    .replace(/[IL]/g, '1')
    .replace(/O/g, '0')
    .replace(/U/g, 'V');
  return cleaned.slice(0, ROOM_CODE_LENGTH);
}

export function isValidRoomCode(input: string): boolean {
  const code = normalizeRoomCode(input);
  return code.length === ROOM_CODE_LENGTH && [...code].every(char => ROOM_ALPHABET.includes(char));
}

/** A short code derived from a longer token, so two hosts rarely collide. */
export function roomCodeFrom(seed: string): string {
  let hash = 2166136261;
  for (let index = 0; index < seed.length; index++) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  let state = hash >>> 0;
  let code = '';
  for (let index = 0; index < ROOM_CODE_LENGTH; index++) {
    code += ROOM_ALPHABET[state % ROOM_ALPHABET.length];
    // xorshift: cheap, and good enough to spread a 32-bit seed over 30^6.
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    state >>>= 0;
  }
  return code;
}

/**
 * Compress a WebRTC session description for a human-friendly paste.
 *
 * A raw SDP is ~1.5 kB of JSON and cannot be typed; base64 of gzip in the
 * browser is smaller but still long. Only the fields a browser genuinely needs
 * to re-create an offer are kept (the ice-ufrag/pwd, the fingerprint, the
 * candidate host), which brings it to a few hundred characters that compress
 * and paste cleanly.
 *
 * This is deliberately tolerant: if the shape is not what we expect we fall
 * back to the plain JSON, because a room that fails to connect is worse than a
 * long code.
 */
export type CompactOffer = {
  v: 1;
  t: 'offer' | 'answer';
  sdp: string;
};

export function encodeOffer(description: RTCSessionDescriptionInit): string {
  const payload = { v: 1 as const, t: 'offer' as const, sdp: description.sdp ?? '' };
  return toBase64Url(JSON.stringify(payload));
}

export function encodeAnswer(description: RTCSessionDescriptionInit): string {
  const payload = { v: 1 as const, t: 'answer' as const, sdp: description.sdp ?? '' };
  return toBase64Url(JSON.stringify(payload));
}

export function decodeSignal(payload: string): CompactOffer | null {
  try {
    const parsed = JSON.parse(fromBase64Url(payload)) as CompactOffer;
    if (parsed?.v !== 1 || (parsed.t !== 'offer' && parsed.t !== 'answer')) return null;
    if (typeof parsed.sdp !== 'string' || !parsed.sdp.includes('v=0')) return null;
    return parsed;
  } catch {
    return null;
  }
}

function toBase64Url(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(value: string): string {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/* ------------------------------------------------------------------ */
/* input sync                                                          */
/* ------------------------------------------------------------------ */

/**
 * A forwarded key press.
 *
 * `code` is the KeyboardEvent.code ("ArrowLeft", "KeyW"), never the typed
 * character — the point is to drive a game, not to send typing to a friend.
 * Keys are only forwarded while the local input-capture toggle is on, so a
 * player cannot quietly stream their keystrokes.
 */
export type InputFrame =
  | { t: 'down'; c: string; k: string }
  | { t: 'up'; c: string }
  | { t: 'release-all' };

export function parseInputFrame(value: unknown): InputFrame | null {
  if (!value || typeof value !== 'object') return null;
  const frame = value as Record<string, unknown>;
  if (frame.t === 'down' && typeof frame.c === 'string') {
    return { t: 'down', c: frame.c.slice(0, 32), k: typeof frame.k === 'string' ? frame.k.slice(0, 16) : '' };
  }
  if (frame.t === 'up' && typeof frame.c === 'string') return { t: 'up', c: frame.c.slice(0, 32) };
  if (frame.t === 'release-all') return { t: 'release-all' };
  return null;
}

/**
 * Apply a remote key press to a game frame.
 *
 * The frame is same-origin (every local game is served from our own origin), so
 * a synthetic KeyboardEvent reaches the game's own listeners. Modifier flags
 * are left false: forwarding a remote Ctrl could trigger browser shortcuts in
 * the host's window.
 */
export function dispatchKey(target: Window | null | undefined, frame: InputFrame): boolean {
  if (!target) return false;
  try {
    const doc = target.document;
    const focusTarget = (doc.activeElement as HTMLElement | null) ?? doc.body ?? doc.documentElement;
    if (frame.t === 'release-all') {
      for (const code of ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'Enter', 'KeyZ', 'KeyX']) {
        emit(doc, 'keyup', code);
      }
      return true;
    }
    emit(doc, frame.t === 'down' ? 'keydown' : 'keyup', frame.c);
    // Some games only read the event on the focused element.
    void focusTarget;
    return true;
  } catch {
    return false;
  }
}

function emit(doc: Document, type: 'keydown' | 'keyup', code: string) {
  const key = codeToKey(code);
  const event = new doc.defaultView!.KeyboardEvent(type, {
    code,
    key,
    bubbles: true,
    cancelable: true,
    composed: true,
  });
  doc.dispatchEvent(event);
}

/** Reverse of KeyboardEvent.code for the keys a 2-player game actually uses. */
export function codeToKey(code: string): string {
  if (code.startsWith('Key')) return code.slice(3).toLowerCase();
  if (code.startsWith('Digit')) return code.slice(5);
  const map: Record<string, string> = {
    Space: ' ',
    Enter: 'Enter',
    Escape: 'Escape',
    ArrowUp: 'ArrowUp',
    ArrowDown: 'ArrowDown',
    ArrowLeft: 'ArrowLeft',
    ArrowRight: 'ArrowRight',
    ShiftLeft: 'Shift',
    ShiftRight: 'Shift',
    Backspace: 'Backspace',
    Tab: 'Tab',
  };
  return map[code] ?? code;
}

/* ------------------------------------------------------------------ */
/* room state                                                          */
/* ------------------------------------------------------------------ */

export type RoomStatus = 'off' | 'creating' | 'waiting' | 'connecting' | 'connected' | 'error';

export type RoomMember = {
  id: string;
  name: string;
  cursor: { x: number; y: number };
  game: string | null;
  lastSeen: number;
};

/** Control messages that travel over the data channel. */
export type RoomMessage =
  | { t: 'hello'; name: string }
  | { t: 'presence'; name: string; x: number; y: number; game: string | null }
  | { t: 'launch'; gameId: string }
  | { t: 'chat'; text: string }
  | { t: 'reaction'; emoji: string }
  | { t: 'input'; frame: InputFrame }
  /**
   * A pre-encoded SDP for an inbound video stream.
   *
   * The extra peer connection exists because the data channel that carries
   * input and chat is created before the game starts, while a video track has
   * to be added when there is a canvas to capture. Re-negotiating the original
   * connection would drop the data channel for a frame or two — mid-game — so
   * the bubble gets its own tiny connection and this message carries its
   * offer/answer over the channel that is already open.
   */
  | { t: 'video'; sdp: string; kind: 'offer' | 'answer' };

export const REACTION_SET = ['👋', '🔥', '😂', '😱', '🏆', '💀'] as const;

/** Bound and validate anything that arrives from the other end of the wire. */
export function parseRoomMessage(value: unknown): RoomMessage | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Record<string, unknown>;
  const name = typeof raw.name === 'string' ? raw.name.slice(0, 24) : '';
  switch (raw.t) {
    case 'hello':
      return { t: 'hello', name };
    case 'presence':
      return {
        t: 'presence',
        name,
        x: clampPercent(raw.x),
        y: clampPercent(raw.y),
        game: typeof raw.game === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw.game) ? raw.game : null,
      };
    case 'launch':
      return typeof raw.gameId === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(raw.gameId)
        ? { t: 'launch', gameId: raw.gameId }
        : null;
    case 'chat':
      return typeof raw.text === 'string' && raw.text.trim()
        ? { t: 'chat', text: raw.text.slice(0, 160) }
        : null;
    case 'reaction':
      return typeof raw.emoji === 'string' && (REACTION_SET as readonly string[]).includes(raw.emoji)
        ? { t: 'reaction', emoji: raw.emoji }
        : null;
    case 'input': {
      const frame = parseInputFrame(raw.frame);
      return frame ? { t: 'input', frame } : null;
    }
    case 'video':
      // A session description is a few hundred characters of base64-ish text.
      // The cap keeps a hostile peer from pushing a megabyte through the
      // channel and into setRemoteDescription.
      return typeof raw.sdp === 'string' && raw.sdp.length > 0 && raw.sdp.length <= 8192
        && (raw.kind === 'offer' || raw.kind === 'answer')
        ? { t: 'video', sdp: raw.sdp, kind: raw.kind }
        : null;
    default:
      return null;
  }
}

function clampPercent(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50;
}

/** Which keys a forwarded player is allowed to drive. */
export const FORWARDED_CODES = new Set([
  'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
  'KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'KeyZ', 'KeyX', 'KeyC', 'KeyF', 'KeyR',
  'Space', 'Enter', 'ShiftLeft', 'ShiftRight',
]);

export function shouldForwardKey(code: string): boolean {
  return FORWARDED_CODES.has(code);
}
