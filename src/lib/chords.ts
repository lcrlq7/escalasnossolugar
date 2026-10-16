const SHARP = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B']
const FLAT = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B']
const IDX: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5, 'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
}
const CHORD = /^([A-G](?:#|b)?)((?:m|maj|min|M|dim|aug|sus|add|\+|-|°|º|ø|\d|\(|\)|#|b|\/\d)*)(?:\/([A-G](?:#|b)?))?$/

const isChordToken = (t: string) => CHORD.test(t)

function shiftNote(n: string, steps: number, flats: boolean): string {
  const i = IDX[n]
  if (i === undefined) return n
  return (flats ? FLAT : SHARP)[(((i + steps) % 12) + 12) % 12]
}

export function transposeChord(ch: string, steps: number): string {
  const m = CHORD.exec(ch)
  if (!m) return ch
  const flats = m[1].includes('b') || (m[3]?.includes('b') ?? false) || (steps < 0 && !m[1].includes('#'))
  return shiftNote(m[1], steps, flats) + m[2] + (m[3] ? '/' + shiftNote(m[3], steps, flats) : '')
}

export const isChordLine = (line: string) => {
  const toks = line.trim().split(/\s+/).filter(Boolean)
  return toks.length > 0 && toks.every(isChordToken)
}

/** Transpõe só as linhas formadas apenas por acordes, mantendo o alinhamento com a letra. */
export function transposeChart(text: string, steps: number): string {
  if (!steps) return text
  return text.split('\n').map((line) => {
    if (!isChordLine(line)) return line
    const parts = line.split(/(\s+)/)
    for (let i = 0; i < parts.length; i++) {
      const t = parts[i]
      if (!t || /^\s+$/.test(t)) continue
      const nt = transposeChord(t, steps)
      const delta = nt.length - t.length
      parts[i] = nt
      const ws = parts[i + 1]
      if (ws !== undefined && /^\s+$/.test(ws)) parts[i + 1] = ' '.repeat(Math.max(1, ws.length - delta))
    }
    return parts.join('')
  }).join('\n')
}

export function transposeKey(key: string | null | undefined, steps: number): string | null {
  if (!key) return null
  const m = /^([A-G](?:#|b)?)(.*)$/.exec(key.trim())
  if (!m || !steps) return key
  return shiftNote(m[1], steps, m[1].includes('b') || steps < 0) + m[2]
}
