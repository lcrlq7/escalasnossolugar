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
  const doc = new jsPDF({ unit: 'mm', format: 'a4' })
  header(doc, opts.church, opts.title, opts.subtitle)
  let y = 44
  doc.setFontSize(10); doc.setTextColor(60, 60, 60)
  if (opts.leader) { doc.text(`Líder responsável: ${opts.leader}`, 14, y); y += 5 }
  if (opts.location) { doc.text(`Local: ${opts.location}`, 14, y); y += 5 }
  // equipe agrupada por função (mesma ordem da escala)
  const groups: { role: string; names: string[] }[] = []
  for (const t of opts.team) {
    const g = groups.find((x) => x.role === t.role)
    if (g) g.names.push(t.name); else groups.push({ role: t.role, names: [t.name] })
  }
  autoTable(doc, {
    startY: y + 2, head: [['Função', 'Integrantes']], body: groups.length ? groups.map((g) => [g.role, g.names.join(', ')]) : [['', 'Equipe ainda não definida']],
    headStyles: { fillColor: DARK, textColor: [255, 255, 255] }, alternateRowStyles: { fillColor: [247, 247, 244] },
    styles: { fontSize: 10, cellPadding: 2.6 }, columnStyles: { 0: { cellWidth: 42, fontStyle: 'bold' } }, margin: { left: 14, right: 14 },
  })
  let last = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  if (opts.items.length > 0) {
    y = last + 8
    doc.setFont('helvetica', 'bold'); doc.setFontSize(12); doc.setTextColor(...DARK); doc.text('Repertório', 14, y)
    setlistTable(doc, opts.items, y + 3)
    last = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY
  }
  const extra: string[][] = []
  if (opts.notes) extra.push(['Observações gerais', opts.notes])
  if (opts.techNotes) extra.push(['Informações técnicas', opts.techNotes])
  if (extra.length) {
    autoTable(doc, { startY: last + 8, body: extra, theme: 'grid', styles: { fontSize: 9 }, columnStyles: { 0: { cellWidth: 38, fontStyle: 'bold' } }, margin: { left: 14, right: 14 } })
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
