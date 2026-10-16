import { useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, ListMusic, Plus, Star, Trash2 } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { SetlistEditor } from '../components/SetlistEditor'
import { fmtDate } from '../lib/utils'
import type { Setlist } from '../types'
import { Badge, Button, Card, ConfirmDialog, EmptyState, Field, IconButton, Input, Modal, PageHeader, PageLoader, Tabs } from '../components/ui'

type Row = Setlist & { event: { title: string; event_date: string; status: string } | null; items: { count: number }[] }

export function SetlistsPage() {
  const { church } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const nav = useNavigate()
  const [tab, setTab] = useState<'tpl' | 'past'>('tpl')
  const [open, setOpen] = useState(false)
  const [name, setName] = useState('')
  const [del, setDel] = useState<Row | null>(null)
  const q = useQuery({
    queryKey: ['setlists'],
    queryFn: async () => unwrap(await supabase.from('setlists').select('*, event:events(title,event_date,status), items:setlist_items(count)').order('updated_at', { ascending: false }).limit(300)) as unknown as Row[],
  })
  const tpl = (q.data ?? []).filter((s) => s.is_template)
  const past = (q.data ?? []).filter((s) => s.event_id && s.event).sort((a, b) => (b.event!.event_date).localeCompare(a.event!.event_date))
  const create = async () => {
    if (!name.trim()) return toast.error('Dê um nome ao repertório.')
    try { const s = unwrap(await supabase.from('setlists').insert({ church_id: church!.id, name: name.trim(), is_template: true }).select().single()) as Setlist; setOpen(false); setName(''); qc.invalidateQueries({ queryKey: ['setlists'] }); nav(`/repertorios/${s.id}`) }
    catch (e) { toast.error(e) }
  }
  const dup = async (s: Row) => {
    try { const id = unwrap(await supabase.rpc('duplicate_setlist', { p_source: s.id, p_name: `${s.name} (cópia)`, p_template: true })) as unknown as string; toast.success('Repertório duplicado.'); qc.invalidateQueries({ queryKey: ['setlists'] }); nav(`/repertorios/${id}`) }
    catch (e) { toast.error(e) }
  }
  const remove = async () => {
    if (!del) return
    try { unwrap(await supabase.from('setlists').delete().eq('id', del.id).select()); toast.success('Repertório excluído.'); qc.invalidateQueries({ queryKey: ['setlists'] }) } catch (e) { toast.error(e) }
    setDel(null)
  }
  const list = tab === 'tpl' ? tpl : past
  return (
    <div>
      <PageHeader title="Repertórios" subtitle="Seus modelos favoritos e os repertórios de cultos anteriores."
        actions={<Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Novo repertório</Button>} />
      <Tabs value={tab} onChange={setTab} items={[{ value: 'tpl', label: 'Favoritos e modelos', count: tpl.length }, { value: 'past', label: 'De cultos', count: past.length }]} />
      {q.isLoading ? <PageLoader /> : list.length === 0 ? (
        <EmptyState icon={<ListMusic className="h-6 w-6" />} title={tab === 'tpl' ? 'Nenhum modelo salvo' : 'Nenhum repertório de culto ainda'}
          text={tab === 'tpl' ? 'Crie um repertório-modelo ou salve um repertório de culto como favorito para reutilizá-lo.' : 'Os repertórios aparecem aqui conforme você cria escalas.'} />
      ) : (
        <div className="stagger grid gap-3 sm:grid-cols-2">
          {list.map((s) => (
            <Card key={s.id} className="flex items-center gap-3 p-4">
              <Link to={s.event_id ? `/escalas/${s.event_id}/editar` : `/repertorios/${s.id}`} className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate font-bold">{s.is_favorite && <Star className="h-4 w-4 shrink-0 fill-accent text-accent" />}{s.name}</p>
                <p className="mt-0.5 text-xs text-muted">{s.items?.[0]?.count ?? 0} itens{s.event ? ` · culto de ${fmtDate(s.event.event_date)}` : ''}</p>
              </Link>
              {s.event?.status === 'draft' && <Badge tone="warn">Rascunho</Badge>}
              <IconButton label="Duplicar como modelo" onClick={() => void dup(s)}><Copy className="h-4 w-4" /></IconButton>
              {!s.event_id && <IconButton label="Excluir" onClick={() => setDel(s)}><Trash2 className="h-4 w-4" /></IconButton>}
            </Card>))}
        </div>)}
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Novo repertório" footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => void create()}>Criar</Button></>}>
        <Field label="Nome"><Input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="Ex.: Culto de celebração — modelo" /></Field>
      </Modal>
      <ConfirmDialog open={!!del} danger title="Excluir repertório?" text={`"${del?.name}" será removido. As músicas continuam na biblioteca.`} confirmLabel="Excluir" onClose={() => setDel(null)} onConfirm={() => void remove()} />
    </div>
  )
}

export function SetlistDetail() {
  const { id } = useParams()
  const qc = useQueryClient()
  const toast = useToast()
  const [name, setName] = useState<string | null>(null)
  const q = useQuery({ queryKey: ['setlist', id], queryFn: async () => unwrap(await supabase.from('setlists').select('*').eq('id', id!).maybeSingle()) as Setlist | null })
  if (q.isLoading) return <PageLoader />
  const s = q.data
  if (!s) return <EmptyState title="Repertório não encontrado" action={<Link to="/repertorios"><Button variant="primary">Voltar</Button></Link>} />
  const save = async () => {
    if (name === null) return
    try { unwrap(await supabase.from('setlists').update({ name: name.trim() || s.name }).eq('id', s.id).select().single()); setName(null); qc.invalidateQueries({ queryKey: ['setlist', id] }); qc.invalidateQueries({ queryKey: ['setlists'] }); toast.success('Nome atualizado.') } catch (e) { toast.error(e) }
  }
  const toggleFav = async () => {
    try { unwrap(await supabase.from('setlists').update({ is_favorite: !s.is_favorite }).eq('id', s.id).select().single()); qc.invalidateQueries({ queryKey: ['setlist', id] }); qc.invalidateQueries({ queryKey: ['setlists'] }) } catch (e) { toast.error(e) }
  }
  return (
    <div>
      <PageHeader title={s.name} subtitle="Modelo de repertório. Aplique em uma escala usando “Copiar de outro repertório”."
        actions={<><Button variant="outline" onClick={() => setName(s.name)}>Renomear</Button><Button variant={s.is_favorite ? 'primary' : 'outline'} onClick={() => void toggleFav()}><Star className="h-4 w-4" />{s.is_favorite ? 'Favorito' : 'Favoritar'}</Button></>} />
      <Card className="p-5"><SetlistEditor setlist={s} /></Card>
      <Modal open={name !== null} onClose={() => setName(null)} size="sm" title="Renomear" footer={<><Button variant="ghost" onClick={() => setName(null)}>Cancelar</Button><Button variant="primary" onClick={() => void save()}>Salvar</Button></>}>
        <Input value={name ?? ''} onChange={(e) => setName(e.target.value)} />
      </Modal>
    </div>
  )
}
