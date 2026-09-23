'use client';

// GPU temporal afterglow: a WebGL feedback loop that accumulates the cursor
// canvas over previous frames with exponential decay — real motion blur /
// light streaks at any refresh rate (120Hz+ included), composited under the
// crisp 2D cursor layer. Falls back to nothing when WebGL is unavailable.

import { useEffect, useRef, type RefObject } from 'react';

const VERT = `
attribute vec2 p;
varying vec2 uv;
void main() {
  uv = p * 0.5 + 0.5;
  gl_Position = vec4(p, 0.0, 1.0);
}`;

// out = max(current frame, previous accumulation * decay)
const FRAG = `
precision mediump float;
varying vec2 uv;
uniform sampler2D cur;
uniform sampler2D prev;
uniform float decay;
void main() {
  vec4 c = texture2D(cur, uv);
  vec4 p = texture2D(prev, uv) * decay;
  gl_FragColor = max(c, p);
}`;

export function AfterglowLayer({
  source,
  enabled,
}: {
  source: RefObject<HTMLCanvasElement | null>;
  enabled: boolean;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!enabled) return;
    const canvas = ref.current;
    const src = source.current;
    if (!canvas || !src) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true });
    if (!gl) return;

    const compile = (type: number, srcCode: string) => {
      const sh = gl.createShader(type);
      if (!sh) return null;
      gl.shaderSource(sh, srcCode);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) return null;
      return sh;
    };
    const vs = compile(gl.VERTEX_SHADER, VERT);
    const fs = compile(gl.FRAGMENT_SHADER, FRAG);
    if (!vs || !fs) return;
    const prog = gl.createProgram();
    if (!prog) return;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return;
    gl.useProgram(prog);

    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

    const uCur = gl.getUniformLocation(prog, 'cur');
    const uPrev = gl.getUniformLocation(prog, 'prev');
    const uDecay = gl.getUniformLocation(prog, 'decay');

    const makeTarget = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      const fbo = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return { tex, fbo };
    };
    let a = makeTarget();
    let b = makeTarget();

    const curTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, curTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

    let w = 0;
    let h = 0;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      w = Math.max(1, Math.floor(window.innerWidth * dpr));
      h = Math.max(1, Math.floor(window.innerHeight * dpr));
      canvas.width = w;
      canvas.height = h;
      canvas.style.width = `${window.innerWidth}px`;
      canvas.style.height = `${window.innerHeight}px`;
      gl.viewport(0, 0, w, h);
      for (const t of [a, b]) {
        gl.bindTexture(gl.TEXTURE_2D, t.tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      }
    };
    resize();
    window.addEventListener('resize', resize);

    let raf = 0;
    const frame = () => {
      raf = requestAnimationFrame(frame);
      // upload the 2D cursor canvas
      gl.bindTexture(gl.TEXTURE_2D, curTex);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);

      // accumulate into a
      gl.bindFramebuffer(gl.FRAMEBUFFER, a.fbo);
      gl.useProgram(prog);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, curTex);
      gl.uniform1i(uCur, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.uniform1i(uPrev, 1);
      gl.uniform1f(uDecay, 0.86);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // present a
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, a.tex);
      gl.uniform1i(uCur, 0);
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, b.tex);
      gl.uniform1i(uPrev, 1);
      gl.uniform1f(uDecay, 0.0);
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      const tmp = a;
      a = b;
      b = tmp;
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('resize', resize);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    };
  }, [enabled, source]);

  if (!enabled) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 2147482999, opacity: 0.9 }}
    />
  );
}
