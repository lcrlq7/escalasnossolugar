export interface IcsEvent { id: string; title: string; event_date: string; start_time: string; end_time: string | null; location: string | null; roles?: string[] }

const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\;')
const stamp = (date: string, time: string) => `${date.replace(/-/g, '')}T${time.slice(0, 5).replace(':', '')}00`
const addHours = (date: string, time: string, h: number) => {
  const d = new Date(`${date}T${time.slice(0, 5)}:00`); d.setHours(d.getHours() + h)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`
}
const fold = (l: string) => (l.length <= 74 ? l : l.match(/.{1,73}/g)!.join('\r\n '))

/** Gera um arquivo .ics (agenda do celular) com uma escala por evento, com lembrete 1 dia e 2 horas antes. */
export function buildIcs(events: IcsEvent[]): string {
  const now = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z')
  const out = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Louvor em Escala//PT-BR//', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Minhas escalas do louvor']
  for (const e of events) {
    const role = e.roles?.length ? e.roles.join(', ') : ''
    out.push('BEGIN:VEVENT', `UID:${e.id}@escalasnossolugar.vercel.app`, `DTSTAMP:${now}`,
      `DTSTART:${stamp(e.event_date, e.start_time)}`,
      `DTEND:${e.end_time ? stamp(e.event_date, e.end_time) : addHours(e.event_date, e.start_time, 2)}`,
      `SUMMARY:${esc(`Louvor: ${e.title}${role ? ` (${role})` : ''}`)}`,
      ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
      `DESCRIPTION:${esc(`Você está escalado(a)${role ? ` como ${role}` : ''}.\nDetalhes: https://escalasnossolugar.vercel.app/escalas/${e.id}`)}`,
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Escala amanhã', 'TRIGGER:-P1D', 'END:VALARM',
      'BEGIN:VALARM', 'ACTION:DISPLAY', 'DESCRIPTION:Escala em 2 horas', 'TRIGGER:-PT2H', 'END:VALARM', 'END:VEVENT')
  }
  out.push('END:VCALENDAR')
  return out.map(fold).join('\r\n') + '\r\n'
}

export function downloadIcs(events: IcsEvent[], filename = 'minhas-escalas.ics') {
  const blob = new Blob([buildIcs(events)], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a'); a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 5000)
}
