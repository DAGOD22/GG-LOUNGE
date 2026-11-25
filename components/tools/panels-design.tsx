'use client'
/**
 * Design tools.
 *
 * Colour work is where "looks about right" fails hardest: a palette that reads
 * fine to the person who picked it can be unreadable to someone else. The
 * contrast panel is therefore the most earnest one on the page, and it reports
 * the actual WCAG number rather than a thumbs up.
 */
import { useState } from 'react'

import {
  aspectRatio, aspectScale, contrastRatio, fitInto, luminance,
  nearestColorName, paletteFrom, parseHex, pxToRem, rgbToHex, rgbToHsl, remToPx,
} from '@/lib/tools/logic'
import { CopyButton, Field, Output, Select, Stat, TextInput } from './ui'

/* ---------------- colour converter ---------------- */

export function ColorConverterTool() {
  const [hex, setHex] = useState('#7c3aed')
  const rgb = parseHex(hex)
  const hsl = rgb ? rgbToHsl(rgb) : null
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Hex"><TextInput value={hex} onChange={setHex} placeholder="#7c3aed" /></Field>
        <Field label="Or pick"><TextInput type="color" value={rgb ? rgbToHex(rgb) : '#000000'} onChange={value => setHex(value)} /></Field>
      </div>
      <div className="tool-swatch" style={{ background: rgb ? rgbToHex(rgb) : 'transparent' }} />
      {rgb ? (
        <div className="tool-stack">
          <Output label="HEX" value={rgbToHex(rgb)} />
          <Output label="RGB" value={`rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`} />
          <Output label="HSL" value={`hsl(${hsl!.h}, ${hsl!.s}%, ${hsl!.l}%)`} />
          <Output label="CSS variable" value={`--accent: ${rgbToHex(rgb)};`} />
        </div>
      ) : <div className="tool-error">That is not a hex colour. Use 3 or 6 hex digits, with or without the #.</div>}
      <p className="tool-hint">HSL is easier to nudge by hand: change the light figure to darken a colour without shifting its hue.</p>
    </div>
  )
}

export function ColourNameTool() {
  const [hex, setHex] = useState('#ff4500')
  const rgb = parseHex(hex)
  const nearest = rgb ? nearestColorName(rgb) : null
  return (
    <div className="tool-panel">
      <Field label="Hex"><TextInput value={hex} onChange={setHex} /></Field>
      {nearest ? (
        <>
          <div className="tool-swatch" style={{ background: rgb ? rgbToHex(rgb) : 'transparent' }} />
          <div className="tool-stats">
            <Stat label="nearest CSS name" value={nearest.name} />
            <Stat label="distance" value={nearest.distance.toFixed(0)} />
          </div>
          <Output label="Named colour" value={nearest.name} />
        </>
      ) : <div className="tool-error">That is not a hex colour.</div>}
      <p className="tool-hint">Distance is straight-line in RGB, which is why some matches look closer than others. The list is the compact set of CSS names, not all 140.</p>
    </div>
  )
}

/* ---------------- palette ---------------- */

export function PaletteTool() {
  const [hex, setHex] = useState('#7c3aed')
  const rgb = parseHex(hex)
  const palette = rgb ? paletteFrom(rgb) : []
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Base colour"><TextInput value={hex} onChange={setHex} /></Field>
        <Field label="Pick"><TextInput type="color" value={rgb ? rgbToHex(rgb) : '#000000'} onChange={setHex} /></Field>
      </div>
      {palette.length ? (
        <>
          <div className="tool-palette">
            {palette.map(colour => (
              <div key={colour} className="tool-palette-chip" style={{ background: colour }}>
                <span>{colour}</span>
              </div>
            ))}
          </div>
          <Output label="As CSS variables" value={palette.map((colour, index) => `--palette-${index + 1}: ${colour};`).join('\n')} multiline />
        </>
      ) : <div className="tool-error">That is not a hex colour.</div>}
      <p className="tool-hint">Complement, two analogous shades and a triad. A starting point to edit, not a finished brand.</p>
    </div>
  )
}

