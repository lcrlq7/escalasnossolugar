import { useEffect, useMemo, useState } from 'react'
import { Link, Navigate, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Ban, CheckCheck, ChevronDown, Copy, Eye, Rocket, Save, Trash2, Undo2 } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useMembers, useSchedules } from '../lib/queries'
import { AlertList, TeamEditor } from '../components/TeamEditor'
import { SetlistEditor } from '../components/SetlistEditor'
import { nextWeekday, useAssignments, useEventAlerts, useEventFull, useEventSetlist } from '../lib/events'
import { EVENT_TYPES, STATUS_LABEL, addDays, cn, fmtDateTime, parseDate, todayStr, nextSunday } from '../lib/utils'
import type { EventType } from '../types'
import { confetti } from '../lib/confetti'
import { Badge, Button, Card, ConfirmDialog, Field, Input, Modal, PageHeader, PageLoader, SectionTitle, Select, Textarea } from '../components/ui'
import { statusTone } from './Events'

interface Form { title: string; event_type: EventType; event_date: string; start_time: string; end_time: string; location: string; leader_member_id: string; notes: string; tech_notes: string }
const DEFAULT_TIMES: Record<EventType, string> = { sunday_service: '18:00', thursday_service: '19:30', rehearsal: '19:30', vigil: '22:00', conference: '19:30', custom: '19:00' }

