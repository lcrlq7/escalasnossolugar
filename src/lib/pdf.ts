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
