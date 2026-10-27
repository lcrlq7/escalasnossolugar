import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ResolvedItem } from './setlist'
import { totalSeconds, KIND_LABEL } from './setlist'
import { fmtDuration, fmtTotal } from './utils'

const GOLD: [number, number, number] = [249, 199, 0]
const DARK: [number, number, number] = [24, 24, 27]

function header(doc: jsPDF, church: string, title: string, subtitle?: string) {
  doc.setFillColor(...DARK); doc.rect(0, 0, 210, 28, 'F')
  doc.setFillColor(...GOLD); doc.rect(0, 28, 210, 1.6, 'F')
  doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(9)
  doc.text(church.toUpperCase(), 14, 11)
  doc.setFontSize(17); doc.text(title, 14, 21)
  doc.setTextColor(60, 60, 60); doc.setFont('helvetica', 'normal'); doc.setFontSize(10)
  if (subtitle) doc.text(subtitle, 14, 38)
}

function setlistTable(doc: jsPDF, items: ResolvedItem[], startY: number) {
  autoTable(doc, {
    startY,
    head: [['#', 'Música / momento', 'Artista', 'Tom', 'Duração', 'Etapa']],
    body: items.map((i, idx) => i.kind === 'song'
      ? [String(idx + 1), i.song?.title ?? '', i.song?.artist ?? '', i.key ?? '', fmtDuration(i.duration), i.category ?? '']
      : [String(idx + 1), `${KIND_LABEL[i.kind]}${i.note ? ` — ${i.note}` : ''}`, '', '', i.duration ? fmtDuration(i.duration) : '', i.category ?? '']),
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [247, 247, 244] },
    styles: { fontSize: 10, cellPadding: 2.6, valign: 'middle' },
    columnStyles: { 0: { cellWidth: 9 }, 3: { cellWidth: 16, fontStyle: 'bold' }, 4: { cellWidth: 20 } },
    margin: { left: 14, right: 14 },
  })
  const t = totalSeconds(items)
  const y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8
  doc.setFont('helvetica', 'bold'); doc.setFontSize(10); doc.setTextColor(...DARK)
  doc.text(`Duração total: ${fmtTotal(t.total)}${t.unknown ? ` (+ ${t.unknown} música(s) sem duração)` : ''}`, 14, y)
  // observações das músicas
  const notes = items.filter((i) => i.kind === 'song' && i.note)
  if (notes.length) {
    autoTable(doc, {
      startY: y + 4, head: [['Observações']], body: notes.map((i) => [`${i.song?.title}: ${i.note}`]),
      headStyles: { fillColor: GOLD, textColor: DARK }, styles: { fontSize: 9 }, margin: { left: 14, right: 14 },
    })
  }
}

export function exportSetlistPdf(opts: { church: string; title: string; subtitle?: string; items: ResolvedItem[] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, opts.church, opts.title, opts.subtitle)
  setlistTable(doc, opts.items, 44)
  doc.save(`${opts.title.replace(/[^\w\- ]+/g, '').trim() || 'repertorio'}.pdf`)
}

