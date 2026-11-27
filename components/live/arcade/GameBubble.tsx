'use client';

/**
 * Feature 3 — the gameplay bubble.
 *
 * Captures the game canvas at 24 fps, sends it over WebRTC to the friend in the
 * room code, and shows their screen in a draggable circular PiP. 24 is chosen
 * deliberately: 30 costs 25% more bandwidth for motion nobody notices on a
 * 320px circle, and 15 makes a fast game look broken.
 *
 * The negotiation rides the coop data channel (see `{t:'video'}` in lib/coop.ts)
 * instead of adding a signalling endpoint, because the room code is already a
 * WebRTC handshake with no server in the middle — adding one for video would
 * undo exactly the property that makes the room private.
 *
 * Why a second `RTCPeerConnection` rather than a track on the existing one:
 * the data channel is created before a game exists, so adding a video track
 * later forces a renegotiation, and a renegotiation is what `setLocalDescription`
 * does badly while keys are being pressed. The extra connection costs one
 * handshake and nothing else.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { Move, Radio, X } from 'lucide-react';

type Signal = (payload: unknown) => boolean;
type Listener = (handler: (message: { sdp: string; kind: 'offer' | 'answer' }) => void) => () => void;

const RTC_CONFIG: RTCConfiguration = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export function GameBubble({
  target,
  send,
  listen,
  active,
}: {
  target: HTMLIFrameElement | null;
  /** Send a `{t:'video'}` message over the coop channel. */
  send: Signal;
  /** Subscribe to inbound `{t:'video'}` messages. */
  listen: Listener;
  /** The room must be connected before a bubble makes sense. */
  active: boolean;
}) {
  const [on, setOn] = useState(false);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [status, setStatus] = useState<'idle' | 'offering' | 'live' | 'error'>('idle');
  const [position, setPosition] = useState({ x: 16, y: 16 });
  const [big, setBig] = useState(false);
  const peer = useRef<RTCPeerConnection | null>(null);
  const video = useRef<HTMLVideoElement>(null);
  const dragging = useRef(false);
  const offset = useRef({ x: 0, y: 0 });

  const teardown = useCallback(() => {
    peer.current?.close();
    peer.current = null;
    setRemoteStream(null);
    setStatus('idle');
  }, []);

  useEffect(() => {
    if (!active) {
      teardown();
      setOn(false);
    }
  }, [active, teardown]);

  /** Build (or reuse) the receiver-side connection. */
  const ensurePeer = useCallback(() => {
    if (peer.current) return peer.current;
    const connection = new RTCPeerConnection(RTC_CONFIG);
    connection.ontrack = event => {
      const [stream] = event.streams;
      if (stream) {
        setRemoteStream(stream);
        setStatus('live');
      }
    };
    connection.onconnectionstatechange = () => {
      if (connection.connectionState === 'failed' || connection.connectionState === 'disconnected') {
        setStatus('error');
        if (video.current) video.current.srcObject = null;
        setRemoteStream(null);
      }
    };
    peer.current = connection;
    return connection;
  }, []);

  /* ---- inbound: an offer arrives over the coop channel ------------------ */
  useEffect(() => {
    return listen(async message => {
      const connection = ensurePeer();
      try {
        if (message.kind === 'offer') {
          await connection.setRemoteDescription({ type: 'offer', sdp: message.sdp });
          const answer = await connection.createAnswer();
          await connection.setLocalDescription(answer);
          send({ t: 'video', kind: 'answer', sdp: answer.sdp ?? '' });
        } else {
          await connection.setRemoteDescription({ type: 'answer', sdp: message.sdp });
        }
      } catch {
        setStatus('error');
      }
    });
  }, [ensurePeer, listen, send]);

  /* ---- outbound: start capturing and offer ----------------------------- */
  const start = useCallback(async () => {
    const doc = target?.contentDocument;
    const canvas = doc
      ? (Array.from(doc.querySelectorAll('canvas')) as HTMLCanvasElement[])
          .sort((a, b) => b.width * b.height - a.width * a.height)[0]
      : null;
    if (!canvas) {
      setStatus('error');
      return;
    }
    const capture = (canvas as HTMLCanvasElement & { captureStream?: (fps: number) => MediaStream }).captureStream;
    if (!capture) {
      setStatus('error');
      return;
    }
    const stream = capture.call(canvas, 24);
    const [track] = stream.getVideoTracks();
    if (!track) {
      setStatus('error');
      return;
    }
    const connection = ensurePeer();
    // Replace the track if one is already published, so re-opening the bubble
    // after a game change does not stack encoders.
    const sender = connection.getSenders().find(entry => entry.track?.kind === 'video');
    if (sender) await sender.replaceTrack(track);
    else connection.addTrack(track, stream);
    const offer = await connection.createOffer();
    await connection.setLocalDescription(offer);
    const ok = send({ t: 'video', kind: 'offer', sdp: offer.sdp ?? '' });
    setStatus(ok ? 'offering' : 'error');
  }, [ensurePeer, send, target]);

  useEffect(() => {
    if (!on || !active) return;
    void start();
    // A low bitrate ceiling keeps the bubble from competing with the game's own
    // network use; 320px of gameplay is legible at ~450 kbps.
    const sender = peer.current?.getSenders().find(entry => entry.track?.kind === 'video');
    if (sender) {
      const params = sender.getParameters();
      params.encodings = params.encodings?.length ? params.encodings : [{}];
      params.encodings[0].maxBitrate = 450_000;
      void sender.setParameters(params).catch(() => {});
    }
    return () => {
      // Leaving the bubble on stops sending; it does not close the connection,
      // so toggling is instant rather than a fresh handshake each time.
      const live = peer.current?.getSenders().find(entry => entry.track?.kind === 'video');
      if (live?.track) live.track.enabled = false;
    };
  }, [on, active, start]);

  useEffect(() => {
    if (video.current && remoteStream) video.current.srcObject = remoteStream;
  }, [remoteStream]);

  /* ---- drag ------------------------------------------------------------ */
  useEffect(() => {
    const move = (event: PointerEvent) => {
      if (!dragging.current) return;
      const size = big ? 260 : 148;
      setPosition({
        x: Math.max(8, Math.min(window.innerWidth - size - 8, event.clientX - offset.current.x)),
        y: Math.max(8, Math.min(window.innerHeight - size - 8, event.clientY - offset.current.y)),
      });
    };
    const up = () => { dragging.current = false; };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    return () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
  }, [big]);

  if (!active) return null;

  return (
    <>
      <button
        type="button"
        className={`gg-bubble-toggle${on ? ' on' : ''}`}
        onClick={() => {
          if (on) {
            setOn(false);
            teardown();
          } else {
            setOn(true);
            setStatus('offering');
          }
        }}
        title={on ? 'Stop sharing gameplay' : 'Share gameplay with your friend'}
      >
        <Radio size={14} /> {on ? 'Live' : 'Share screen'}
      </button>

      {(remoteStream || on) && (
        <div
          className={`gg-bubble${big ? ' big' : ''}`}
          style={{ left: position.x, top: position.y }}
          onPointerDown={event => {
            dragging.current = true;
            const box = (event.currentTarget as HTMLElement).getBoundingClientRect();
            offset.current = { x: event.clientX - box.left, y: event.clientY - box.top };
          }}
          role="group"
          aria-label="Friend's gameplay"
        >
          {remoteStream ? (
            <video ref={video} autoPlay playsInline muted={false} aria-label="Friend's screen" />
          ) : (
            <div className="gg-bubble-wait">
              <Move size={16} />
              <span>{status === 'error' ? 'Stream unavailable' : 'Waiting for their screen…'}</span>
            </div>
          )}
          <div className="gg-bubble-actions">
            <button type="button" onClick={() => setBig(value => !value)} aria-label="Resize bubble">
              <Move size={11} />
            </button>
            <button
              type="button"
              onClick={() => { setOn(false); teardown(); }}
              aria-label="Close bubble"
            >
              <X size={11} />
            </button>
          </div>
        </div>
      )}
    </>
  );
}
