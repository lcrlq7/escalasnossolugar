import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? import.meta.env.VITE_SUPABASE_ANON_KEY) as string | undefined

export const isConfigured = Boolean(url && key)

export const supabase = createClient(url ?? 'http://localhost:54321', key ?? 'missing-key', {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true },
})

/** Lança erro amigável quando a resposta do Supabase contém erro. */
export function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new Error(friendlyMessage(res.error.message, res.error.code))
  return res.data as T
}

export function friendlyMessage(message: string, code?: string): string {
  if (code === '23505' || /duplicate key/i.test(message)) return 'Já existe um cadastro igual a este.'
  if (code === '42501' || /row-level security|permission denied/i.test(message)) return 'Você não tem permissão para realizar esta ação.'
  if (code === '23503' || /foreign key/i.test(message)) return 'Este item está em uso em outro lugar e não pode ser removido.'
  if (/Invalid login credentials/i.test(message)) return 'E-mail ou senha incorretos.'
  if (/Email not confirmed/i.test(message)) return 'Confirme seu e-mail antes de entrar (verifique sua caixa de entrada).'
  if (/User already registered/i.test(message)) return 'Este e-mail já possui cadastro.'
  if (/Password should be at least/i.test(message)) return 'A senha deve ter ao menos 6 caracteres.'
  if (/rate limit/i.test(message)) return 'Muitas tentativas. Aguarde alguns minutos e tente novamente.'
  if (/Failed to fetch|NetworkError/i.test(message)) return 'Sem conexão com o servidor. Verifique sua internet.'
  return message
}
