import clsx, { type ClassValue } from 'clsx'
import type { EventStatus, EventType, ResponseStatus, Role } from '../types'

export const cn = (...v: ClassValue[]) => clsx(v)

export const EVENT_TYPES: Record<EventType, { label: string; color: string }> = {
  sunday_service: { label: 'Culto de domingo', color: '#F9C700' },
  thursday_service: { label: 'Culto de quinta-feira', color: '#5B9BF0' },
  rehearsal: { label: 'Ensaio', color: '#4AC882' },
  vigil: { label: 'Vigília', color: '#A78BFA' },
  conference: { label: 'Conferência', color: '#F59E0B' },
  custom: { label: 'Evento personalizado', color: '#94A3B8' },
}
export const STATUS_LABEL: Record<EventStatus, string> = {
  draft: 'Rascunho', published: 'Publicada', completed: 'Concluída', cancelled: 'Cancelada',
}
export const RESPONSE_LABEL: Record<ResponseStatus, string> = {
  pending: 'Aguardando', confirmed: 'Confirmado', declined: 'Recusou',
}
export const ROLE_LABEL: Record<Role, string> = {
  admin: 'Administrador', leader: 'Líder do louvor', minister: 'Ministro de louvor', sound_tech: 'Técnico de som',
}
export const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado']
export const KEYS = [
  'C', 'C#', 'Db', 'D', 'Eb', 'E', 'F', 'F#', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B',
  'Cm', 'C#m', 'Dm', 'Ebm', 'Em', 'Fm', 'F#m', 'Gm', 'G#m', 'Am', 'Bbm', 'Bm',
]

/** Converte 'YYYY-MM-DD' em Date local (evita deslocamento de fuso). */
export function parseDate(d: string): Date {
  const [y, m, day] = d.slice(0, 10).split('-').map(Number)
  return new Date(y, m - 1, day)
}
export const fmtDate = (d?: string | null) => (d ? d.slice(0, 10).split('-').reverse().join('/') : '')
export const fmtTime = (t?: string | null) => (t ? t.slice(0, 5) : '')
export const fmtDateTime = (iso?: string | null) => {
  if (!iso) return ''
  const dt = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(dt.getDate())}/${p(dt.getMonth() + 1)}/${dt.getFullYear()} ${p(dt.getHours())}:${p(dt.getMinutes())}`
}
export function toISODate(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}
export const todayStr = () => toISODate(new Date())
export function addDays(d: string, n: number): string {
  const dt = parseDate(d); dt.setDate(dt.getDate() + n); return toISODate(dt)
}
export function fmtDateLong(d: string): string {
  return new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }).format(parseDate(d))
}
export function monthLabel(d: string): string {
  return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(parseDate(d))
}
export function fmtDuration(sec?: number | null): string {
  if (!sec && sec !== 0) return ''
  const m = Math.floor(sec / 60), s = Math.round(sec % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}
export function fmtTotal(sec: number): string {
  const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}min` : `${m} min`
}
/** Aceita "3:45" ou "225" e devolve segundos. */
export function parseDuration(v: string): number | null {
  const t = v.trim()
  if (!t) return null
  if (t.includes(':')) {
    const [m, s] = t.split(':').map(Number)
    if (Number.isNaN(m) || Number.isNaN(s)) return null
    return m * 60 + s
  }
  const n = Number(t)
  return Number.isNaN(n) ? null : Math.round(n)
}
export const normalize = (s: string) =>
  s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()

export function isUrl(v: string): boolean {
  try { const u = new URL(v); return u.protocol === 'http:' || u.protocol === 'https:' } catch { return false }
}
export const youtubeSearchUrl = (q: string) => `https://www.youtube.com/results?search_query=${encodeURIComponent(q)}`
export const spotifySearchUrl = (q: string) => `https://open.spotify.com/search/${encodeURIComponent(q)}`

export function nextSunday(from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  d.setDate(d.getDate() + ((7 - d.getDay()) % 7))
  return toISODate(d)
}

/** Só aceita links http(s); evita `javascript:` e similares em href. */
export function safeUrl(u?: string | null): string | undefined {
  if (!u) return undefined
  try { const p = new URL(u.trim()); return p.protocol === 'https:' || p.protocol === 'http:' ? p.href : undefined } catch { return undefined }
}
