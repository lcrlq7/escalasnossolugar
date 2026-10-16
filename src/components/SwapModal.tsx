import { useMemo, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useAssignments } from '../lib/events'
import { useMembers } from '../lib/queries'
import { Button, Field, Modal, Select, Textarea } from './ui'

/** Pedido de troca: o integrante escolhe um colega, o colega aceita e o líder aprova. */
export function SwapModal({ open, assignmentId, eventId, onClose }: { open: boolean; assignmentId: string | null; eventId: string; onClose: () => void }) {
  const { member } = useAuth()
  const toast = useToast()
  const qc = useQueryClient()
  const members = useMembers()
  const asg = useAssignments(eventId)
  const [to, setTo] = useState('')
  const [msg, setMsg] = useState('')
  const [busy, setBusy] = useState(false)
  const mineFn = (asg.data ?? []).find((a) => a.id === assignmentId)?.function_id
  const inEvent = useMemo(() => new Set((asg.data ?? []).map((a) => a.member_id)), [asg.data])
  const skilled = (members.data ?? []).filter((m) => m.active && m.id !== member?.id && !inEvent.has(m.id) && m.member_functions?.some((x) => x.function_id === mineFn))
  const others = (members.data ?? []).filter((m) => m.active && m.id !== member?.id && !inEvent.has(m.id) && !skilled.includes(m))
  const send = async () => {
    if (!assignmentId || !to) return toast.error('Escolha quem vai assumir.')
    setBusy(true)
    try {
      unwrap(await supabase.rpc('request_swap', { p_assignment: assignmentId, p_to_member: to, p_message: msg.trim() || null }))
      toast.success('Pedido enviado. Seu colega foi avisado.')
      qc.invalidateQueries({ queryKey: ['swaps'] }); setTo(''); setMsg(''); onClose()
    } catch (e) { toast.error(e) } finally { setBusy(false) }
  }
  return (
    <Modal open={open} onClose={onClose} size="sm" title="Pedir troca de escala"
      footer={<><Button variant="ghost" onClick={onClose}>Voltar</Button><Button variant="primary" loading={busy} onClick={() => void send()}>Enviar pedido</Button></>}>
      <p className="mb-3 text-sm text-muted">Escolha um colega para assumir o seu lugar. Ele precisa aceitar e o líder aprova a troca.</p>
      <div className="space-y-3">
        <Field label="Quem pode assumir?">
          <Select value={to} onChange={(e) => setTo(e.target.value)}>
            <option value="">Selecione…</option>
            {skilled.length > 0 && <optgroup label="Habilitados nesta função">{skilled.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</optgroup>}
            {others.length > 0 && <optgroup label="Outros integrantes">{others.map((m) => <option key={m.id} value={m.id}>{m.full_name}</option>)}</optgroup>}
          </Select>
        </Field>
        <Field label="Mensagem (opcional)"><Textarea value={msg} maxLength={300} onChange={(e) => setMsg(e.target.value)} placeholder="Ex.: viajo nesse fim de semana" /></Field>
      </div>
    </Modal>
  )
}
