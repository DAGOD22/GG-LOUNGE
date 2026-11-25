'use client';

/**
 * Play with a friend — room codes, no QR, no third-party service.
 *
 * The shape of the handshake, and why it is this shape:
 *
 *   host:  create RTCPeerConnection → offer → POST /api/coop (create) → get a
 *          six-character code → show it
 *   guest: type the code → POST /api/coop (poll) → get the offer → answer →
 *          POST /api/coop (answer)
 *   host:  poll → get the answer → setRemoteDescription → connected
 *
 * After that the data channel is direct: no server sees the presence pings,
 * the chat, the reactions or the forwarded keys. The signalling rows expire in
 * minutes and are deleted the moment the room closes.
 *
 * Everything is announced over `aria-live` because the room's whole job is to
 * tell you something changed — a friend joined, a game launched — while the
 * visible focus is on the game.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Copy, Check, LogOut, Users, Send, Keyboard, ChevronDown, ChevronUp, Gamepad2, WifiOff, X,
} from 'lucide-react';
import {
  REACTION_SET,
  decodeSignal,
  encodeAnswer,
  encodeOffer,
  isValidRoomCode,
  normalizeRoomCode,
  parseRoomMessage,
  shouldForwardKey,
  type RoomMessage,
} from '@/lib/coop';
import { useCustomization } from '@/components/customization/CustomizationProvider';
import { useOptionalGameBridge } from './GameBridge';
import { GameBubble } from './arcade/GameBubble';
import { TWO_PLAYER_GAMES, twoPlayerGame } from '@/lib/two-player';

const ICE_SERVERS: RTCIceServer[] = [
  { urls: 'stun:stun.l.google.com:19302' },
  { urls: 'stun:stun1.l.google.com:19302' },
];

type Status = 'off' | 'creating' | 'waiting' | 'connecting' | 'connected' | 'error';

type ChatLine = { id: number; who: 'you' | 'them' | 'system'; text: string };

export function CoopRoom() {
  const { settings } = useCustomization();
  const bridge = useOptionalGameBridge();
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<Status>('off');
  const [code, setCode] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [peerName, setPeerName] = useState('');
  const [error, setError] = useState('');
  /**
   * The deployment itself cannot host a room.
   *
   * Separate from `error` because it is not something the player did and not
   * something retrying will fix: without a database there is nowhere to park
   * the handshake. The panel shows the fix instead of inviting another try.
   */
  const [needsDatabase, setNeedsDatabase] = useState(false);
  const [copied, setCopied] = useState(false);
  const [chat, setChat] = useState<ChatLine[]>([]);
  const [draft, setDraft] = useState('');
  const [forwardKeys, setForwardKeys] = useState(false);
  const [reactions, setReactions] = useState<{ id: number; emoji: string }[]>([]);
  const [expanded, setExpanded] = useState(true);
  /**
   * The two-player title this room agreed on.
   *
   * Held here rather than read from the launcher because the room outlives any
   * one game session: two people pick a title *before* either of them opens it,
   * and both need to arrive at the same one.
   */
  const [roomGame, setRoomGame] = useState<string | null>(null);
  /**
   * Which transport this room is actually using.
   *
   * `p2p` is the default and the whole point: nothing leaves the two browsers.
   * `relay` means the direct connection could not be established (strict NAT,
   * blocked UDP, a school firewall) and messages are being carried through our
   * own queue instead. The panel says which one is live, because a player has a
   * right to know when their chat is going through a server.
   */
  const [transport, setTransport] = useState<'p2p' | 'relay'>('p2p');

  const connection = useRef<RTCPeerConnection | null>(null);
  const channel = useRef<RTCDataChannel | null>(null);
  const poll = useRef<number | null>(null);
  const lineId = useRef(1);
  /**
   * Role is held twice on purpose.
   *
   * `roleRef` is what the transport callbacks read (a data-channel handler must
   * not close over a stale state value), but the *label* has to re-render when
   * the role is set. Reading `role.current` during render was the original bug:
   * refs do not trigger a render, so the panel kept saying "Room" for a host,
   * and React forbids reading a ref mid-render anyway.
   */
  const role = useRef<'host' | 'guest' | null>(null);
  const [roleState, setRoleState] = useState<'host' | 'guest' | null>(null);
  const forwardRef = useRef(false);
  const peerNameRef = useRef('');
  const bridgeRef = useRef(bridge);
  /**
   * Video signalling listeners.
   *
   * The bubble subscribes rather than living inside the room's state machine:
   * a stream that is being renegotiated must not re-render the roster, and the
   * room must keep forwarding input frames at 60 Hz while it happens.
   */
  const videoListeners = useRef(new Set<(message: { sdp: string; kind: 'offer' | 'answer' }) => void>());
  /** The relay poll timer, its read cursor, and the side we identify as. */
  const relayTimer = useRef<number | null>(null);
  const relayCursor = useRef(0);
  const [relayActive, setRelayActive] = useState(false);
  const relayActiveRef = useRef(false);
  useEffect(() => { relayActiveRef.current = relayActive; }, [relayActive]);
  /** The room code, readable from transport callbacks without a stale closure. */
  const codeRef = useRef('');
  /** Our display name, for the relay's hello. */
  const nameRef = useRef('');
  /** `handleMessage` is declared after the transport callbacks that need it. */
  const handleMessageRef = useRef<(message: unknown) => void>(() => {});

  useEffect(() => {
    forwardRef.current = forwardKeys;
  }, [forwardKeys]);
  useEffect(() => {
    peerNameRef.current = peerName;
  }, [peerName]);
  useEffect(() => {
    codeRef.current = code;
  }, [code]);
  useEffect(() => {
    bridgeRef.current = bridge;
  }, [bridge]);

  const myName = useMemo(
    () => settings.cloak.title?.trim() || 'You',
    [settings.cloak.title],
  );
  useEffect(() => {
    nameRef.current = myName;
  }, [myName]);

  const push = useCallback((who: ChatLine['who'], text: string) => {
    setChat(current => [...current.slice(-40), { id: lineId.current++, who, text }]);
  }, []);

  /* ---- transport ------------------------------------------------------ */

  /**
   * Send a room message over whichever transport is live.
   *
   * Returns false only when *neither* path could take it, so the callers that
   * surface "no connection" keep working. Falling back here rather than at each
   * call site is what makes the relay invisible to the rest of the component:
   * chat, keys, presence and reactions all go through this one function.
   */
  const sendRaw = useCallback((message: RoomMessage): boolean => {
    const payload = JSON.stringify(message);
    const channelNow = channel.current;
    if (channelNow?.readyState === 'open') {
      try {
        channelNow.send(payload);
        return true;
      } catch {
        /* fall through to the relay */
      }
    }
    const code = codeRef.current;
    const side = role.current;
    if (!code || !side) return false;
    // Fire and forget: a relayed message that loses a race is retried by the
    // next identical event (a key held down repeats, chat has a send button).
    void fetch('/api/coop/relay', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ action: 'post', code, side, body: payload }),
      keepalive: true,
    }).catch(() => {});
    return true;
  }, []);

  const stopPolling = useCallback(() => {
    if (poll.current) window.clearInterval(poll.current);
    poll.current = null;
  }, []);

  /* ---- relay fallback ------------------------------------------------- */

  const stopRelay = useCallback(() => {
    if (relayTimer.current) window.clearInterval(relayTimer.current);
    relayTimer.current = null;
    setRelayActive(false);
    relayCursor.current = 0;
  }, []);

  /**
   * Start draining the relay queue.
   *
   * Called when the direct channel fails or never opens. From this point every
   * message goes both ways through `/api/coop/relay`, which is the same
   * `handleMessage` path the data channel feeds — so the room behaves
   * identically, just with a server in the middle.
   */
  const startRelay = useCallback(
    (roomCode: string) => {
      if (relayTimer.current) return;
      setRelayActive(true);
      setTransport('relay');
      setStatus('connected');
      const side = role.current ?? 'host';
      // Announce ourselves immediately so the peer learns a name even though no
      // data channel ever opened.
      void fetch('/api/coop/relay', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'post', code: roomCode, side, body: JSON.stringify({ t: 'hello', name: nameRef.current }) }),
      }).catch(() => {});

      relayTimer.current = window.setInterval(async () => {
        try {
          const response = await fetch('/api/coop/relay', {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ action: 'poll', code: roomCode, side, since: relayCursor.current }),
          });
          if (!response.ok) return;
          const data = await response.json();
          if (typeof data?.cursor === 'number') relayCursor.current = data.cursor;
          for (const body of (data?.messages ?? []) as string[]) {
            try {
              handleMessageRef.current(JSON.parse(body));
            } catch {
              /* a bad body is dropped, not rethrown */
            }
          }
        } catch {
          /* a missed poll is not a failed room: the next tick retries */
        }
      }, 700);
    },
    [],
  );

  const teardown = useCallback(
    (announce = true) => {
      stopPolling();
      stopRelay();
      setTransport('p2p');
      if (forwardRef.current) {
        try {
          channel.current?.send(JSON.stringify({ t: 'input', frame: { t: 'release-all' } }));
        } catch {
          /* already gone */
        }
      }
      try {
        channel.current?.close();
      } catch {
        /* ignore */
      }
      try {
        connection.current?.close();
      } catch {
        /* ignore */
      }
      channel.current = null;
      connection.current = null;
      role.current = null;
      setRoleState(null);
      setStatus('off');
      setCode('');
      setPeerName('');
      setForwardKeys(false);
      forwardRef.current = false;
      // A new room always starts empty: a transcript from the previous friend
      // appearing in a fresh room reads as a leak, even though it is local.
      setReactions([]);
      if (announce) push('system', 'Left the room.');
    },
    [push, stopPolling, stopRelay],
  );

  const handleMessage = useCallback(
    (raw: unknown) => {
      const message = parseRoomMessage(raw);
      if (!message) return;
      switch (message.t) {
        case 'hello':
          setPeerName(message.name);
          push('system', `${message.name} joined.`);
          break;
        case 'presence':
          setPeerName(message.name);
          if (message.game) bridgeRef.current?.onPeerGame?.(message.game);
          break;
        case 'launch':
          // The friend picked a game; the same title opens here so both are in
          // the same place without either of them hunting for it.
          setRoomGame(message.gameId);
          bridgeRef.current?.launchGame?.(message.gameId, 'Friend started this game');
          window.dispatchEvent(new CustomEvent('ggl:launch-game', { detail: { gameId: message.gameId } }));
          push('system', `${peerNameRef.current || 'Your friend'} launched a game.`);
          break;
        case 'chat':
          push('them', message.text);
          break;
        case 'reaction':
          setReactions(current => [...current.slice(-6), { id: lineId.current++, emoji: message.emoji }]);
          window.setTimeout(() => {
            setReactions(current => current.slice(1));
          }, 2200);
          break;
        case 'input':
          bridgeRef.current?.applyRemoteInput?.(message.frame);
          break;
        case 'video':
          // The bubble owns its own peer connection; the room just delivers the
          // signal, because the room is the only path that is already open.
          for (const handler of videoListeners.current) handler({ sdp: message.sdp, kind: message.kind });
          break;
      }
    },
    [push],
  );

  useEffect(() => {
    handleMessageRef.current = handleMessage;
  }, [handleMessage]);

  const wireChannel = useCallback(
    (dataChannel: RTCDataChannel, name: string) => {
      channel.current = dataChannel;
      dataChannel.onopen = () => {
        setStatus('connected');
        setError('');
        setTransport('p2p');
        stopRelay();
        dataChannel.send(JSON.stringify({ t: 'hello', name }));
      };
      dataChannel.onclose = () => {
        if (role.current) {
          setStatus('waiting');
          push('system', 'Your friend disconnected.');
        }
      };
      dataChannel.onmessage = event => {
        let parsed: unknown;
        try {
          parsed = JSON.parse(event.data);
        } catch {
          return;
        }
        handleMessage(parsed);
      };
    },
    [handleMessage, push, stopRelay],
  );

  const buildConnection = useCallback(
    (name: string, isHost: boolean) => {
      const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
      connection.current = pc;
      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
          // Do not give up. A failed ICE negotiation is common on school and
          // mobile networks, and telling the player "the connection failed" is
          // a dead end for them: there is nothing to retry. Switch to the
          // relay, which always works, and say so.
          stopPolling();
          if (codeRef.current) {
            startRelay(codeRef.current);
            push('system', 'Direct connection blocked — using the relay. Chat and keys still work.');
          } else {
            setError('The direct connection failed. Try again — or use a different network.');
            setStatus('error');
          }
        }
        if (pc.connectionState === 'connected') {
          setTransport('p2p');
          setStatus('connected');
        }
      };
      pc.ondatachannel = event => wireChannel(event.channel, name);
      if (isHost) {
        // The host always opens the channel, and it has to be created *before*
        // the offer is made so the channel is negotiated in the SDP. It used to
        // be created only when an `onOffer` callback was passed — and no caller
        // ever passed one, so a host and guest could connect at the ICE level
        // and then have nothing to talk over: the room said "connected" and no
        // message, cursor or game ever arrived. That is the whole of "the room
        // maker doesn't work".
        const dataChannel = pc.createDataChannel('ggl-coop', { ordered: true });
        wireChannel(dataChannel, name);
      }
      return pc;
    },
    [stopPolling, wireChannel, startRelay, push],
  );

  /** Host: create the offer, park it, show the code. */
  /**
   * Host: poll the signalling row until the guest posts an answer.
   *
   * This is a `useCallback` declared *before* `createRoom` uses it. As a plain
   * function declaration hoisted below the callback that called it, `createRoom`
   * closed over a binding that only exists later in the same component body —
   * which React's compiler rejects, and which made the dependency array a lie.
   */
  const startHostPolling = useCallback((roomCode: string) => {
    stopPolling();
    poll.current = window.setInterval(async () => {
      try {
        const response = await fetch('/api/coop', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'poll', code: roomCode }),
        });
        if (!response.ok) return;
        const data = await response.json();
        if (data.answer && connection.current && !connection.current.remoteDescription) {
          const signal = decodeSignal(data.answer);
          if (signal) {
            await connection.current.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
            setPeerName(data.guestName || '');
            setStatus('connecting');
            stopPolling();
            // Keep the row alive while the channel settles, then let it expire.
            window.setTimeout(() => {
              void fetch('/api/coop', {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ action: 'close', code: roomCode }),
              }).catch(() => {});
            }, 4000);
          }
        }
      } catch {
        /* transient */
      }
    }, 1500);
    }, [stopPolling]);

  const createRoom = useCallback(async () => {
    setError('');
    setStatus('creating');
    setChat([]);
    role.current = 'host';
    setRoleState('host');
    try {
      const pc = buildConnection(myName, true);
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      // Wait for ICE so the offer in the code already carries candidates; a
      // trickle-only offer would need a second round trip through the code.
      await waitForIce(pc);
      const encoded = encodeOffer(pc.localDescription ?? offer);
      const response = await fetch('/api/coop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'create', offer: encoded, name: myName }),
      });
      const data = await response.json();
      if (data?.needsDatabase) setNeedsDatabase(true);
      if (!response.ok || !data?.code) throw new Error(data?.error || 'Could not open a room');
      setCode(data.code);
      codeRef.current = data.code;
      setStatus('waiting');
      push('system', 'Room open. Read the code to your friend.');
      startHostPolling(data.code);
    } catch (cause) {
      setError((cause as Error).message || 'Could not open a room');
      setStatus('error');
      teardown(false);
    }
  }, [buildConnection, myName, push, teardown, startHostPolling]);


  /** Guest: fetch the offer by code, answer it. */
  const joinRoom = useCallback(async () => {
    const roomCode = normalizeRoomCode(joinCode);
    if (!isValidRoomCode(roomCode)) {
      setError('A room code is six characters.');
      return;
    }
    setError('');
    setStatus('connecting');
    setChat([]);
    role.current = 'guest';
    setRoleState('guest');
    try {
      const lookup = await fetch('/api/coop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'poll', code: roomCode }),
      });
      if (!lookup.ok) throw new Error('That room code is not open.');
      const data = await lookup.json();
      const signal = decodeSignal(data.offer);
      if (!signal) throw new Error('That room code is not valid.');

      const pc = buildConnection(myName, false);
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await waitForIce(pc);
      const encoded = encodeAnswer(pc.localDescription ?? answer);
      const posted = await fetch('/api/coop', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'answer', code: roomCode, answer: encoded, name: myName }),
      });
      if (!posted.ok) throw new Error('The host could not be reached.');
      setCode(roomCode);
      setStatus('connecting');
      push('system', 'Connecting…');
    } catch (cause) {
      setError((cause as Error).message || 'Could not join');
      setStatus('error');
      teardown(false);
    }
  }, [buildConnection, joinCode, myName, push, teardown]);

  /* ---- presence + key forwarding over the channel --------------------- */

  useEffect(() => {
    if (status !== 'connected') return;
    const timer = window.setInterval(() => {
      sendRaw({ t: 'presence', name: myName, x: 50, y: 50, game: bridgeRef.current?.activeGameId?.() ?? null });
    }, 3000);
    return () => window.clearInterval(timer);
  }, [status, myName, sendRaw]);

  useEffect(() => {
    if (status !== 'connected' || !forwardKeys) return;
    // Only while explicitly enabled: a key forwarded to a friend is a keystroke
    // they are driving their own game with, so this must be a deliberate act.
    const down = (event: KeyboardEvent) => {
      if (!shouldForwardKey(event.code)) return;
      const target = event.target as Element | null;
      if (target?.closest?.('input,textarea,[contenteditable="true"]')) return;
      // Seat 2: the friend is player two, not a second pair of hands on player
      // one's keys. `dispatchKey` maps these onto the other control scheme.
      sendRaw({ t: 'input', frame: { t: 'down', c: event.code, k: event.key, seat: 2 } });
    };
    const up = (event: KeyboardEvent) => {
      if (!shouldForwardKey(event.code)) return;
      const target = event.target as Element | null;
      if (target?.closest?.('input,textarea,[contenteditable="true"]')) return;
      sendRaw({ t: 'input', frame: { t: 'up', c: event.code, seat: 2 } });
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => {
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      sendRaw({ t: 'input', frame: { t: 'release-all', seat: 2 } });
    };
  }, [status, forwardKeys, sendRaw]);

  /**
   * Open a verified two-player title for this room.
   *
   * The pick travels over the data channel (`{t:'launch'}`) and is also applied
   * locally, so both players land in the same game without either of them
   * hunting for it. The active game is recorded even before the modal exists,
   * which is why the launcher listens for `ggl:launch-game` rather than relying
   * on a bridge being registered.
   */
  const openTwoPlayer = useCallback(
    (gameId: string) => {
      const entry = twoPlayerGame(gameId);
      if (!entry) return;
      setRoomGame(gameId);
      // Exactly one launch request. When a launcher is mounted the bridge takes
      // it (it also closes the split pane, since two players share one screen);
      // otherwise the page-level listener opens the modal from scratch. Asking
      // both meant two events per click in the common case.
      if (bridgeRef.current) bridgeRef.current.launchTwoPlayer(gameId);
      else window.dispatchEvent(new CustomEvent('ggl:launch-game', { detail: { gameId } }));
      if (status === 'connected') {
        sendRaw({ t: 'launch', gameId });
        push('system', `Opened ${gameId.replace(/-/g, ' ')} for two players.`);
        push('system', 'Press W or an arrow key — your presses arrive on player two.');
      }
    },
    [push, sendRaw, status],
  );

  /**
   * The watchdog.
   *
   * A peer connection can sit in `connecting` indefinitely without ever firing
   * `failed` — some networks silently drop the STUN replies and the state never
   * changes again. That is the "it just says waiting forever" case. If neither
   * transport has become live a few seconds after the room exists, the relay
   * takes over, because a room that never connects is worse than a room with a
   * server in the middle.
   */
  useEffect(() => {
    if (status !== 'waiting' && status !== 'connecting') return;
    const id = window.setTimeout(() => {
      if (relayActiveRef.current) return;
      const open = channel.current?.readyState === 'open';
      if (open) return;
      if (codeRef.current) {
        startRelay(codeRef.current);
        push('system', 'No direct route between you — using the relay instead.');
      }
    }, 7000);
    return () => window.clearTimeout(id);
  }, [status, startRelay, push]);

  /* An installed-app shortcut (or any link) can ask for the panel directly. */
  useEffect(() => {
    const openPanel = () => setOpen(true);
    window.addEventListener('ggl:open-coop', openPanel);
    return () => window.removeEventListener('ggl:open-coop', openPanel);
  }, []);

  useEffect(() => () => teardown(false), [teardown]);

  /* ---- panic integration --------------------------------------------- */
  useEffect(() => {
    // The panic key closes the room as part of its own teardown; this listener
    // makes sure a room can never outlive the panic, whatever order the two
    // handlers run in.
    const onPanic = () => {
      const roomCode = code;
      if (roomCode) {
        void fetch('/api/coop', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ action: 'close', code: roomCode }),
          keepalive: true,
        }).catch(() => {});
      }
      setOpen(false);
      teardown(false);
    };
    window.addEventListener('ggl:panic', onPanic);
    return () => window.removeEventListener('ggl:panic', onPanic);
  }, [code, teardown]);

  /* ---- ui ------------------------------------------------------------- */

  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setError('Copy was blocked — read the code out instead.');
    }
  };

  const sendChat = () => {
    const text = draft.trim();
    if (!text) return;
    if (sendRaw({ t: 'chat', text })) {
      push('you', text);
      setDraft('');
    }
  };

  const resetToJoin = () => {
    teardown(false);
    setError('');
  };

  const connected = status === 'connected';

  /**
   * The bubble's send/listen pair.
   *
   * `send` goes through the room's own framing so the peer validates it with
   * everything else; `listen` registers a handler that the message switch
   * calls. Both are stable callbacks — the bubble re-negotiates on identity
   * change, and an unstable pair here would restart every stream on any render.
   */
  const videoSend = useCallback(
    (payload: unknown) => {
      const message = payload as { t?: string; kind?: 'offer' | 'answer'; sdp?: string };
      if (message?.t !== 'video' || !message.sdp || !message.kind) return false;
      return sendRaw({ t: 'video', kind: message.kind, sdp: message.sdp });
    },
    [sendRaw],
  );
  const videoListen = useCallback((handler: (message: { sdp: string; kind: 'offer' | 'answer' }) => void) => {
    videoListeners.current.add(handler);
    return () => {
      videoListeners.current.delete(handler);
    };
  }, []);

  return (
    <>
      {/* reactions float above everything, briefly */}
      <div className="gg-coop-reactions" aria-hidden="true">
        {reactions.map(reaction => (
          <span key={reaction.id}>{reaction.emoji}</span>
        ))}
      </div>

      <button
        type="button"
        className={`gg-coop-trigger${connected ? ' is-live' : ''}`}
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        aria-controls="gg-coop-panel"
        title="Play with a friend"
      >
        <Users size={16} />
        <span>{connected ? (transport === 'relay' ? 'In a room (relay)' : 'In a room') : 'Play with a friend'}</span>
        {connected && <span className="gg-coop-dot" aria-hidden="true" />}
      </button>

      {connected && (
        <GameBubble
          target={bridge?.frame?.() ?? null}
          send={videoSend}
          listen={videoListen}
          active={connected}
        />
      )}

      {open && (
        <div className="gg-coop-panel" id="gg-coop-panel" role="dialog" aria-label="Play with a friend">
          <header>
            <div>
              <p className="gg-overline">PEER TO PEER</p>
              <strong>Co-op room</strong>
            </div>
            <div className="gg-coop-head-actions">
              <button type="button" onClick={() => setExpanded(value => !value)} aria-label={expanded ? 'Collapse' : 'Expand'}>
                {expanded ? <ChevronDown size={15} /> : <ChevronUp size={15} />}
              </button>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close room panel">
                <X size={15} />
              </button>
            </div>
          </header>

          <p className="gg-live-status" role="status" aria-live="polite">
            {status === 'off' && 'Open a room, or type the code a friend read out.'}
            {status === 'creating' && 'Opening a room…'}
            {status === 'waiting' && 'Waiting for your friend to join with the code…'}
            {status === 'connecting' && 'Connecting directly…'}
            {status === 'connected' &&
              (transport === 'relay'
                ? `Connected${peerName ? ` to ${peerName}` : ''} through the relay — direct video is off, chat and keys work.`
                : peerName
                  ? `Connected to ${peerName} directly, peer to peer.`
                  : 'Connected directly, peer to peer.')}
            {status === 'error' && (error || 'Something went wrong.')}
          </p>

          {needsDatabase && (
            <p className="gg-live-error" role="alert">
              Rooms need a database on this deployment. Connect Postgres and set DATABASE_URL, then
              redeploy — nothing else is broken.
            </p>
          )}
          {error && status !== 'error' && !needsDatabase && <p className="gg-live-error" role="alert">{error}</p>}

          {status === 'off' || status === 'error' ? (
            <div className="gg-coop-start">
              <button type="button" className="gg-primary" onClick={createRoom}>
                <Gamepad2 size={14} /> Create a room
              </button>
              <div className="gg-coop-join">
                <input
                  value={joinCode}
                  onChange={event => setJoinCode(normalizeRoomCode(event.target.value))}
                  placeholder="ROOM CODE"
                  aria-label="Room code"
                  maxLength={6}
                  autoComplete="off"
                  spellCheck={false}
                  inputMode="text"
                  onKeyDown={event => {
                    if (event.key === 'Enter') void joinRoom();
                  }}
                />
                <button type="button" className="gg-secondary" onClick={joinRoom} disabled={!isValidRoomCode(joinCode)}>
                  Join
                </button>
              </div>
            </div>
          ) : (
            <div className="gg-coop-code">
              <span>{roleState === 'host' ? 'Your room code' : 'Room'}</span>
              <button type="button" onClick={copyCode} className="gg-coop-code-value">
                {code}
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
              <button type="button" className="gg-coop-leave" onClick={resetToJoin}>
                <LogOut size={13} /> Leave
              </button>
            </div>
          )}

          {(
            <div className="gg-coop-games" aria-label="Two-player games">
              <p className="gg-overline">TWO-PLAYER PICKS</p>
              <div className="gg-coop-games-list">
                {TWO_PLAYER_GAMES.map(entry => (
                  <button
                    key={entry.id}
                    type="button"
                    className={`gg-coop-game${roomGame === entry.id ? ' is-current' : ''}`}
                    onClick={() => openTwoPlayer(entry.id)}
                    aria-pressed={roomGame === entry.id}
                  >
                    <strong>{entry.id.replace(/-/g, ' ')}</strong>
                    <span>{entry.controls}</span>
                  </button>
                ))}
              </div>
              <p className="gg-help">
                {status === 'off'
                  ? 'These titles ship a real second player. Open a room and picking one starts it for both of you.'
                  : 'These titles ship a real second player. Picking one opens it on both screens.'}
              </p>
            </div>
          )}

          {expanded && connected && (
            <>
              <div className="gg-coop-tools">
                <label className="gg-coop-toggle">
                  <input type="checkbox" checked={forwardKeys} onChange={event => setForwardKeys(event.target.checked)} />
                  <Keyboard size={14} />
                  <span>I am player two</span>
                </label>
                {forwardKeys && (
                  <div className="gg-coop-p2-keys">
                    <span>Your keys land on player two</span>
                    <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd>
                    <kbd>↑</kbd><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd>
                    <kbd>Space</kbd><kbd>Shift</kbd>
                    <small>
                      Both schemes are covered — whichever one the game uses for player two,
                      one of these reaches it. Their screen shows the same game.
                    </small>
                  </div>
                )}
                <button
                  type="button"
                  className="gg-coop-launch"
                  onClick={() => {
                    const id = bridgeRef.current?.activeGameId?.();
                    if (!id) {
                      push('system', 'Open a game first, then share it.');
                      return;
                    }
                    sendRaw({ t: 'launch', gameId: id });
                    // A launch also tells the feed: the room getting into the
                    // same game is exactly the news the co-op feature exists for.
                    window.dispatchEvent(new CustomEvent('ggl:launch', { detail: { gameId: id } }));
                    push('system', 'Sent this game to your friend.');
                  }}
                >
                  <Send size={13} /> Send this game
                </button>
              </div>

              <div className="gg-coop-reaction-row" role="group" aria-label="Send a reaction">
                {REACTION_SET.map(emoji => (
                  <button
                    key={emoji}
                    type="button"
                    onClick={() => {
                      sendRaw({ t: 'reaction', emoji });
                      setReactions(current => [...current.slice(-6), { id: lineId.current++, emoji }]);
                    }}
                  >
                    {emoji}
                  </button>
                ))}
              </div>

              <div className="gg-coop-chat" aria-live="polite">
                {chat.length === 0 && <p className="gg-help">Say hello — messages only go to this room, never to the site.</p>}
                {chat.map(line => (
                  <p key={line.id} className={`gg-coop-line gg-coop-${line.who}`}>
                    {line.text}
                  </p>
                ))}
              </div>

              <form
                className="gg-coop-send"
                onSubmit={event => {
                  event.preventDefault();
                  sendChat();
                }}
              >
                <input
                  value={draft}
                  onChange={event => setDraft(event.target.value)}
                  placeholder="Message your friend"
                  aria-label="Message"
                  maxLength={160}
                />
                <button type="submit" aria-label="Send message" disabled={!draft.trim()}>
                  <Send size={14} />
                </button>
              </form>
            </>
          )}

          {expanded && !connected && status !== 'off' && status !== 'error' && (
            <p className="gg-help">
              <WifiOff size={12} /> Nothing leaves your browser until the direct connection opens.
            </p>
          )}
        </div>
      )}
    </>
  );
}

/** Resolve when ICE gathering finishes, or after a short ceiling. */
function waitForIce(pc: RTCPeerConnection, timeoutMs = 2500): Promise<void> {
  if (pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      pc.removeEventListener('icegatheringstatechange', check);
      window.clearTimeout(timer);
      resolve();
    };
    const check = () => {
      if (pc.iceGatheringState === 'complete') done();
    };
    const timer = window.setTimeout(done, timeoutMs);
    pc.addEventListener('icegatheringstatechange', check);
  });
}