/* ---------------- contrast ---------------- */

export function ContrastTool() {
  const [foreground, setForeground] = useState('#ffffff')
  const [background, setBackground] = useState('#7c3aed')
  const fg = parseHex(foreground)
  const bg = parseHex(background)
  const ratio = fg && bg ? contrastRatio(fg, bg) : null
  const pass = (threshold: number) => (ratio === null ? false : ratio >= threshold)

  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Text colour"><TextInput value={foreground} onChange={setForeground} /></Field>
        <Field label="Background"><TextInput value={background} onChange={setBackground} /></Field>
      </div>
      {fg && bg ? (
        <>
          <div className="tool-contrast-preview" style={{ background: rgbToHex(bg), color: rgbToHex(fg) }}>
            <span style={{ fontSize: 22 }}>Large text 24px</span>
            <span style={{ fontSize: 14 }}>Body text at the usual 14–16px, which is the case that fails.</span>
          </div>
          <div className="tool-stats">
            <Stat label="contrast" value={`${ratio!.toFixed(2)}:1`} />
            <Stat label="AA body (4.5)" value={pass(4.5) ? 'pass' : 'fail'} />
            <Stat label="AA large (3)" value={pass(3) ? 'pass' : 'fail'} />
            <Stat label="AAA body (7)" value={pass(7) ? 'pass' : 'fail'} />
          </div>
          <div className="tool-badges">
            <span className={`tool-badge ${pass(4.5) ? 'good' : 'bad'}`}>WCAG AA</span>
            <span className={`tool-badge ${pass(7) ? 'good' : 'bad'}`}>WCAG AAA</span>
            <span className="tool-hint">Luminance: text {luminance(fg).toFixed(3)} / background {luminance(bg).toFixed(3)}</span>
          </div>
        </>
      ) : <div className="tool-error">Both colours need to be valid hex values.</div>}
      <p className="tool-hint">Ratio is symmetric — which colour is the text does not change the number, only which one you have to change.</p>
    </div>
  )
}

/* ---------------- px rem ---------------- */

export function PxRemTool() {
  const [px, setPx] = useState('16')
  const [root, setRoot] = useState('16')
  const [rem, setRem] = useState('1')
  return (
    <div className="tool-panel">
      <Field label="Root font size (px)"><TextInput type="number" value={root} onChange={setRoot} /></Field>
      <div className="tool-grid-2">
        <div className="tool-column">
          <Field label="Pixels"><TextInput type="number" value={px} onChange={setPx} /></Field>
          <Output label="In rem" value={pxToRem(Number(px) || 0, Number(root) || 0) === null ? 'root must be above zero' : `${pxToRem(Number(px) || 0, Number(root) || 0)!.toFixed(4).replace(/0+$/, '').replace(/\.$/, '')} rem`} />
        </div>
        <div className="tool-column">
          <Field label="Rem"><TextInput type="number" value={rem} onChange={setRem} /></Field>
          <Output label="In pixels" value={remToPx(Number(rem) || 0, Number(root) || 0) === null ? 'root must be above zero' : `${remToPx(Number(rem) || 0, Number(root) || 0)!.toFixed(2).replace(/\.00$/, '')} px`} />
        </div>
      </div>
      <p className="tool-hint">1rem is the root font size, usually 16px. Using rem for spacing means the whole layout scales when a reader raises their default text size.</p>
    </div>
  )
}

/* ---------------- aspect ratio ---------------- */

