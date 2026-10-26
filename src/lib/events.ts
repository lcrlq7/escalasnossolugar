import { useQuery } from '@tanstack/react-query'
import { supabase, unwrap } from './supabase'
import type { Alert, Assignment, EventRow, Setlist } from '../types'

export type AssignmentFull = Assignment & {
  member: { id: string; full_name: string; profile_id: string | null } | null
  function: { id: string; name: string; sort_order: number; is_main: boolean } | null
}
export type EventFull = EventRow & {
  leader: { full_name: string } | null
  creator: { full_name: string } | null
  updater: { full_name: string } | null
}

export const useEventFull = (id?: string) => useQuery({
  queryKey: ['event', id], enabled: !!id,
  queryFn: async () => unwrap(await supabase.from('events')
    .select('*, leader:members!leader_member_id(full_name), creator:profiles!created_by(full_name), updater:profiles!updated_by(full_name)')
    .eq('id', id!).maybeSingle()) as unknown as EventFull | null,
})
export const useAssignments = (eventId?: string) => useQuery({
  queryKey: ['assignments', eventId], enabled: !!eventId,
  queryFn: async () => unwrap(await supabase.from('event_assignments')
    .select('*, member:members(id, full_name, profile_id), function:worship_functions(id, name, sort_order, is_main)')
    .eq('event_id', eventId!)) as unknown as AssignmentFull[],
})
export const useEventSetlist = (eventId?: string) => useQuery({
  queryKey: ['event-setlist', eventId], enabled: !!eventId,
  queryFn: async () => unwrap(await supabase.from('setlists').select('*').eq('event_id', eventId!).maybeSingle()) as Setlist | null,
})
export const useEventAlerts = (eventId?: string, enabled = true) => useQuery({
  queryKey: ['alerts', eventId], enabled: !!eventId && enabled,
  queryFn: async () => ((unwrap(await supabase.rpc('event_alerts', { p_event_id: eventId! })) ?? []) as Alert[]).filter((a) => a.type !== 'pending'),
})

export function nextWeekday(weekday: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate())
  const diff = (weekday - d.getDay() + 7) % 7
  d.setDate(d.getDate() + diff)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

