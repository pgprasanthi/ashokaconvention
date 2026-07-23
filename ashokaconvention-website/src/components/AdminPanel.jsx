import { useAuth } from '../context/AuthContext'

export default function AdminPanel() {
  const { user } = useAuth()

  return (
    <section className="admin-panel">
      <h2>Admin Dashboard</h2>
      <p>Signed in as {user?.email}.</p>
      <p>Add admin-only tools here (manage gallery photos, review feedback, etc).</p>
    </section>
  )
}