export function AspectRatioTool() {
  const [width, setWidth] = useState('1920')
  const [height, setHeight] = useState('1080')
  const [newWidth, setNewWidth] = useState('1280')
  const ratio = aspectRatio(Number(width) || 0, Number(height) || 0)
  const scaled = aspectScale(Number(width) || 0, Number(height) || 0, Number(newWidth) || 0)
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Width"><TextInput type="number" value={width} onChange={setWidth} /></Field>
        <Field label="Height"><TextInput type="number" value={height} onChange={setHeight} /></Field>
        <Field label="New width"><TextInput type="number" value={newWidth} onChange={setNewWidth} /></Field>
      </div>
      <div className="tool-stats">
        <Stat label="ratio" value={ratio ?? '—'} />
        <Stat label="new height" value={scaled ? String(Math.round(scaled.height)) : '—'} />
      </div>
      <div className="tool-ratio-preview" style={{ aspectRatio: ratio ? ratio.replace(':', '/') : '16/9' }}>
        <span>{ratio ?? '—'}</span>
      </div>
      <p className="tool-hint">16:9 is video, 4:3 is older video, 1:1 is a profile picture and 3:2 is most cameras.</p>
    </div>
  )
}

export function AspectFitTool() {
  const [sourceWidth, setSourceWidth] = useState('1920')
  const [sourceHeight, setSourceHeight] = useState('1080')
  const [boxWidth, setBoxWidth] = useState('800')
  const [boxHeight, setBoxHeight] = useState('800')
  const fit = fitInto(Number(sourceWidth), Number(sourceHeight), Number(boxWidth), Number(boxHeight))
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Image width"><TextInput type="number" value={sourceWidth} onChange={setSourceWidth} /></Field>
        <Field label="Image height"><TextInput type="number" value={sourceHeight} onChange={setSourceHeight} /></Field>
      </div>
      <div className="tool-row">
        <Field label="Box width"><TextInput type="number" value={boxWidth} onChange={setBoxWidth} /></Field>
        <Field label="Box height"><TextInput type="number" value={boxHeight} onChange={setBoxHeight} /></Field>
      </div>
      <div className="tool-stats">
        <Stat label="fit width" value={fit ? fit.width : '—'} />
        <Stat label="fit height" value={fit ? fit.height : '—'} />
        <Stat label="ratio" value={aspectRatio(Number(sourceWidth) || 0, Number(sourceHeight) || 0) ?? '—'} />
      </div>
      <p className="tool-hint">This is what <code>object-fit: contain</code> does: scale until one side touches, and letterbox the rest.</p>
    </div>
  )
}

/* ---------------- gradient / radius / shadow / grid ---------------- */

export function GradientTool() {
  const [first, setFirst] = useState('#7c3aed')
  const [second, setSecond] = useState('#22d3ee')
  const [angle, setAngle] = useState('135')
  const css = `background: linear-gradient(${angle}deg, ${first}, ${second});`
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="From"><TextInput type="color" value={first} onChange={setFirst} /></Field>
        <Field label="To"><TextInput type="color" value={second} onChange={setSecond} /></Field>
        <Field label="Angle"><TextInput type="number" value={angle} onChange={setAngle} /></Field>
      </div>
      <div className="tool-gradient-preview" style={{ background: `linear-gradient(${angle}deg, ${first}, ${second})` }} />
      <Output label="CSS" value={css} />
      <p className="tool-hint">Angles run clockwise from the bottom, so 0deg is upwards. 135deg points down and to the right.</p>
    </div>
  )
}

export function BorderRadiusTool() {
  const [value, setValue] = useState('24')
  const [unit, setUnit] = useState<'px' | '%'>('%')
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Radius"><TextInput type="number" value={value} onChange={setValue} /></Field>
        <Field label="Unit"><Select value={unit} onChange={setUnit} label="Unit" options={[{ value: 'px', label: 'px' }, { value: '%', label: '%' }]} /></Field>
      </div>
      <div className="tool-radius-preview">
        <div className="tool-radius-box" style={{ borderTopLeftRadius: `${value}${unit}`, borderTopRightRadius: `${value}${unit}`, borderBottomRightRadius: `${value}${unit}`, borderBottomLeftRadius: `${value}${unit}` }} />
      </div>
      <Output label="CSS" value={`border-radius: ${value}${unit};`} />
      <p className="tool-hint">A percentage radius is relative to each side, which makes an ellipse unless the box is square.</p>
    </div>
  )
}