export default function EventEditor() {
  const { id } = useParams()
  const isNew = !id
  const { isLeader, church } = useAuth()
  const nav = useNavigate()
  const [sp] = useSearchParams()
  const qc = useQueryClient()
  const toast = useToast()
  const members = useMembers()
  const schedules = useSchedules()
  const ev = useEventFull(id)
  const assignments = useAssignments(id)
  const setlist = useEventSetlist(id)
  const alerts = useEventAlerts(id, !!ev.data)
  const [f, setF] = useState<Form>({
    title: EVENT_TYPES.sunday_service.label, event_type: 'sunday_service', event_date: sp.get('data') || nextSunday(), start_time: '18:00',
    end_time: '', location: '', leader_member_id: '', notes: '', tech_notes: '',
  })
  const [saving, setSaving] = useState(false)
  const [more, setMore] = useState(false)
  const taken = useQuery({
    queryKey: ['events-taken'], enabled: isNew,
    queryFn: async () => unwrap(await supabase.from('events').select('event_date, event_type').gte('event_date', todayStr()).neq('status', 'cancelled')) as { event_date: string; event_type: string }[],
  })
  // datas prontas: próximos 6 domingos 18h e quintas 19h30 (ou os horários cadastrados)
  const quick = useMemo(() => {
    const base = (schedules.data ?? []).filter((x) => x.active && (x.event_type === 'sunday_service' || x.event_type === 'thursday_service'))
    const rules = base.length ? base.map((x) => ({ weekday: x.weekday, time: x.start_time.slice(0, 5), type: x.event_type, title: x.name?.trim() || EVENT_TYPES[x.event_type].label, location: x.location ?? '' }))
      : [{ weekday: 0, time: '18:00', type: 'sunday_service' as EventType, title: EVENT_TYPES.sunday_service.label, location: '' }, { weekday: 4, time: '19:30', type: 'thursday_service' as EventType, title: EVENT_TYPES.thursday_service.label, location: '' }]
    return rules.flatMap((r) => Array.from({ length: 6 }, (_, k) => ({ ...r, date: addDays(nextWeekday(r.weekday), 7 * k) }))).sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time)).slice(0, 10)
  }, [schedules.data])
  const pickQuick = (q: (typeof quick)[number]) => setF((p) => ({ ...p, event_date: q.date, start_time: q.time, event_type: q.type, title: q.title, location: p.location || q.location }))
  const [publishOpen, setPublishOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [dupOpen, setDupOpen] = useState(false)
  const [dupDate, setDupDate] = useState('')
  const [delOpen, setDelOpen] = useState(false)

  useEffect(() => {
    const e = ev.data
    if (e) setMore(!!(e.location || e.notes || e.tech_notes || e.end_time))
    if (e) setF({
      title: e.title, event_type: e.event_type, event_date: e.event_date, start_time: e.start_time.slice(0, 5), end_time: e.end_time?.slice(0, 5) ?? '',
      location: e.location ?? '', leader_member_id: e.leader_member_id ?? '', notes: e.notes ?? '', tech_notes: e.tech_notes ?? '',
    })
  }, [ev.data])
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }))

  const onType = (t: EventType) => setF((p) => ({
    ...p, event_type: t,
    title: !p.title || Object.values(EVENT_TYPES).some((x) => x.label === p.title) ? EVENT_TYPES[t].label : p.title,
    start_time: isNew ? DEFAULT_TIMES[t] : p.start_time,
  }))

  if (!isLeader) return <Navigate to={id ? `/escalas/${id}` : '/escalas'} replace />
  if (!isNew && (ev.isLoading || assignments.isLoading || setlist.isLoading)) return <PageLoader />
  if (!isNew && !ev.data) return <p className="py-20 text-center text-muted">Escala não encontrada.</p>

  const e = ev.data
  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['event', id] }); qc.invalidateQueries({ queryKey: ['events-list'] })
    qc.invalidateQueries({ queryKey: ['alerts', id] }); qc.invalidateQueries({ queryKey: ['upcoming-alerts'] }); qc.invalidateQueries({ queryKey: ['calendar-events'] })
  }
  const validate = () => {
    if (!f.title.trim()) { toast.error('Informe o nome do culto ou evento.'); return false }
    if (!f.event_date || !f.start_time) { toast.error('Informe a data e o horário de início.'); return false }
    if (f.end_time && f.end_time <= f.start_time) { toast.error('O horário de término deve ser depois do início.'); return false }
    return true
  }
  const payload = () => ({
    title: f.title.trim(), event_type: f.event_type, event_date: f.event_date, start_time: f.start_time, end_time: f.end_time || null,
    location: f.location.trim() || null, leader_member_id: f.leader_member_id || null, notes: f.notes.trim() || null, tech_notes: f.tech_notes.trim() || null,
  })
  const save = async (): Promise<boolean> => {
    if (!validate() || !church) return false
    setSaving(true)
    try {
      if (isNew) {
        const created = unwrap(await supabase.from('events').insert({ ...payload(), church_id: church.id }).select().single()) as { id: string }
        toast.success('Escala criada. Agora monte a equipe e o repertório.')
        qc.invalidateQueries({ queryKey: ['events-list'] }); nav(`/escalas/${created.id}/editar`, { replace: true })
      } else {
        unwrap(await supabase.from('events').update(payload()).eq('id', id!).select().single())
        toast.success('Alterações salvas.'); refresh()
      }
      return true
    } catch (err) { toast.error(err); return false } finally { setSaving(false) }
  }
  const setStatus = async (status: 'draft' | 'published' | 'completed' | 'cancelled', extra: Record<string, unknown> = {}, msg?: string) => {
    try { unwrap(await supabase.from('events').update({ status, ...extra }).eq('id', id!).select().single()); if (msg) toast.success(msg); refresh() }
    catch (err) { toast.error(err) }
  }
  const tryPublish = async () => { if (await save()) { await alerts.refetch(); setPublishOpen(true) } }
  const publish = async () => { setPublishOpen(false); await setStatus('published', {}, 'Escala publicada. Os integrantes foram notificados.'); confetti() }
  const duplicate = async () => {
    if (!dupDate) return toast.error('Escolha a data da nova escala.')
    try { const nid = unwrap(await supabase.rpc('duplicate_event', { p_event_id: id!, p_new_date: dupDate })) as unknown as string; toast.success('Escala duplicada como rascunho.'); setDupOpen(false); qc.invalidateQueries({ queryKey: ['events-list'] }); nav(`/escalas/${nid}/editar`) }
    catch (err) { toast.error(err) }
  }
  const del = async () => {
    try { unwrap(await supabase.from('events').delete().eq('id', id!).select()); toast.success('Escala excluída.'); qc.invalidateQueries({ queryKey: ['events-list'] }); nav('/escalas') } catch (err) { toast.error(err) }
  }

  const al = alerts.data ?? []
  const blocking = al.filter((a) => a.severity !== 'info')
  return (
    <div>
      <PageHeader title={isNew ? 'Nova escala' : 'Editar escala'}
        subtitle={e ? `Criada por ${e.creator?.full_name ?? '—'} · última alteração ${fmtDateTime(e.updated_at)}${e.updater ? ` por ${e.updater.full_name}` : ''}` : 'Preencha os dados do culto e continue para a equipe e o repertório.'}
        actions={<>
          {e && <Badge tone={statusTone(e.status)}>{STATUS_LABEL[e.status]}</Badge>}
          {e && <Link to={`/escalas/${e.id}`}><Button variant="outline"><Eye className="h-4 w-4" />Visualizar</Button></Link>}
        </>} />

      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="space-y-6">
          <Card className="p-5">
            <SectionTitle title="1. Dados do culto" />
            {isNew && (
              <div className="mb-4">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide text-muted">Escolha a data</p>
                <div className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-2">
                  {quick.map((q) => {
                    const on = f.event_date === q.date && f.start_time === q.time
                    const has = (taken.data ?? []).some((t) => t.event_date === q.date && t.event_type === q.type)
                    const d = parseDate(q.date)
                    return (
                      <button key={`${q.date}-${q.time}`} type="button" onClick={() => pickQuick(q)}
                        className={cn('press shrink-0 rounded-xl border px-3.5 py-2 text-left transition', on ? 'border-accent bg-accent/15' : 'border-border hover:bg-surface2')}>
                        <span className="block text-[11px] font-bold uppercase text-muted">{new Intl.DateTimeFormat('pt-BR', { weekday: 'short' }).format(d).replace('.', '')} · {q.time.replace(':', 'h').replace('h00', 'h')}</span>
                        <span className="block text-base font-extrabold">{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' }).format(d).replace('.', '')}</span>
                        {has && <span className="block text-[10px] font-semibold text-ok">já tem escala</span>}
                      </button>)
                  })}
                </div>
              </div>)}
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Data *"><Input type="date" value={f.event_date} onChange={(x) => set('event_date', x.target.value)} /></Field>
              <Field label="Início *"><Input type="time" value={f.start_time} onChange={(x) => set('start_time', x.target.value)} /></Field>
              <Field label="Ministro responsável" className="sm:col-span-2" hint="Quem for escolhido aqui monta o repertório e cria a playlist desta escala."><Select value={f.leader_member_id} onChange={(x) => set('leader_member_id', x.target.value)}><option value="">Selecionar…</option>
                {(members.data ?? []).filter((m) => m.active).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</Select></Field>
            </div>
            <button type="button" onClick={() => setMore((v) => !v)} className="mt-4 flex items-center gap-1.5 text-sm font-semibold text-accenttext">
              <ChevronDown className={cn('h-4 w-4 transition', more && 'rotate-180')} />{more ? 'Menos opções' : 'Mais opções (nome, tipo, local, observações…)'}
            </button>
            {more && (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field label="Tipo de evento"><Select value={f.event_type} onChange={(x) => onType(x.target.value as EventType)}>{Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
                <Field label="Nome do culto ou evento *"><Input value={f.title} onChange={(x) => set('title', x.target.value)} /></Field>
                <Field label="Término"><Input type="time" value={f.end_time} onChange={(x) => set('end_time', x.target.value)} /></Field>
                <Field label="Local"><Input value={f.location} onChange={(x) => set('location', x.target.value)} placeholder="Ex.: Templo principal" /></Field>
                <Field label="Observações gerais" className="sm:col-span-2"><Textarea value={f.notes} onChange={(x) => set('notes', x.target.value)} placeholder="Avisos para a equipe: chegada, roupa, ensaio antes do culto…" /></Field>
                <Field label="Informações técnicas (para o técnico de som)" className="sm:col-span-2"><Textarea value={f.tech_notes} onChange={(x) => set('tech_notes', x.target.value)} /></Field>
              </div>)}
            <div className="mt-5 flex justify-end"><Button variant="primary" loading={saving} onClick={() => void save()}><Save className="h-4 w-4" />{isNew ? 'Criar escala e continuar' : 'Salvar dados'}</Button></div>
          </Card>

          {e && assignments.data && (
            <Card className="p-5">
              <SectionTitle title="2. Equipe" subtitle="Escolha os integrantes por função. Avisos aparecem ao lado, mas você decide como resolver." />
              <TeamEditor event={e} assignments={assignments.data} />
            </Card>)}

          {e && setlist.data && (
            <Card className="p-5">
              <SectionTitle title="3. Repertório" subtitle="Arraste para reordenar. Mudar o tom aqui não altera o cadastro da música." />
              <SetlistEditor setlist={setlist.data} eventType={e.event_type} />
            </Card>)}
        </div>

        {e && (
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <Card className="p-5">
              <SectionTitle title="Avisos da escala" />
              {al.length === 0 ? <p className="text-sm text-ok">Tudo certo: nenhum aviso pendente.</p> : <AlertList alerts={al} />}
            </Card>
            <Card className="space-y-2 p-5">
              <SectionTitle title="Ações" />
              {e.status === 'draft' && <Button variant="primary" className="w-full" onClick={() => void tryPublish()}><Rocket className="h-4 w-4" />Publicar escala</Button>}
              {e.status === 'published' && <>
                <Button className="w-full" onClick={() => void setStatus('completed', {}, 'Escala marcada como concluída.')}><CheckCheck className="h-4 w-4" />Marcar como concluída</Button>
                <Button variant="outline" className="w-full" onClick={() => void setStatus('draft', {}, 'Escala voltou para rascunho.')}><Undo2 className="h-4 w-4" />Voltar para rascunho</Button></>}
              {(e.status === 'cancelled' || e.status === 'completed') && <Button variant="outline" className="w-full" onClick={() => void setStatus('draft', { cancel_reason: null }, 'Escala reaberta como rascunho.')}><Undo2 className="h-4 w-4" />Reabrir como rascunho</Button>}
              <Button variant="outline" className="w-full" onClick={() => { setDupDate(todayStr()); setDupOpen(true) }}><Copy className="h-4 w-4" />Duplicar escala</Button>
              {e.status !== 'cancelled' && <Button variant="danger" className="w-full" onClick={() => setCancelOpen(true)}><Ban className="h-4 w-4" />Cancelar escala</Button>}
              {(e.status === 'draft' || e.status === 'cancelled') && <Button variant="ghost" className="w-full text-danger" onClick={() => setDelOpen(true)}><Trash2 className="h-4 w-4" />Excluir definitivamente</Button>}
            </Card>
          </aside>)}
      </div>

      <Modal open={publishOpen} onClose={() => setPublishOpen(false)} title="Publicar escala"
        footer={<><Button variant="ghost" onClick={() => setPublishOpen(false)}>Voltar e corrigir</Button><Button variant="primary" onClick={() => void publish()}>{blocking.length ? 'Publicar mesmo assim' : 'Publicar'}</Button></>}>
        <p className="mb-3 text-sm text-muted">Ao publicar, os integrantes escalados recebem uma notificação para confirmar presença.</p>
        {al.length === 0 ? <p className="text-sm text-ok">Nenhum aviso: a escala está completa.</p> : <AlertList alerts={al} />}
      </Modal>
      <Modal open={cancelOpen} onClose={() => setCancelOpen(false)} size="sm" title="Cancelar escala"
        footer={<><Button variant="ghost" onClick={() => setCancelOpen(false)}>Voltar</Button><Button variant="danger" onClick={async () => { await setStatus('cancelled', { cancel_reason: cancelReason.trim() || null }, 'Escala cancelada.'); setCancelOpen(false) }}>Cancelar escala</Button></>}>
        <Field label="Motivo (opcional)"><Textarea value={cancelReason} onChange={(x) => setCancelReason(x.target.value)} /></Field>
        <p className="mt-3 text-xs text-muted">Se a escala estava publicada, os integrantes serão avisados.</p>
      </Modal>
      <Modal open={dupOpen} onClose={() => setDupOpen(false)} size="sm" title="Duplicar escala"
        footer={<><Button variant="ghost" onClick={() => setDupOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => void duplicate()}>Duplicar</Button></>}>
        <Field label="Data da nova escala" hint="A equipe volta como “aguardando confirmação” e o repertório é copiado."><Input type="date" value={dupDate} onChange={(x) => setDupDate(x.target.value)} /></Field>
      </Modal>
      <ConfirmDialog open={delOpen} danger title="Excluir escala?" text="A escala, a equipe e o repertório vinculado serão removidos. Esta ação não pode ser desfeita." confirmLabel="Excluir" onClose={() => setDelOpen(false)} onConfirm={() => void del()} />
    </div>
  )
}
