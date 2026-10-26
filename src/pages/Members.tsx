import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Mail, Pencil, Phone, Plus, Search, Trash2, UserCheck } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useFunctions, useMembers } from '../lib/queries'
import { cn, normalize, todayStr } from '../lib/utils'
import type { Member } from '../types'
import { Avatar, Badge, Button, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Textarea, Toggle } from '../components/ui'

function MemberModal({ open, member, onClose }: { open: boolean; member: Member | null; onClose: () => void }) {
  const { church } = useAuth()
  const fns = useFunctions()
  const toast = useToast()
  const qc = useQueryClient()
  const [f, setF] = useState({ full_name: '', phone: '', email: '', notes: '', active: true })
  const [sel, setSel] = useState<string[]>([])
  const [saving, setSaving] = useState(false)
  const [loaded, setLoaded] = useState<string | null>(null)
  const [delOpen, setDelOpen] = useState(false)
  const key = open ? (member?.id ?? 'new') : null
  if (key && loaded !== key) {
    setLoaded(key)
    setF({ full_name: member?.full_name ?? '', phone: member?.phone ?? '', email: member?.email ?? '', notes: member?.notes ?? '', active: member?.active ?? true })
    setSel(member?.member_functions?.map((x) => x.function_id) ?? [])
  }
  if (!open && loaded) setLoaded(null)
  const save = async () => {
    if (!f.full_name.trim()) return toast.error('Informe o nome do integrante.')
    setSaving(true)
    try {
      const payload = { full_name: f.full_name.trim(), phone: f.phone.trim() || null, email: f.email.trim() || null, notes: f.notes.trim() || null, active: f.active }
      let id = member?.id
      if (member) unwrap(await supabase.from('members').update(payload).eq('id', member.id).select().single())
      else id = (unwrap(await supabase.from('members').insert({ ...payload, church_id: church!.id }).select().single()) as Member).id
      const before = new Set(member?.member_functions?.map((x) => x.function_id) ?? [])
      const rem = [...before].filter((x) => !sel.includes(x)), add = sel.filter((x) => !before.has(x))
      if (rem.length) unwrap(await supabase.from('member_functions').delete().eq('member_id', id!).in('function_id', rem).select())
      if (add.length) unwrap(await supabase.from('member_functions').insert(add.map((function_id) => ({ member_id: id!, function_id }))).select())
      toast.success(member ? 'Integrante atualizado.' : 'Integrante cadastrado.')
      qc.invalidateQueries({ queryKey: ['members'] }); onClose()
    } catch (e) { toast.error(e) } finally { setSaving(false) }
  }
  const remove = async () => {
    if (!member) return
    try {
      unwrap(await supabase.from('members').delete().eq('id', member.id).select())
      toast.success('Integrante excluído.'); setDelOpen(false); qc.invalidateQueries({ queryKey: ['members'] }); onClose()
    } catch (e) {
      setDelOpen(false)
      const m = e instanceof Error ? e.message : String((e as { message?: string })?.message ?? '')
      if (/foreign key|violates|23503|event_assignments/i.test(m)) toast.error('Este integrante já está em escalas e não pode ser excluído. Desative-o: ele deixa de aparecer para novas escalas e o histórico é mantido.')
      else toast.error(e)
    }
  }
  return (
    <Modal open={open} onClose={onClose} title={member ? 'Editar integrante' : 'Novo integrante'}
      footer={<>{member && <Button variant="ghost" className="mr-auto text-danger" onClick={() => setDelOpen(true)}><Trash2 className="h-4 w-4" />Excluir</Button>}<Button variant="ghost" onClick={onClose}>Cancelar</Button><Button variant="primary" loading={saving} onClick={() => void save()}>Salvar</Button></>}>
      <div className="space-y-4">
        <Field label="Nome completo *"><Input value={f.full_name} onChange={(e) => setF({ ...f, full_name: e.target.value })} /></Field>
        <div className="stagger grid gap-4 sm:grid-cols-2">
          <Field label="Telefone / WhatsApp"><Input inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label="E-mail"><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        </div>
        <Field label="Funções e instrumentos que toca">
          <div className="flex flex-wrap gap-2">{(fns.data ?? []).filter((x) => x.active).map((x) => (
            <button key={x.id} type="button" onClick={() => setSel((s) => (s.includes(x.id) ? s.filter((i) => i !== x.id) : [...s, x.id]))}
              className={cn('rounded-full border px-3 py-1.5 text-sm font-semibold', sel.includes(x.id) ? 'border-accent bg-accent/15 text-accenttext' : 'border-border text-muted')}>{x.name}</button>))}</div>
        </Field>
        <Field label="Observações"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
        <Toggle checked={f.active} onChange={(v) => setF({ ...f, active: v })} label="Integrante ativo (pode ser escalado)" />
      </div>
      <ConfirmDialog open={delOpen} danger title="Excluir integrante?" text={`${member?.full_name ?? ''} será removido da lista${member?.profile_id ? ' e perderá o vínculo com a conta de acesso (a conta continua existindo)' : ''}. Se já participou de escalas, desative em vez de excluir.`} confirmLabel="Excluir" onClose={() => setDelOpen(false)} onConfirm={() => void remove()} />
    </Modal>
  )
}