export function BoxShadowTool() {
  const [x, setX] = useState('0')
  const [y, setY] = useState('18')
  const [blur, setBlur] = useState('40')
  const [spread, setSpread] = useState('-12')
  const [opacity, setOpacity] = useState('45')
  const css = `box-shadow: ${x}px ${y}px ${blur}px ${spread}px rgba(0, 0, 0, ${(Number(opacity) / 100).toFixed(2)});`
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="X"><TextInput type="number" value={x} onChange={setX} /></Field>
        <Field label="Y"><TextInput type="number" value={y} onChange={setY} /></Field>
        <Field label="Blur"><TextInput type="number" value={blur} onChange={setBlur} /></Field>
        <Field label="Spread"><TextInput type="number" value={spread} onChange={setSpread} /></Field>
        <Field label="Opacity %"><TextInput type="number" min={0} max={100} value={opacity} onChange={setOpacity} /></Field>
      </div>
      <div className="tool-shadow-preview">
        <div className="tool-shadow-box" style={{ boxShadow: css.replace('box-shadow: ', '').replace(/;$/, '') }} />
      </div>
      <Output label="CSS" value={css} />
      <p className="tool-hint">A negative spread pulls the shadow in behind the box, which is what makes it look like elevation rather than a glow.</p>
    </div>
  )
}

export function SvgGridTool() {
  const [size, setSize] = useState('24')
  const [stroke, setStroke] = useState('#2a2a35')
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <path d="M ${size} 0 L 0 0 0 ${size}" fill="none" stroke="${stroke}" stroke-width="1"/>
</svg>`
  const dataUri = `background-image: url("data:image/svg+xml,${encodeURIComponent(svg)}"); background-size: ${size}px ${size}px;`
  return (
    <div className="tool-panel">
      <div className="tool-row">
        <Field label="Cell size (px)"><TextInput type="number" value={size} onChange={setSize} /></Field>
        <Field label="Line colour"><TextInput type="color" value={stroke} onChange={setStroke} /></Field>
      </div>
      <div className="tool-grid-preview" style={{ backgroundImage: `url("data:image/svg+xml,${encodeURIComponent(svg)}")`, backgroundSize: `${size}px ${size}px` }} />
      <Output label="CSS background" value={dataUri} multiline />
      <p className="tool-hint">One 1px path at the top and left of each cell tiles into a grid — far cheaper than repeating lines.</p>
    </div>
  )
}

/* ---------------- font pairing ---------------- */

const PAIRINGS = [
  { heading: 'Inter', body: 'Source Sans', why: 'A neutral pairing: both are humanist sans, so the contrast comes from weight rather than shape.' },
  { heading: 'Playfair Display', body: 'Lato', why: 'A high-contrast serif heading against a calm sans body — the pairing most editorial sites land on.' },
  { heading: 'Space Grotesk', body: 'IBM Plex Sans', why: 'Both have a slightly technical feel, so the page reads as engineered rather than friendly.' },
]

export function FontPairTool() {
  return (
    <div className="tool-panel">
      <div className="tool-stack">
        {PAIRINGS.map(pairing => (
          <div key={pairing.heading} className="tool-font-pair">
            <div className="tool-font-pair-head" style={{ fontFamily: 'system-ui, sans-serif', fontWeight: 800, letterSpacing: '-0.02em' }}>{pairing.heading}</div>
            <div className="tool-font-pair-body" style={{ fontFamily: 'Georgia, serif' }}>{pairing.body}</div>
            <p className="tool-hint">{pairing.why}</p>
            <CopyButton label="Copy pairing" value={`${pairing.heading} + ${pairing.body}`} />
          </div>
        ))}
      </div>
      <p className="tool-hint">These previews use your system fonts, since loading three more web fonts to show a pairing would be a poor trade on a page this size.</p>
    </div>
  )
}
