import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Megaphone, Plus, Trash2 } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { fmtDate } from '../lib/utils'
import { Button, Card, ConfirmDialog, EmptyState, Field, Input, Modal, PageHeader, PageLoader, Textarea } from '../components/ui'

interface Ann { id: string; title: string; body: string | null; created_at: string }

/** Mural de avisos da igreja: todos leem; líder e administrador publicam e apagam. */
export default function Announcements() {
  const { isLeader, profile } = useAuth()
  const qc = useQueryClient()
  const toast = useToast()
  const [open, setOpen] = useState(false)
  const [f, setF] = useState({ title: '', body: '' })
  const [del, setDel] = useState<Ann | null>(null)
  const [busy, setBusy] = useState(false)
  const q = useQuery({
    queryKey: ['announcements-all'],
    queryFn: async () => unwrap(await supabase.from('announcements').select('id, title, body, created_at').order('created_at', { ascending: false }).limit(100)) as Ann[],
  })
  const refresh = () => { qc.invalidateQueries({ queryKey: ['announcements-all'] }); qc.invalidateQueries({ queryKey: ['announcements'] }) }
  const publish = async () => {
    if (!f.title.trim()) return toast.error('Informe o título do aviso.')
    setBusy(true)
    try {
      const { data: me } = await supabase.from('profiles').select('church_id').eq('id', profile!.id).single()
      unwrap(await supabase.from('announcements').insert({ title: f.title.trim(), body: f.body.trim() || null, church_id: me!.church_id }).select().single())
      setF({ title: '', body: '' }); setOpen(false); refresh(); toast.success('Aviso publicado.')
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  const remove = async () => {
    if (!del) return
    setBusy(true)
    try { unwrap(await supabase.from('announcements').delete().eq('id', del.id).select()); setDel(null); refresh() } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  return (
    <div>
      <PageHeader title="Avisos" subtitle="Recados importantes do ministério de louvor."
        actions={isLeader && <Button variant="primary" onClick={() => setOpen(true)}><Plus className="h-4 w-4" />Novo aviso</Button>} />
      {q.isLoading ? <PageLoader /> : (q.data ?? []).length === 0 ? (
        <EmptyState icon={<Megaphone className="h-6 w-6" />} title="Nenhum aviso no momento" text={isLeader ? 'Publique um aviso para toda a equipe ver.' : undefined} />
      ) : (
        <div className="stagger grid gap-3">{q.data!.map((a) => (
          <Card key={a.id} className="p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0"><p className="font-bold">{a.title}</p><p className="text-[11px] text-muted">{fmtDate(a.created_at)}</p></div>
              {isLeader && <button aria-label="Excluir aviso" onClick={() => setDel(a)} className="shrink-0 rounded-lg p-2 text-muted hover:text-danger"><Trash2 className="h-4 w-4" /></button>}
            </div>
            {a.body && <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted">{a.body}</p>}
          </Card>))}</div>)}
      <Modal open={open} onClose={() => setOpen(false)} size="sm" title="Novo aviso"
        footer={<><Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button><Button variant="primary" loading={busy} onClick={() => void publish()}>Publicar</Button></>}>
        <div className="space-y-3"><Field label="Título"><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} /></Field>
          <Field label="Mensagem"><Textarea value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} /></Field></div>
      </Modal>
      <ConfirmDialog open={!!del} title="Excluir aviso?" text={del ? `“${del.title}” será removido para todos.` : ''} confirmLabel="Excluir" danger loading={busy} onConfirm={() => void remove()} onClose={() => setDel(null)} />
    </div>
  )
}