export default function Members() {
  const { isLeader: isAdmin } = useAuth()
  const members = useMembers()
  const fns = useFunctions()
  // medidor: quantas vezes cada pessoa está escalada no mês (só líder/admin)
  const ym = todayStr().slice(0, 7)
  const monthEnd = `${ym}-${String(new Date(Number(ym.slice(0, 4)), Number(ym.slice(5, 7)), 0).getDate()).padStart(2, '0')}`
  const usage = useQuery({
    queryKey: ['attendance-month', ym], enabled: isAdmin,
    queryFn: async () => (unwrap(await supabase.rpc('attendance_report', { p_from: `${ym}-01`, p_to: monthEnd })) ?? []) as { member_id: string; total: number }[],
  })
  const count = useMemo(() => new Map((usage.data ?? []).map((u) => [u.member_id, u.total])), [usage.data])
  const maxCount = Math.max(1, ...(usage.data ?? []).map((u) => u.total))
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<Member | null>(null)
  const [open, setOpen] = useState(false)
  const [showInactive, setShowInactive] = useState(false)
  const fname = useMemo(() => new Map((fns.data ?? []).map((f) => [f.id, f.name])), [fns.data])
  const list = (members.data ?? []).filter((m) => (showInactive || m.active) && (!q || normalize(`${m.full_name} ${m.member_functions?.map((x) => fname.get(x.function_id)).join(' ')}`).includes(normalize(q))))
  return (
    <div>
      <PageHeader title="Integrantes" subtitle="Equipe do ministério de louvor, funções e contatos."
        actions={isAdmin && <Button variant="primary" onClick={() => { setEdit(null); setOpen(true) }}><Plus className="h-4 w-4" />Novo integrante</Button>} />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative min-w-[14rem] flex-1"><Search className="pointer-events-none absolute left-3.5 top-3 h-4 w-4 text-muted" /><Input className="!pl-10" placeholder="Buscar por nome ou função" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {isAdmin && <Toggle checked={showInactive} onChange={setShowInactive} label="Mostrar inativos" />}
      </div>
      {members.isLoading ? <PageLoader /> : list.length === 0 ? (
        <EmptyState title="Nenhum integrante cadastrado" text={isAdmin ? 'Cadastre os integrantes do ministério. Só quem está na lista pode ser escalado.' : 'Um líder ainda não cadastrou integrantes.'}
          action={isAdmin && <Button variant="primary" onClick={() => { setEdit(null); setOpen(true) }}><Plus className="h-4 w-4" />Cadastrar integrante</Button>} />
      ) : (
        <div className="stagger grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((m) => (
            <div key={m.id} className={cn('card p-4', !m.active && 'opacity-60')}>
              <div className="flex items-start gap-3">
                <Avatar name={m.full_name} size={44} />
                <div className="min-w-0 flex-1"><p className="truncate font-bold">{m.full_name}</p>
                  <div className="mt-0.5 flex flex-wrap gap-1.5">{m.profile_id && <Badge tone="ok"><UserCheck className="h-3 w-3" />Com acesso</Badge>}{!m.active && <Badge tone="warn">Inativo</Badge>}</div></div>
                {isAdmin && <button aria-label={`Editar ${m.full_name}`} onClick={() => { setEdit(m); setOpen(true) }} className="rounded-lg p-2 text-muted hover:bg-surface2 hover:text-fg"><Pencil className="h-4 w-4" /></button>}
              </div>
              {isAdmin && m.active && (
                <div className="mt-3" title="Vezes escalado(a) neste mês">
                  <div className="mb-1 flex items-center justify-between text-xs"><span className="text-muted">Escalas no mês</span><b className={cn(count.get(m.id) && (count.get(m.id) ?? 0) >= 4 ? 'text-warn' : 'text-fg')}>{count.get(m.id) ?? 0}</b></div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-surface2"><div className={cn('h-full rounded-full transition-all', (count.get(m.id) ?? 0) >= 4 ? 'bg-warn' : 'bg-accent')} style={{ width: `${((count.get(m.id) ?? 0) / maxCount) * 100}%` }} /></div>
                </div>)}
              <div className="mt-3 flex flex-wrap gap-1.5">{m.member_functions?.map((x) => <Badge key={x.function_id} tone="accent">{fname.get(x.function_id)}</Badge>)}{!m.member_functions?.length && <span className="text-xs text-muted">Sem funções definidas</span>}</div>
              {(m.phone || m.email) && <div className="mt-3 space-y-1 text-xs text-muted">
                {m.phone && <a className="flex items-center gap-1.5 hover:text-fg" href={`tel:${m.phone}`}><Phone className="h-3.5 w-3.5" />{m.phone}</a>}
                {m.email && <a className="flex items-center gap-1.5 hover:text-fg" href={`mailto:${m.email}`}><Mail className="h-3.5 w-3.5" />{m.email}</a>}</div>}
            </div>))}
        </div>)}
      <MemberModal open={open} member={edit} onClose={() => setOpen(false)} />
    </div>
  )
}