export function exportEventPdf(opts: {
  church: string; title: string; subtitle: string; leader?: string | null; location?: string | null
  team: { role: string; name: string }[]; items: ResolvedItem[]; notes?: string | null; techNotes?: string | null
}) {
  // Paisagem: equipe em cartões à esquerda, repertório numerado à direita
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297, H = 210, M = 14
  const frame = (cont: boolean) => {
    doc.setFillColor(...DARK); doc.rect(0, 0, W, 26, 'F'); doc.setFillColor(...GOLD); doc.rect(0, 26, W, 1.6, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(8.5); doc.text(opts.church.toUpperCase(), M, 9)
    doc.setFontSize(18); doc.text(cont ? `${opts.title} (continuação)` : opts.title, M, 19.5)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(10.5); doc.setTextColor(...GOLD); doc.text(opts.subtitle, W - M, 19.5, { align: 'right' })
  }
  frame(false)
  const meta = [opts.leader ? `Ministro: ${opts.leader}` : null, opts.location ? `Local: ${opts.location}` : null].filter(Boolean).join('   ·   ')
  let top = 36
  if (meta) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(90, 90, 90); doc.text(meta, M, top); top += 7 }

  // equipe agrupada por função
  const groups: { role: string; names: string[] }[] = []
  for (const t of opts.team) {
    const g = groups.find((x) => x.role === t.role)
    if (g) g.names.push(t.name); else groups.push({ role: t.role, names: [t.name] })
  }
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...DARK); doc.text('EQUIPE', M, top + 2)
  const leftW = 138, gap = 5, cw = (leftW - gap) / 2
  const colY = [top + 7, top + 7]
  if (groups.length === 0) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(120, 120, 120); doc.text('Equipe ainda não definida.', M, top + 10) }
  for (const g of groups) {
    doc.setFont('helvetica', 'bold'); doc.setFontSize(10.5)
    const lines = doc.splitTextToSize(g.names.join(', '), cw - 10) as string[]
    const h = 11 + lines.length * 4.8
    const col = colY[0] <= colY[1] ? 0 : 1
    const x = M + col * (cw + gap), y = colY[col]
    doc.setFillColor(247, 247, 244); doc.setDrawColor(227, 227, 222); doc.roundedRect(x, y, cw, h, 2, 2, 'FD')
    doc.setFillColor(...GOLD); doc.rect(x, y + 2, 1, h - 4, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(7.5); doc.setTextColor(110, 110, 110); doc.text(g.role.toUpperCase(), x + 5, y + 5.5)
    doc.setFontSize(10.5); doc.setTextColor(...DARK); doc.text(lines, x + 5, y + 11)
    colY[col] += h + 3.5
  }

  // repertório à direita
  const rx = M + leftW + 12, rw = W - M - rx
  doc.setFont('helvetica', 'bold'); doc.setFontSize(11); doc.setTextColor(...DARK); doc.text('REPERTÓRIO', rx, top + 2)
  const rowH = 11.5, bottom = H - 22
  let y = top + 11
  if (opts.items.length === 0) { doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(120, 120, 120); doc.text('Repertório ainda não definido.', rx, y) }
  opts.items.forEach((i, idx) => {
    const sub = i.kind === 'song' ? (i.note ?? '') : ''
    const need = rowH + (sub ? 4 : 0)
    if (y + need > bottom) { doc.addPage(); frame(true); y = 40 }
    doc.setFillColor(...GOLD); doc.circle(rx + 4, y - 1.2, 4, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(9.5); doc.setTextColor(...DARK); doc.text(String(idx + 1), rx + 4, y + 0.1, { align: 'center' })
    if (i.kind === 'song') {
      doc.setFontSize(12); doc.text(doc.splitTextToSize(i.song?.title ?? '', rw - 30)[0] as string, rx + 12, y)
      if (i.key) { doc.setFontSize(12); doc.text(i.key, rx + rw, y, { align: 'right' }) }
      if (sub) { doc.setFont('helvetica', 'normal'); doc.setFontSize(8.5); doc.setTextColor(110, 110, 110); doc.text(doc.splitTextToSize(sub, rw - 14)[0] as string, rx + 12, y + 4.6) }
    } else {
      doc.setFont('helvetica', 'italic'); doc.setFontSize(11); doc.setTextColor(90, 90, 90)
      doc.text(`${KIND_LABEL[i.kind]}${i.note ? ` — ${i.note}` : ''}`.slice(0, 70), rx + 12, y)
    }
    doc.setDrawColor(227, 227, 222); doc.line(rx + 12, y + (sub ? 7 : 3.6), rx + rw, y + (sub ? 7 : 3.6))
    y += need
  })
  // observações no rodapé da primeira página
  const foot = [opts.notes ? `Observações: ${opts.notes}` : null, opts.techNotes ? `Técnica: ${opts.techNotes}` : null].filter(Boolean).join('     ')
  if (foot) {
    doc.setPage(1); doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 90, 90)
    doc.text(doc.splitTextToSize(foot, W - 2 * M).slice(0, 2) as string[], M, H - 12)
  }
  doc.save(`${opts.title.replace(/[^\w\- ]+/g, '').trim() || 'escala'}.pdf`)
}

export interface MonthEvent {
  title: string; event_date: string; start_time: string; end_time: string | null; location: string | null; status: string
  leader: string | null
  team: { role: string; name: string; order: number }[]
  songs: { title: string; key: string | null }[]
}

const WD = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']

const WD_FULL = ['DOMINGO', 'SEGUNDA-FEIRA', 'TERÇA-FEIRA', 'QUARTA-FEIRA', 'QUINTA-FEIRA', 'SEXTA-FEIRA', 'SÁBADO']

