import { useQuery } from '@tanstack/react-query'
import { supabase, unwrap } from './supabase'
import type { Category, Member, ServiceSchedule, Song, WFunction } from '../types'

export const useFunctions = () => useQuery({
  queryKey: ['functions'],
  queryFn: async () => unwrap(await supabase.from('worship_functions').select('*').order('sort_order').order('name')) as WFunction[],
})
export const useMembers = () => useQuery({
  queryKey: ['members'],
  queryFn: async () => unwrap(await supabase.from('members').select('*, member_functions(function_id)').order('full_name')) as Member[],
})
export const useCategories = () => useQuery({
  queryKey: ['categories'],
  queryFn: async () => unwrap(await supabase.from('setlist_categories').select('*').order('sort_order').order('name')) as Category[],
})
export const useSongs = () => useQuery({
  queryKey: ['songs'],
  queryFn: async () => unwrap(await supabase.from('songs').select('*').order('title')) as Song[],
})
export const useSchedules = () => useQuery({
  queryKey: ['schedules'],
  queryFn: async () => unwrap(await supabase.from('service_schedules').select('*').order('weekday').order('start_time')) as ServiceSchedule[],
})
export const useFavorites = (uid?: string) => useQuery({
  queryKey: ['favorites', uid],
  enabled: !!uid,
  queryFn: async () => new Set(((unwrap(await supabase.from('song_favorites').select('song_id')) ?? []) as { song_id: string }[]).map((r) => r.song_id)),
})
