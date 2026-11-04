import { App } from '../../components/App'

// Email links land here: the same single screen, opened on that repair.
export default async function TrackPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  return <App focusId={id} />
}
