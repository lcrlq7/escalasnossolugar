import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { searchMusic } from '../lib/music'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useCategories, useFunctions, useMembers, useSchedules } from '../lib/queries'
import { EVENT_TYPES, ROLE_LABEL, WEEKDAYS, fmtTime } from '../lib/utils'
import type { EventType, Profile, Role, ServiceSchedule, WFunction, Category } from '../types'
import { Avatar, Badge, Button, Card, ConfirmDialog, Field, IconButton, Input, Modal, PageHeader, PageLoader, SectionTitle, Select, Tabs, Toggle } from '../components/ui'

const ROLES: Role[] = ['admin', 'leader', 'minister', 'sound_tech']
type Tab = 'church' | 'users' | 'functions' | 'categories' | 'schedules' | 'integrations'

function ChurchTab() {
  const { church, refresh } = useAuth()
  const toast = useToast()
  const [name, setName] = useState(church?.name ?? '')
  const [sys, setSys] = useState(church?.system_name ?? '')
  const [busy, setBusy] = useState(false)
  const save = async () => {
    setBusy(true)
    try {
      unwrap(await supabase.from('churches').update({ name: name.trim(), system_name: sys.trim() }).eq('id', church!.id).select().single())
      await refresh(); toast.success('Configurações salvas.')
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  return (
    <Card className="max-w-xl space-y-4 p-5">
      <Field label="Nome da igreja"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
      <Field label="Nome do sistema"><Input value={sys} onChange={(e) => setSys(e.target.value)} /></Field>
      <Button variant="primary" loading={busy} disabled={!name.trim() || !sys.trim()} onClick={save}>Salvar</Button>
    </Card>
  )
}

interface UserRow extends Profile { roles: Role[] }

function UsersTab() {
  const toast = useToast()
  const qc = useQueryClient()
  const { session } = useAuth()
  const members = useMembers()
  const [busy, setBusy] = useState<string | null>(null)
  const q = useQuery({
    queryKey: ['admin-users'],
    queryFn: async () => {
      const [p, r] = await Promise.all([
        supabase.from('profiles').select('*').order('created_at'),
        supabase.from('user_roles').select('user_id, role'),
      ])
      const profs = unwrap(p) as Profile[]
      const roles = unwrap(r) as { user_id: string; role: Role }[]
      return profs.map((x) => ({ ...x, roles: roles.filter((y) => y.user_id === x.id).map((y) => y.role) })) as UserRow[]
    },
  })
  const reload = () => { qc.invalidateQueries({ queryKey: ['admin-users'] }); qc.invalidateQueries({ queryKey: ['members'] }) }
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key)
    try { await fn(); toast.success(ok); reload() } catch (e) { toast.error(e) } finally { setBusy(null) }
  }
  const setActive = (u: UserRow, active: boolean) => run(u.id, async () => unwrap(await supabase.rpc('admin_set_user_active', { p_user: u.id, p_active: active })), active ? 'Acesso liberado.' : 'Acesso desativado.')
  const toggleRole = (u: UserRow, role: Role) => run(u.id + role, async () => {
    if (u.roles.includes(role)) unwrap(await supabase.from('user_roles').delete().eq('user_id', u.id).eq('role', role).select())
    else unwrap(await supabase.from('user_roles').insert({ user_id: u.id, role }).select())
  }, 'Cargos atualizados.')
  const link = (u: UserRow, memberId: string) => run(u.id + 'm', async () => {
    if (memberId === '__new') unwrap(await supabase.rpc('admin_create_member_for_user', { p_user: u.id }))
    else unwrap(await supabase.rpc('admin_link_member', { p_user: u.id, p_member: memberId }))
  }, 'Integrante vinculado.')

  if (q.isLoading) return <PageLoader />
  const pending = (q.data ?? []).filter((u) => !u.active)
  const linked = (uid: string) => (members.data ?? []).find((m) => m.profile_id === uid)
  const Row = ({ u }: { u: UserRow }) => (
    <Card className="space-y-3 p-4">
      <div className="flex items-center gap-3">
        <Avatar name={u.full_name} />
        <div className="min-w-0 flex-1"><p className="truncate font-bold">{u.full_name}</p><p className="truncate text-xs text-muted">{u.email}</p></div>
        {u.active ? <Badge tone="ok">Ativo</Badge> : <Badge tone="warn">Aguardando</Badge>}
        {u.id === session?.user.id ? <Badge>Você</Badge> : u.active
          ? <Button size="sm" variant="outline" loading={busy === u.id} onClick={() => setActive(u, false)}>Desativar</Button>
          : <Button size="sm" variant="primary" loading={busy === u.id} onClick={() => setActive(u, true)}>Liberar acesso</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {ROLES.map((r) => {
          const on = u.roles.includes(r)
          return <button key={r} disabled={busy === u.id + r || (u.id === session?.user.id && r === 'admin' && on)} onClick={() => toggleRole(u, r)} aria-pressed={on}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${on ? 'border-accent bg-accent text-accentfg' : 'border-border text-muted hover:bg-surface2'}`}>{ROLE_LABEL[r]}</button>
        })}
      </div>
      {u.active && (
        <Field label="Integrante vinculado">
          <Select value={linked(u.id)?.id ?? ''} disabled={!!linked(u.id) || busy === u.id + 'm'} onChange={(e) => e.target.value && link(u, e.target.value)}>
            <option value="">{linked(u.id) ? linked(u.id)!.full_name : 'Sem vínculo'}</option>
            {!linked(u.id) && <option value="__new">Criar integrante com os dados deste usuário</option>}
            {!linked(u.id) && (members.data ?? []).filter((m) => !m.profile_id).map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}
          </Select>
        </Field>)}
    </Card>
  )
  return (
    <div className="space-y-6">
      {pending.length > 0 && <div><SectionTitle title={`Aguardando liberação (${pending.length})`} /><div className="grid gap-3 lg:grid-cols-2">{pending.map((u) => <Row key={u.id} u={u} />)}</div></div>}
      <div><SectionTitle title="Usuários" /><div className="grid gap-3 lg:grid-cols-2">{(q.data ?? []).filter((u) => u.active).map((u) => <Row key={u.id} u={u} />)}</div></div>
    </div>
  )
}

function SimpleCrud<T extends { id: string }>({ title, items, table, fields, blank, render, extra }: {
  title: string; items: T[]; table: string; blank: Record<string, unknown>
  fields: (f: Record<string, unknown>, set: (k: string, v: unknown) => void) => React.ReactNode
  render: (i: T) => React.ReactNode; extra?: (i: T) => React.ReactNode
}) {
  const { church } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const [edit, setEdit] = useState<{ id?: string; f: Record<string, unknown> } | null>(null)
  const [del, setDel] = useState<T | null>(null)
  const [busy, setBusy] = useState(false)
  const done = () => qc.invalidateQueries()
  const save = async () => {
    if (!edit) return
    setBusy(true)
    try {
      if (edit.id) unwrap(await supabase.from(table).update(edit.f).eq('id', edit.id).select().single())
      else unwrap(await supabase.from(table).insert({ ...edit.f, church_id: church!.id }).select().single())
      toast.success('Salvo.'); setEdit(null); done()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!del) return
    setBusy(true)
    try { unwrap(await supabase.from(table).delete().eq('id', del.id).select()); toast.success('Removido.'); setDel(null); done() }
    catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  return (
    <div>
      <SectionTitle title={title} action={<Button variant="primary" size="sm" onClick={() => setEdit({ f: { ...blank } })}><Plus className="h-4 w-4" />Adicionar</Button>} />
      <Card className="divide-y divide-border">
        {items.length === 0 && <p className="p-6 text-center text-sm text-muted">Nada cadastrado ainda.</p>}
        {items.map((i) => (
          <div key={i.id} className="flex items-center gap-3 px-4 py-3">
            <div className="min-w-0 flex-1">{render(i)}</div>
            {extra?.(i)}
            <IconButton label="Editar" onClick={() => setEdit({ id: i.id, f: { ...(i as unknown as Record<string, unknown>) } })}><Pencil className="h-4 w-4" /></IconButton>
            <IconButton label="Excluir" onClick={() => setDel(i)}><Trash2 className="h-4 w-4 text-danger" /></IconButton>
          </div>))}
      </Card>
      <Modal open={!!edit} onClose={() => setEdit(null)} title={edit?.id ? 'Editar' : 'Adicionar'}
        footer={<><Button variant="outline" onClick={() => setEdit(null)}>Cancelar</Button><Button variant="primary" loading={busy} onClick={save}>Salvar</Button></>}>
        {edit && <div className="space-y-4">{fields(edit.f, (k, v) => setEdit({ ...edit, f: { ...edit.f, [k]: v } }))}</div>}
      </Modal>
      <ConfirmDialog open={!!del} danger title="Excluir item?" text="Se ele estiver em uso, a exclusão será bloqueada — nesse caso, desative-o." confirmLabel="Excluir" loading={busy} onConfirm={remove} onClose={() => setDel(null)} />
    </div>
  )
}

function FunctionsTab() {
  const q = useFunctions()
  if (q.isLoading) return <PageLoader />
  return <SimpleCrud<WFunction> title="Funções do ministério" items={q.data ?? []} table="worship_functions"
    blank={{ name: '', is_required: false, is_main: false, is_instrument: false, sort_order: (q.data?.length ?? 0) + 1, active: true }}
    render={(i) => <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{i.name}</span>{i.is_required && <Badge tone="accent">Obrigatória</Badge>}{i.is_main && <Badge>Principal</Badge>}{i.is_instrument && <Badge>Instrumento</Badge>}{!i.active && <Badge tone="warn">Inativa</Badge>}</div>}
    fields={(f, set) => (<>
      <Field label="Nome"><Input value={String(f.name ?? '')} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Ordem"><Input type="number" value={Number(f.sort_order ?? 0)} onChange={(e) => set('sort_order', Number(e.target.value))} /></Field>
      <Toggle label="Obrigatória em todo culto" checked={!!f.is_required} onChange={(v) => set('is_required', v)} />
      <Toggle label="Função principal (ex.: ministro)" checked={!!f.is_main} onChange={(v) => set('is_main', v)} />
      <Toggle label="Instrumento" checked={!!f.is_instrument} onChange={(v) => set('is_instrument', v)} />
      <Toggle label="Ativa" checked={!!f.active} onChange={(v) => set('active', v)} />
    </>)} />
}

function CategoriesTab() {
  const q = useCategories()
  if (q.isLoading) return <PageLoader />
  return <SimpleCrud<Category> title="Categorias do repertório" items={q.data ?? []} table="setlist_categories"
    blank={{ name: '', sort_order: (q.data?.length ?? 0) + 1 }}
    render={(i) => <span className="font-semibold">{i.sort_order}. {i.name}</span>}
    fields={(f, set) => (<>
      <Field label="Nome"><Input value={String(f.name ?? '')} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Ordem no culto"><Input type="number" value={Number(f.sort_order ?? 0)} onChange={(e) => set('sort_order', Number(e.target.value))} /></Field>
    </>)} />
}

function SchedulesTab() {
  const q = useSchedules()
  if (q.isLoading) return <PageLoader />
  return <SimpleCrud<ServiceSchedule> title="Horários de culto" items={q.data ?? []} table="service_schedules"
    blank={{ name: '', event_type: 'sunday_service' as EventType, weekday: 0, start_time: '19:00', end_time: null, location: null, active: true }}
    render={(i) => <div><p className="font-semibold">{i.name} {!i.active && <Badge tone="warn">Inativo</Badge>}</p><p className="text-xs text-muted">{WEEKDAYS[i.weekday]} · {fmtTime(i.start_time)}{i.end_time ? `–${fmtTime(i.end_time)}` : ''}{i.location ? ` · ${i.location}` : ''}</p></div>}
    fields={(f, set) => (<>
      <Field label="Nome"><Input value={String(f.name ?? '')} onChange={(e) => set('name', e.target.value)} /></Field>
      <Field label="Tipo"><Select value={String(f.event_type)} onChange={(e) => set('event_type', e.target.value)}>{Object.entries(EVENT_TYPES).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select></Field>
      <Field label="Dia da semana"><Select value={String(f.weekday)} onChange={(e) => set('weekday', Number(e.target.value))}>{WEEKDAYS.map((d, n) => <option key={d} value={n}>{d}</option>)}</Select></Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Início"><Input type="time" value={String(f.start_time ?? '').slice(0, 5)} onChange={(e) => set('start_time', e.target.value)} /></Field>
        <Field label="Término"><Input type="time" value={String(f.end_time ?? '').slice(0, 5)} onChange={(e) => set('end_time', e.target.value || null)} /></Field>
      </div>
      <Field label="Local"><Input value={String(f.location ?? '')} onChange={(e) => set('location', e.target.value || null)} /></Field>
      <Toggle label="Ativo" checked={!!f.active} onChange={(v) => set('active', v)} />
    </>)} />
}

function IntegrationsTab() {
  const [res, setRes] = useState<Record<string, string> | null>(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')
  const test = async () => {
    setBusy(true); setErr('')
    try { setRes((await searchMusic('Aleluia')).sources) } catch (e) { setRes(null); setErr(e instanceof Error ? e.message : 'Falha no teste.') } finally { setBusy(false) }
  }
  const NAME: Record<string, string> = { itunes: 'iTunes / Apple Music (capas, artista, duração)', youtube: 'YouTube (busca de vídeos)', spotify: 'Spotify (busca de faixas)' }
  return (
    <Card className="max-w-2xl space-y-4 p-5">
      <p className="text-sm text-muted">A pesquisa de músicas roda numa função segura do servidor. As chaves do YouTube e do Spotify ficam apenas como segredos no Supabase (nunca no navegador). O iTunes funciona sem chave. Sem chave, as demais fontes ficam desativadas e nada é inventado.</p>
      <Button variant="outline" loading={busy} onClick={test}>Testar integrações</Button>
      {err && <p className="text-sm text-danger">{err}</p>}
      {res && <ul className="space-y-2 text-sm">{Object.entries(res).map(([k, v]) => <li key={k} className="flex items-start justify-between gap-3"><span>{NAME[k] ?? k}</span><Badge tone={v === 'ok' ? 'ok' : 'warn'}>{v === 'ok' ? 'Funcionando' : v}</Badge></li>)}</ul>}
    </Card>
  )
}

export default function Settings() {
  const [tab, setTab] = useState<Tab>('users')
  return (
    <div>
      <PageHeader title="Configurações" subtitle="Usuários, funções, categorias, horários e integrações." />
      <Tabs value={tab} onChange={setTab} items={[
        { value: 'users', label: 'Usuários' }, { value: 'functions', label: 'Funções' }, { value: 'categories', label: 'Categorias' },
        { value: 'schedules', label: 'Horários' }, { value: 'integrations', label: 'Integrações' }, { value: 'church', label: 'Igreja' }]} />
      {tab === 'church' && <ChurchTab />}
      {tab === 'users' && <UsersTab />}
      {tab === 'functions' && <FunctionsTab />}
      {tab === 'categories' && <CategoriesTab />}
      {tab === 'schedules' && <SchedulesTab />}
      {tab === 'integrations' && <IntegrationsTab />}
    </div>
  )
}
