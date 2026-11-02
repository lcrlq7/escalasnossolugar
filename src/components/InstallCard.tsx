import { useState } from 'react'
import { Download, Share, SquarePlus, X } from 'lucide-react'
import { useInstall } from '../lib/install'
import { Button, Card } from './ui'

const KEY = 'install-dismissed'
const read = () => { try { return localStorage.getItem(KEY) === '1' } catch { return false } }

/** Ajuda a colocar o app na tela de início do celular. Some se já estiver instalado. */
export function InstallCard({ dismissible }: { dismissible?: boolean }) {
  const { standalone, isIos, isAndroid, inApp, iosSafari, canPrompt, install } = useInstall()
  const [hidden, setHidden] = useState(dismissible ? read() : false)
  if (standalone || hidden || (!isIos && !isAndroid)) return null
  const close = () => { setHidden(true); try { localStorage.setItem(KEY, '1') } catch { /* ignora */ } }
  return (
    <Card className="relative p-4">
      {dismissible && <button aria-label="Fechar" onClick={close} className="absolute right-2 top-2 rounded-lg p-2 text-muted hover:text-fg"><X className="h-4 w-4" /></button>}
      <div className="flex items-start gap-3 pr-6">
        <span className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-accent/15 text-accenttext"><Download className="h-5 w-5" /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Coloque o app na tela de início</p>
          {inApp ? (
            <p className="mt-1 text-sm text-muted">Você abriu o link dentro de outro app (WhatsApp, Instagram…). Toque nos três pontinhos ou no ícone de compartilhar e escolha <b>Abrir no navegador</b> ({isIos ? 'Safari' : 'Chrome'}). Depois siga os passos aqui de novo.</p>
          ) : isIos ? (
            iosSafari ? (
              <ol className="mt-1 space-y-1 text-sm text-muted">
                <li>1. Toque em <Share className="inline h-4 w-4 align-text-bottom" /> <b>Compartilhar</b> (barra do Safari).</li>
                <li>2. Role e toque em <SquarePlus className="inline h-4 w-4 align-text-bottom" /> <b>Adicionar à Tela de Início</b>.</li>
                <li>3. Toque em <b>Adicionar</b>. Pronto: o ícone aparece como um app.</li>
              </ol>
            ) : <p className="mt-1 text-sm text-muted">No iPhone, abra este site no <b>Safari</b> para adicionar à tela de início (Compartilhar → Adicionar à Tela de Início).</p>
          ) : canPrompt ? (
            <>
              <p className="mt-1 text-sm text-muted">Instale para abrir direto da tela de início, como um aplicativo.</p>
              <Button className="mt-2" variant="primary" onClick={() => void install()}><Download className="h-4 w-4" />Instalar app</Button>
            </>
          ) : (
            <ol className="mt-1 space-y-1 text-sm text-muted">
              <li>1. Toque nos <b>três pontinhos</b> do Chrome (canto de cima).</li>
              <li>2. Toque em <b>Instalar app</b> ou <b>Adicionar à tela inicial</b>.</li>
              <li>3. Confirme. O ícone aparece na tela do celular.</li>
            </ol>
          )}
        </div>
      </div>
    </Card>
  )
}
