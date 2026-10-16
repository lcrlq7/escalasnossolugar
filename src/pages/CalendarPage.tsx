import { Link } from 'react-router-dom'
import { CalendarPlus } from 'lucide-react'
import { useAuth } from '../context/Auth'
import { CalendarView } from '../components/CalendarView'
import { Button, Card, PageHeader } from '../components/ui'

export default function CalendarPage() {
  const { isLeader } = useAuth()
  return (
    <div>
      <PageHeader title="Calendário" subtitle="Veja cultos, ensaios e eventos. Toque em uma data para ver ou criar."
        actions={isLeader && <Link to="/escalas/nova"><Button variant="primary"><CalendarPlus className="h-4 w-4" />Nova escala</Button></Link>} />
      <Card className="p-3 md:p-5"><CalendarView /></Card>
    </div>
  )
}
