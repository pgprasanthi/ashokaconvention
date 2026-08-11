import { useAuth } from '../context/AuthContext'

export default function StaffPage() {
  const { user } = useAuth()

  return (
    <section className="admin-panel">
      <h2>Staff Dashboard</h2>
      <p>Welcome, {user?.name || user?.email}.</p>
      <p>Staff tools will go here.</p>
    </section>
  )
}