/** PDF do mês em grade (como a planilha): uma tabela por dia da semana, datas nas colunas e funções nas linhas. */
export function exportMonthPdf(opts: { church: string; monthLabel: string; month: string; events: MonthEvent[] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297, M = 12
  const frame = (first: boolean) => {
    doc.setFillColor(...DARK); doc.rect(0, 0, W, first ? 20 : 12, 'F'); doc.setFillColor(...GOLD); doc.rect(0, first ? 20 : 12, W, 1.2, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(first ? 15 : 10)
    doc.text(`ESCALA ${opts.monthLabel.toUpperCase()}`, M, first ? 13 : 8)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(210, 210, 210)
    doc.text(opts.church, W - M, first ? 13 : 8, { align: 'right' })
  }
  frame(true)
  let y = 30
  const last = () => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  if (opts.events.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90, 90, 90)
    doc.text('Nenhuma escala neste mês.', M, y)
  }
  // agrupa por dia da semana (domingo por último)
  const byDay = new Map<number, MonthEvent[]>()
  for (const e of opts.events) { const wd = new Date(`${e.event_date}T12:00:00`).getDay(); byDay.set(wd, [...(byDay.get(wd) ?? []), e]) }
  const days = [...byDay.entries()].sort((a, b) => ((a[0] + 6) % 7) - ((b[0] + 6) % 7))
  for (const [wd, evs] of days) {
    evs.sort((a, b) => a.event_date.localeCompare(b.event_date) || a.start_time.localeCompare(b.start_time))
    // linhas = funções; funções com várias pessoas viram "Função 1, 2, 3"
    const roles = new Map<string, { order: number; max: number }>()
    for (const e of evs) {
      const cnt = new Map<string, number>()
      for (const t of e.team) {
        cnt.set(t.role, (cnt.get(t.role) ?? 0) + 1)
        const r = roles.get(t.role) ?? { order: t.order, max: 0 }
        r.order = Math.min(r.order, t.order); r.max = Math.max(r.max, cnt.get(t.role)!); roles.set(t.role, r)
      }
    }
    const rows: { label: string; role: string; idx: number }[] = []
    for (const [role, r] of [...roles.entries()].sort((a, b) => a[1].order - b[1].order))
      for (let i = 0; i < r.max; i++) rows.push({ label: r.max > 1 ? `${role} ${i + 1}` : role, role, idx: i })
    const people = (e: MonthEvent, role: string) => e.team.filter((t) => t.role === role).sort((a, b) => a.order - b.order)
    const body = rows.map((r) => [r.label, ...evs.map((e) => people(e, r.role)[r.idx]?.name ?? '')])
    const need = 14 + (body.length + 2) * 6.2
    if (y + need > 205) { doc.addPage(); frame(false); y = 20 }
    const cw = Math.min(46, (W - 2 * M - 34) / evs.length)
    autoTable(doc, {
      startY: y, margin: { left: M, right: M }, theme: 'grid', tableWidth: 34 + cw * evs.length,
      head: [[{ content: WD_FULL[wd], styles: { halign: 'left' } }, ...evs.map((e) => `${e.event_date.slice(8, 10)}/${e.event_date.slice(5, 7)}/${e.event_date.slice(0, 4)}`)],
        ['Ministro', ...evs.map((e) => e.leader ?? '—')]],
      body,
      styles: { fontSize: 9.5, cellPadding: 1.6, lineColor: [40, 40, 40], lineWidth: 0.25, textColor: DARK, halign: 'center', valign: 'middle' },
      headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontStyle: 'bold' },
      columnStyles: { 0: { cellWidth: 34, halign: 'left', fontStyle: 'bold', fillColor: [250, 243, 205] } },
      didParseCell: (d) => { if (d.section === 'head' && d.row.index === 1) { d.cell.styles.fillColor = [250, 243, 205]; d.cell.styles.textColor = DARK; d.cell.styles.fontSize = 8.5 } },
    })
    y = last() + 10
  }
  // repertórios do mês
  const withSongs = opts.events.filter((e) => e.songs.length)
  if (withSongs.length) {
    doc.addPage(); frame(false)
    autoTable(doc, {
      startY: 20, margin: { left: M, right: M }, theme: 'grid',
      head: [['Data', 'Culto', 'Repertório']],
      body: withSongs.map((e) => [`${WD[new Date(`${e.event_date}T12:00:00`).getDay()]} ${e.event_date.slice(8, 10)}/${e.event_date.slice(5, 7)}`, e.title, e.songs.map((s, i) => `${i + 1}. ${s.title}${s.key ? ` (${s.key})` : ''}`).join('\n')]),
      styles: { fontSize: 9, cellPadding: 2, lineColor: [200, 200, 200], lineWidth: 0.2, textColor: DARK, valign: 'top' },
      headStyles: { fillColor: DARK, textColor: [255, 255, 255] }, columnStyles: { 0: { cellWidth: 26, fontStyle: 'bold' }, 1: { cellWidth: 60 } },
    })
  }
  doc.save(`escala-${opts.month}.pdf`)
}

