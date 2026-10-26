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

/** PDF com todas as escalas do mês: um bloco por culto (data, ministro, equipe por função e repertório). */
export function exportMonthPdf(opts: { church: string; monthLabel: string; month: string; events: MonthEvent[] }) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, opts.church, `Escala de ${opts.monthLabel}`, `${opts.events.length} ${opts.events.length === 1 ? 'culto' : 'cultos'}`)
  let y = 46
  const ensure = (h: number) => { if (y + h > 280) { doc.addPage(); y = 16 } }
  if (opts.events.length === 0) {
    doc.setFont('helvetica', 'normal'); doc.setFontSize(11); doc.setTextColor(90, 90, 90)
    doc.text('Nenhuma escala neste mês.', 14, y)
  }
  for (const e of opts.events) {
    const d = new Date(`${e.event_date}T12:00:00`)
    const when = `${WD[d.getDay()]}, ${e.event_date.slice(8, 10)}/${e.event_date.slice(5, 7)} · ${e.start_time.slice(0, 5)}${e.end_time ? ` – ${e.end_time.slice(0, 5)}` : ''}`
    const groups: { role: string; names: string[] }[] = []
    for (const t of [...e.team].sort((a, b) => a.order - b.order)) {
      const g = groups.find((x) => x.role === t.role)
      if (g) g.names.push(t.name); else groups.push({ role: t.role, names: [t.name] })
    }
    ensure(30 + groups.length * 7)
    doc.setFillColor(...GOLD); doc.rect(14, y, 1.6, 9, 'F')
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...DARK)
    doc.text(`${when}  ·  ${e.title}`, 18, y + 4)
    doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(90, 90, 90)
    const meta = [e.leader ? `Ministro: ${e.leader}` : null, e.location, e.status === 'draft' ? 'Rascunho' : null].filter(Boolean).join('  ·  ')
    if (meta) doc.text(meta, 18, y + 8.5)
    y += 12
    autoTable(doc, {
      startY: y, head: [['Função', 'Integrantes']], body: groups.length ? groups.map((g) => [g.role, g.names.join(', ')]) : [['', 'Equipe ainda não definida']],
      headStyles: { fillColor: DARK, textColor: [255, 255, 255], fontSize: 8.5 }, alternateRowStyles: { fillColor: [247, 247, 244] },
      styles: { fontSize: 9, cellPadding: 1.8 }, columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
    })
    y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 3
    if (e.songs.length) {
      const line = `Repertório: ${e.songs.map((s) => (s.key ? `${s.title} (${s.key})` : s.title)).join('  ·  ')}`
      const lines = doc.splitTextToSize(line, 182) as string[]
      ensure(lines.length * 4.5 + 4)
      doc.setFont('helvetica', 'normal'); doc.setFontSize(9); doc.setTextColor(60, 60, 60)
      doc.text(lines, 14, y + 3); y += lines.length * 4.5 + 2
    }
    y += 8
  }
  doc.save(`escala-${opts.month}.pdf`)
}
