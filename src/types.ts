export type Role = 'admin' | 'leader' | 'minister' | 'sound_tech'
export type EventStatus = 'draft' | 'published' | 'completed' | 'cancelled'
export type ResponseStatus = 'pending' | 'confirmed' | 'declined'
export type EventType = 'sunday_service' | 'thursday_service' | 'rehearsal' | 'vigil' | 'conference' | 'custom'

export interface Church { id: string; name: string; system_name: string }
export interface Profile {
  id: string; church_id: string | null; full_name: string; email: string | null
  phone: string | null; avatar_url: string | null; active: boolean; created_at: string
}
export interface WFunction {
  id: string; church_id: string; name: string; is_required: boolean; is_main: boolean
  is_instrument: boolean; sort_order: number; active: boolean; slots: number
}
export interface Member {
  id: string; church_id: string; profile_id: string | null; full_name: string; phone: string | null
  email: string | null; notes: string | null; active: boolean
  member_functions?: { function_id: string }[]
}
export interface ServiceSchedule {
  id: string; church_id: string; name: string; event_type: EventType; weekday: number
  start_time: string; end_time: string | null; location: string | null; active: boolean
}
export interface EventRow {
  id: string; church_id: string; title: string; event_type: EventType; event_date: string
  start_time: string; end_time: string | null; location: string | null
  leader_member_id: string | null; notes: string | null; tech_notes: string | null
  sound_ready: boolean; status: EventStatus; cancel_reason: string | null
  published_at: string | null; created_by: string | null; updated_by: string | null
  created_at: string; updated_at: string
}
export interface Assignment {
  id: string; event_id: string; member_id: string; function_id: string
  status: ResponseStatus; responded_at: string | null; decline_reason: string | null
}
export interface Song {
  id: string; church_id: string; title: string; artist: string | null; cover_url: string | null
  original_key: string | null; church_key: string | null; bpm: number | null
  duration_seconds: number | null; lyrics: string | null; youtube_url: string | null
  spotify_url: string | null; album: string | null; tags: string[]; notes: string | null
  is_habitual: boolean; archived: boolean; source: string; created_at: string; chord_chart?: string | null
}
export interface Category { id: string; church_id: string; name: string; sort_order: number }
export interface Setlist {
  id: string; church_id: string; name: string; event_id: string | null; is_template: boolean
  is_favorite: boolean; theme: string | null; notes: string | null; share_token: string; playlist_url: string | null
  created_at: string; updated_at: string
}
export type ItemKind = 'song' | 'note' | 'prayer' | 'transition'
export interface SetlistItem {
  id: string; setlist_id: string; position: number; kind: ItemKind; song_id: string | null
  category_id: string | null; key_override: string | null; note: string | null
  duration_override_seconds: number | null; rehearsed?: boolean; song?: Song | null
}
export interface Alert { type: string; severity: 'error' | 'warning' | 'info'; message: string; member_id?: string }
export interface AppNotification {
  id: string; user_id: string; type: string; title: string; body: string | null
  link: string | null; read_at: string | null; created_at: string
}
export interface ExternalResult {
  source: 'itunes' | 'youtube' | 'spotify' | 'link'
  title: string; artist: string | null; album: string | null; cover_url: string | null
  duration_seconds: number | null; youtube_url: string | null; spotify_url: string | null
  external_ref: string
}
