import { useCallback, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import FullCalendar from '@fullcalendar/react'
import dayGridPlugin from '@fullcalendar/daygrid'
import timeGridPlugin from '@fullcalendar/timegrid'
import listPlugin from '@fullcalendar/list'
import interactionPlugin from '@fullcalendar/interaction'
import ptBr from '@fullcalendar/core/locales/pt-br'
import type { DatesSetArg, EventClickArg, EventInput } from '@fullcalendar/core'
import { Plus } from 'lucide-react'
import { supabase, unwrap } from '../lib/supabase'
import { useAuth } from '../context/Auth'
import { EVENT_TYPES, STATUS_LABEL, fmtDate, fmtTime } from '../lib/utils'
import type { EventRow } from '../types'
import { Badge, Button, Modal } from './ui'
import { statusTone } from '../pages/Events'

type Row = Pick<EventRow, 'id' | 'title' | 'event_type' | 'event_date' | 'start_time' | 'end_time' | 'status'>

export function CalendarView({ compact = false }: { compact?: boolean }) {
  const nav = useNavigate()
  const { isLeader } = useAuth()
  const rows = useRef<Row[]>([])
  const [day, setDay] = useState<string | null>(null)
  const [, force] = useState(0)

  const load = useCallback(async (info: { startStr: string; endStr: string }, ok: (e: EventInput[]) => void, fail: (e: Error) => void) => {
    try {
      const data = unwrap(await supabase.from('events').select('id, title, event_type, event_date, start_time, end_time, status')
        .gte('event_date', info.startStr.slice(0, 10)).lte('event_date', info.endStr.slice(0, 10)).order('start_time')) as Row[]
      rows.current = data; force((n) => n + 1)
      ok(data.map((e) => ({
        id: e.id, title: e.title, start: `${e.event_date}T${e.start_time}`, end: e.end_time ? `${e.event_date}T${e.end_time}` : undefined,
        backgroundColor: e.status === 'draft' ? 'transparent' : EVENT_TYPES[e.event_type]?.color,
        borderColor: EVENT_TYPES[e.event_type]?.color,
        textColor: e.status === 'draft' ? EVENT_TYPES[e.event_type]?.color : '#111111',
        classNames: [e.status === 'cancelled' ? 'opacity-50 line-through' : '', e.status === 'completed' ? 'opacity-70' : '', e.status === 'draft' ? 'border border-dashed' : ''],
      })))
    } catch (err) { fail(err as Error) }
  }, [])
  const dayRows = day ? rows.current.filter((r) => r.event_date === day) : []
  return (
    <div>
      <FullCalendar
        plugins={[dayGridPlugin, timeGridPlugin, listPlugin, interactionPlugin]}
        locale={ptBr} firstDay={0} height="auto" fixedWeekCount={false} dayMaxEvents={compact ? 2 : 3}
        initialView="dayGridMonth"
        headerToolbar={compact ? { left: 'prev,next', center: 'title', right: '' } : { left: 'prev,next today', center: 'title', right: 'dayGridMonth,timeGridWeek,listMonth' }}
        buttonText={{ today: 'Hoje', month: 'Mês', week: 'Semana', list: 'Lista' }}
        eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
        allDaySlot={false} slotMinTime="06:00:00" slotMaxTime="24:00:00" nowIndicator
        events={load}
        eventClick={(a: EventClickArg) => nav(`/escalas/${a.event.id}`)}
        dateClick={(a) => setDay(a.dateStr.slice(0, 10))}
        datesSet={(_: DatesSetArg) => undefined}
        noEventsText="Nenhum evento neste período"
      />
      {!compact && (
        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted">
          {Object.entries(EVENT_TYPES).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: v.color }} />{v.label}</span>)}
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded border border-dashed border-muted" />Escala pendente (rascunho)</span>
          <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-4 rounded bg-muted" />Escala publicada</span>
        </div>)}
      <Modal open={!!day} onClose={() => setDay(null)} size="sm" title={day ? fmtDate(day) : ''}
        footer={isLeader && day ? <Button variant="primary" onClick={() => nav(`/escalas/nova?data=${day}`)}><Plus className="h-4 w-4" />Criar escala nesta data</Button> : undefined}>
        {dayRows.length === 0 ? <p className="text-sm text-muted">Nenhum evento nesta data.</p> : (
          <ul className="space-y-2">{dayRows.map((r) => (
            <li key={r.id}><button onClick={() => nav(`/escalas/${r.id}`)} className="flex w-full items-center gap-3 rounded-xl border border-border p-3 text-left hover:bg-surface2">
              <span className="h-8 w-1.5 rounded-full" style={{ background: EVENT_TYPES[r.event_type]?.color }} />
              <span className="min-w-0 flex-1"><span className="block truncate font-semibold">{r.title}</span><span className="text-xs text-muted">{fmtTime(r.start_time)} · {EVENT_TYPES[r.event_type]?.label}</span></span>
              <Badge tone={statusTone(r.status)}>{STATUS_LABEL[r.status]}</Badge></button></li>))}</ul>)}
      </Modal>
    </div>
  )
}