export interface AvailabilityReport {
  church: string; monthLabel: string; month: string
  dates: { date: string; label: string }[] // datas de culto do mês
  rows: { name: string; cells: ('available' | 'unavailable' | null)[]; scheduled: boolean[]; unavailDates: string[]; notes: string[] }[]
}

/** Relatório de disponibilidade do mês: integrantes nas linhas, datas de culto nas colunas. */
export function exportAvailabilityPdf(r: AvailabilityReport) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'landscape' })
  const W = 297, M = 12
  const frame = (first: boolean) => {
    doc.setFillColor(...DARK); doc.rect(0, 0, W, first ? 20 : 12, 'F'); doc.setFillColor(...GOLD); doc.rect(0, first ? 20 : 12, W, 1.2, 'F')
    doc.setTextColor(255, 255, 255); doc.setFont('helvetica', 'bold'); doc.setFontSize(first ? 15 : 10)
    doc.text(`DISPONIBILIDADE ${r.monthLabel.toUpperCase()}`, M, first ? 13 : 8)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(210, 210, 210)
    doc.text(r.church, W - M, first ? 13 : 8, { align: 'right' })
  }
  frame(true)
  const un = r.rows.filter((x) => x.unavailDates.length)
  doc.setFont('helvetica', 'normal'); doc.setFontSize(10); doc.setTextColor(60, 60, 60)
  doc.text(`${un.length} de ${r.rows.length} integrantes marcaram algum dia indisponível. Vermelho = indisponível · Verde = disponível · "escalado" = já está na equipe.`, M, 28)
  autoTable(doc, {
    startY: 32, margin: { left: M, right: M, top: 18 }, theme: 'grid', showHead: 'everyPage',
    head: [['Integrante', ...r.dates.map((d) => d.label), 'Dias indisponíveis no mês']],
    body: r.rows.map((x) => [x.name, ...x.cells.map((c, i) => (c === 'unavailable' ? 'Indisp.' : c === 'available' ? 'Disp.' : '—') + (x.scheduled[i] ? '\nescalado' : '')), x.unavailDates.join(', ') || '—']),
    styles: { fontSize: 8.5, cellPadding: 1.5, lineColor: [200, 200, 200], lineWidth: 0.2, textColor: DARK, halign: 'center', valign: 'middle' },
    headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8.5 },
    columnStyles: { 0: { halign: 'left', fontStyle: 'bold', cellWidth: 44 }, [r.dates.length + 1]: { halign: 'left', cellWidth: 60 } },
    didParseCell: (d) => {
      if (d.section !== 'body' || d.column.index === 0 || d.column.index > r.dates.length) return
      const c = r.rows[d.row.index]?.cells[d.column.index - 1]
      if (c === 'unavailable') { d.cell.styles.fillColor = [252, 222, 222]; d.cell.styles.textColor = [160, 30, 30]; d.cell.styles.fontStyle = 'bold' }
      else if (c === 'available') { d.cell.styles.fillColor = [222, 245, 230]; d.cell.styles.textColor = [25, 110, 55] }
    },
  })
  const withNotes = r.rows.filter((x) => x.notes.length)
  if (withNotes.length) {
    autoTable(doc, {
      startY: (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8, margin: { left: M, right: M, top: 18 }, theme: 'grid',
      head: [['Observações', '']], body: withNotes.map((x) => [x.name, x.notes.join('\n')]),
      styles: { fontSize: 9, cellPadding: 1.8, lineColor: [200, 200, 200], lineWidth: 0.2, textColor: DARK, valign: 'top' },
      headStyles: { fillColor: DARK, textColor: [255, 255, 255] }, columnStyles: { 0: { cellWidth: 50, fontStyle: 'bold' } },
    })
  }
  doc.save(`disponibilidade-${r.month}.pdf`)
}
