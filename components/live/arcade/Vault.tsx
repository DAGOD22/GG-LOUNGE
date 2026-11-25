'use client';

/**
 * The vault UI for the LSB steganography.
 *
 * All of the pixel work stays in the browser: the image is read with
 * `createImageBitmap`, written through the encoder in `lib/stego.ts`, and
 * re-encoded as a PNG. Nothing is uploaded, which is the only defensible design
 * for a feature whose purpose is hiding a message.
 */

import { useCallback, useRef, useState } from 'react';
import { Download, Eye, EyeOff, Lock, Upload } from 'lucide-react';
import { StegoError, capacityBytes, difference, embed, extract } from '@/lib/stego';
import { download } from './engine';

export function Vault() {
  const [imageName, setImageName] = useState('');
  const [message, setMessage] = useState('');
  const [shown, setShown] = useState(false);
  const [status, setStatus] = useState<{ kind: 'ok' | 'err' | 'idle'; text: string }>({ kind: 'idle', text: 'Drop a PNG and type a message.' });
  const [capacity, setCapacity] = useState(0);
  /** Whether an image is loaded — state, not the ref, so buttons can react. */
  const [loaded, setLoaded] = useState(false);
  const source = useRef<ImageData | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const load = useCallback(async (file: File) => {
    if (file.type !== 'image/png') {
      setStatus({ kind: 'err', text: 'Use a PNG. A JPEG has no spare bits to lose — its compression eats them.' });
      return;
    }
    const bitmap = await createImageBitmap(file).catch(() => null);
    if (!bitmap) {
      setStatus({ kind: 'err', text: 'That file could not be decoded.' });
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d');
    if (!context) return;
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height);
    source.current = data;
    setLoaded(true);
    setImageName(file.name);
    setCapacity(capacityBytes(bitmap.width, bitmap.height));
    const hidden = extract(data);
    setStatus(
      hidden
        ? { kind: 'ok', text: 'This image already carries a message — press “Reveal”.' }
        : { kind: 'idle', text: `${bitmap.width}×${bitmap.height} · room for about ${capacityBytes(bitmap.width, bitmap.height) - 12} bytes.` },
    );
  }, []);

  const hide = useCallback(() => {
    const data = source.current;
    if (!data) return;
    try {
      const stamped = embed(data, message);
      const canvas = document.createElement('canvas');
      canvas.width = stamped.width;
      canvas.height = stamped.height;
      canvas.getContext('2d')?.putImageData(stamped, 0, 0);
      canvas.toBlob(blob => {
        if (!blob) return;
        download(blob, imageName.replace(/\.png$/i, '') + '-vault.png');
        setStatus({
          kind: 'ok',
          text: `Hidden. Average pixel change ${difference(data, stamped).toFixed(2)}/255 — invisible, and still a valid PNG.`,
        });
      }, 'image/png');
    } catch (cause) {
      setStatus({ kind: 'err', text: cause instanceof StegoError ? cause.message : 'Could not embed that message.' });
    }
  }, [imageName, message]);

  const reveal = useCallback(() => {
    const data = source.current;
    if (!data) return;
    const hidden = extract(data);
    if (!hidden) {
      setStatus({ kind: 'err', text: 'No GG-Lounge message found in this image.' });
      return;
    }
    setMessage(hidden);
    setShown(true);
    setStatus({ kind: 'ok', text: 'Message recovered and checksum verified.' });
  }, []);

  return (
    <div className="gglab-vault">
      <div className="gglab-row">
        <button type="button" onClick={() => fileInput.current?.click()}>
          <Upload size={13} /> {imageName || 'Choose PNG'}
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="image/png"
          hidden
          onChange={event => {
            const file = event.target.files?.[0];
            event.target.value = '';
            if (file) void load(file);
          }}
        />
        <span className="gglab-count">{capacity ? `${capacity - 12} B` : '0 B'}</span>
      </div>

      <label className="gglab-vault-field">
        <span>
          <Lock size={12} /> Message
        </span>
        <div className="gglab-vault-input">
          <input
            type={shown ? 'text' : 'password'}
            value={message}
            onChange={event => setMessage(event.target.value)}
            placeholder="Something short — a note, a key, a joke"
            aria-label="Message to hide"
          />
          <button type="button" onClick={() => setShown(value => !value)} aria-label={shown ? 'Hide message' : 'Show message'}>
            {shown ? <EyeOff size={13} /> : <Eye size={13} />}
          </button>
        </div>
      </label>

      <div className="gglab-row">
        <button type="button" className="on" onClick={hide} disabled={!loaded || !message.trim()}>
          <Lock size={13} /> Hide & download
        </button>
        <button type="button" onClick={reveal} disabled={!loaded}>
          <Eye size={13} /> Reveal
        </button>
        <button type="button" onClick={() => fileInput.current?.click()} disabled={!loaded}>
          <Download size={13} /> Load another
        </button>
      </div>

      <p className={`gglab-note ${status.kind}`}>{status.text}</p>
    </div>
  );
}
