import { useState, useEffect } from 'react'
import { useAuth } from '../context/AuthContext'
import GuestsList from './GuestsList'

// Relative path in production - see AuthContext.jsx for why (same-origin
// cookie via Render's rewrite proxy, avoids third-party cookie blocking).
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.DEV ? 'http://localhost:8787' : '')
const EMPTY_FORM = { email: '', role: 'staff', name: '', joinedOn: '', mobile: '' }

export default function AdminPanel() {
  const { user } = useAuth()
  const [members, setMembers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState(EMPTY_FORM)
  const [editingEmail, setEditingEmail] = useState(null)
  const [editForm, setEditForm] = useState(EMPTY_FORM)

  const loadMembers = async () => {
    setLoading(true)
    try {
      const res = await fetch(`${API_URL}/api/team`, { credentials: 'include' })
      if (!res.ok) throw new Error('Failed to load team')
      setMembers(await res.json())
      setError('')
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { loadMembers() }, [])

  const handleAdd = async (e) => {
    e.preventDefault()
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/team`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(form)
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to add')
      setMembers(await res.json())
      setForm(EMPTY_FORM)
    } catch (err) {
      setError(err.message)
    }
  }

  const startEdit = (member) => {
    setEditingEmail(member.email)
    setEditForm(member)
  }

  const cancelEdit = () => {
    setEditingEmail(null)
    setEditForm(EMPTY_FORM)
  }

  const saveEdit = async (email) => {
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/team/${encodeURIComponent(email)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(editForm)
      })
      if (!res.ok) throw new Error((await res.json()).error || 'Failed to update')
      setMembers(await res.json())
      cancelEdit()
    } catch (err) {
      setError(err.message)
    }
  }

  const removeMember = async (email) => {
    if (!window.confirm(`Remove ${email} from the team?`)) return
    setError('')
    try {
      const res = await fetch(`${API_URL}/api/team/${encodeURIComponent(email)}`, {
        method: 'DELETE',
        credentials: 'include'
      })
      if (!res.ok && res.status !== 204) throw new Error('Failed to remove')
      setMembers((prev) => prev.filter((m) => m.email !== email))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <section className="admin-panel">
      <h2>Staff Management</h2>
      <p>Signed in as {user?.email}.</p>

      {error && <p className="team-error">{error}</p>}

      <form className="team-form" onSubmit={handleAdd}>
        <input
          type="email"
          placeholder="Email"
          required
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
        <input
          placeholder="Name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
        />
        <input
          type="date"
          value={form.joinedOn}
          onChange={(e) => setForm({ ...form, joinedOn: e.target.value })}
        />
        <input
          placeholder="Mobile number"
          value={form.mobile}
          onChange={(e) => setForm({ ...form, mobile: e.target.value })}
        />
        <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })}>
          <option value="staff">Staff</option>
          <option value="admin">Admin</option>
        </select>
        <button type="submit">Add</button>
      </form>

      {loading ? (
        <p>Loading team…</p>
      ) : (
        <table className="team-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Email</th>
              <th>Mobile</th>
              <th>Joined</th>
              <th>Role</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.email}>
                {editingEmail === m.email ? (
                  <>
                    <td>
                      <input
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                      />
                    </td>
                    <td>{m.email}</td>
                    <td>
                      <input
                        value={editForm.mobile}
                        onChange={(e) => setEditForm({ ...editForm, mobile: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        type="date"
                        value={editForm.joinedOn}
                        onChange={(e) => setEditForm({ ...editForm, joinedOn: e.target.value })}
                      />
                    </td>
                    <td>
                      <select
                        value={editForm.role}
                        onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                      >
                        <option value="staff">Staff</option>
                        <option value="admin">Admin</option>
                      </select>
                    </td>
                    <td className="team-actions">
                      <button onClick={() => saveEdit(m.email)}>Save</button>
                      <button className="booking-neutral-btn" onClick={cancelEdit}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td>{m.name}</td>
                    <td>{m.email}</td>
                    <td>{m.mobile}</td>
                    <td>{m.joinedOn}</td>
                    <td>{m.role}</td>
                    <td className="team-actions">
                      <button className="booking-neutral-btn" onClick={() => startEdit(m)}>Edit</button>
                      <button className="booking-cancel-btn" onClick={() => removeMember(m.email)}>Remove</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
            {members.length === 0 && (
              <tr><td colSpan="6">No staff members yet.</td></tr>
            )}
          </tbody>
        </table>
      )}

      <hr className="admin-divider" />
      <GuestsList />
    </section>
  )
}
