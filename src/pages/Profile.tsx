import { useEffect, useState } from 'react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { useToast } from '../context/Toast'
import { useTheme } from '../context/Theme'
import { ROLE_LABEL } from '../lib/utils'
import { disablePush, enablePush, pushStatus } from '../lib/push'
import { Avatar, Badge, Button, Card, Field, Input, PageHeader, SectionTitle } from '../components/ui'

export default function Profile() {
  const { profile, roles, member, session, refresh, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const toast = useToast()
  const [name, setName] = useState(profile?.full_name ?? '')
  const [phone, setPhone] = useState(profile?.phone ?? '')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [busy, setBusy] = useState<string | null>(null)
  const [push, setPush] = useState<'unsupported' | 'denied' | 'on' | 'off'>('off')
  useEffect(() => { void pushStatus().then(setPush) }, [])
  const togglePush = async () => {
    setBusy('n')
    try {
      if (push === 'on') { await disablePush(); toast.success('Avisos no celular desativados neste aparelho.') }
      else { await enablePush(session!.user.id); toast.success('Avisos ativados neste aparelho!') }
      setPush(await pushStatus())
    } catch (e) { toast.error(e) } finally { setBusy(null) }
  }

  const saveProfile = async () => {
    if (!name.trim()) return toast.error('Informe seu nome.')
    setBusy('p')
    try {
      unwrap(await supabase.from('profiles').update({ full_name: name.trim(), phone: phone.trim() || null }).eq('id', session!.user.id).select().single())
      await refresh(); toast.success('Perfil atualizado.')
    } catch (e) { toast.error(e) } finally { setBusy(null) }
  }
  const savePw = async () => {
    if (pw.length < 6) return toast.error('A senha deve ter ao menos 6 caracteres.')
    if (pw !== pw2) return toast.error('As senhas não conferem.')
    setBusy('w')
    const { error } = await supabase.auth.updateUser({ password: pw })
    setBusy(null)
    if (error) return toast.error(error.message)
    setPw(''); setPw2(''); toast.success('Senha alterada.')
  }
  return (
    <div className="max-w-2xl space-y-6">
      <PageHeader title="Meu perfil" />
      <Card className="space-y-3 p-5">
        <SectionTitle title="Avisos no celular" subtitle="Receba lembretes de escala, pedidos de troca e avisos mesmo com o site fechado." />
        {push === 'unsupported' ? <p className="text-sm text-muted">Este navegador não suporta avisos. No iPhone, abra o site no Safari, toque em Compartilhar → Adicionar à Tela de Início e abra o app instalado.</p>
          : push === 'denied' ? <p className="text-sm text-warn">As notificações estão bloqueadas neste navegador. Libere nas configurações do site e volte aqui.</p>
          : <div className="flex flex-wrap items-center gap-3"><Button variant={push === 'on' ? 'outline' : 'primary'} loading={busy === 'n'} onClick={() => void togglePush()}>{push === 'on' ? 'Desativar neste aparelho' : 'Ativar avisos neste aparelho'}</Button>{push === 'on' && <Badge tone="ok">Ativo</Badge>}</div>}
      </Card>
      <Card className="space-y-4 p-5">
        <div className="flex items-center gap-4"><Avatar name={profile?.full_name ?? '?'} size={56} />
          <div><p className="font-bold">{profile?.full_name}</p><p className="text-sm text-muted">{profile?.email}</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{roles.map((r) => <Badge key={r} tone="accent">{ROLE_LABEL[r]}</Badge>)}{member && <Badge>Integrante vinculado</Badge>}</div></div></div>
        <Field label="Nome completo"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Telefone / WhatsApp"><Input value={phone} onChange={(e) => setPhone(e.target.value)} inputMode="tel" /></Field>
        <Button variant="primary" loading={busy === 'p'} onClick={saveProfile}>Salvar dados</Button>
      </Card>
      <Card className="space-y-4 p-5">
        <SectionTitle title="Alterar senha" />
        <Field label="Nova senha"><Input type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} /></Field>
        <Field label="Repita a nova senha"><Input type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} /></Field>
        <Button variant="primary" loading={busy === 'w'} onClick={savePw}>Alterar senha</Button>
      </Card>
      <Card className="flex flex-wrap items-center justify-between gap-3 p-5">
        <div><p className="font-semibold">Tema</p><p className="text-sm text-muted">Atualmente: {theme === 'dark' ? 'escuro' : 'claro'}</p></div>
        <div className="flex gap-2"><Button variant="outline" onClick={toggle}>Alternar tema</Button><Button variant="outline" onClick={() => void signOut()}>Sair</Button></div>
      </Card>
    </div>
  )
}
