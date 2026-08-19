import { useState } from 'react'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:8787'

const TABS = [
  { id: 'closed', label: 'Successfully Closed Deals' },
  { id: 'failed', label: 'Failed Deals' },
  { id: 'staff', label: 'Staff Performance' }
]

function todayISO() {
  return new Date().toISOString().slice(0, 10)
}

function daysAgoISO(days) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
}

export default function WhatsAppReport() {
  const [start, setStart] = useState(daysAgoISO(30))
  const [end, setEnd] = useState(todayISO())
  const [report, setReport] = useState(null)
  const [staffReport, setStaffReport] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [activeTab, setActiveTab] = useState('closed')

  const generateReport = async (e) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const [conversionRes, staffRes] = await Promise.all([
        fetch(`${API_URL}/api/reports/whatsapp-conversion?start=${start}&end=${end}`, { credentials: 'include' }),
        fetch(`${API_URL}/api/reports/staff-performance?start=${start}&end=${end}`, { credentials: 'include' })
      ])
      if (!conversionRes.ok) throw new Error((await conversionRes.json()).error || 'Failed to generate report')
      if (!staffRes.ok) throw new Error((await staffRes.json()).error || 'Failed to generate staff report')
      setReport(await conversionRes.json())
      setStaffReport(await staffRes.json())
    } catch (err) {
      setError(err.message)
      setReport(null)
      setStaffReport(null)
    } finally {
      setLoading(false)
    }
  }

  const hasReport = report && staffReport

  return (
    <section className="admin-panel">
      <h2>Reports</h2>
      <p>Track WhatsApp inquiries, conversions, and staff follow-up activity over a date range.</p>

      {error && <p className="team-error">{error}</p>}

      <form className="team-form" onSubmit={generateReport}>
        <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} required />
        <button type="submit" disabled={loading}>{loading ? 'Generating…' : 'Generate Report'}</button>
      </form>

      {hasReport && (
        <>
          <div className="report-summary">
            <div className="report-stat">
              <span className="report-stat-value">{report.totalLeads}</span>
              <span className="report-stat-label">Total Inquiries</span>
            </div>
            <div className="report-stat">
              <span className="report-stat-value">{report.converted}</span>
              <span className="report-stat-label">Converted to Bookings</span>
            </div>
            <div className="report-stat">
              <span className="report-stat-value">{report.conversionRate}%</span>
              <span className="report-stat-label">Conversion Rate</span>
            </div>
            <div className="report-stat">
              <span className="report-stat-value">{report.open}</span>
              <span className="report-stat-label">Still Open</span>
            </div>
            <div className="report-stat">
              <span className="report-stat-value">{report.lost}</span>
              <span className="report-stat-label">Not Closed</span>
            </div>
          </div>

          <div className="report-tabs">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`report-tab${activeTab === t.id ? ' active' : ''}`}
                onClick={() => setActiveTab(t.id)}
              >
                {t.label}
              </button>
            ))}
          </div>

          {activeTab === 'closed' && (
            <>
              <h3>Successfully Closed Deals</h3>
              <p>Every booking closed in this date range, regardless of how the customer first reached out (WhatsApp, phone, or walk-in).</p>
              <table className="team-table">
                <thead>
                  <tr>
                    <th>Closed By</th>
                    <th>Client</th>
                    <th>Client Phone</th>
                    <th>Booking Date</th>
                    <th>Closed On</th>
                  </tr>
                </thead>
                <tbody>
                  {staffReport.deals.map((d, i) => (
                    <tr key={i}>
                      <td>{d.staffName}</td>
                      <td>{d.customerName || '—'}</td>
                      <td>{d.customerMobile || '—'}</td>
                      <td>{d.bookingDate || '—'}</td>
                      <td>{new Date(d.createdDate).toLocaleDateString()}</td>
                    </tr>
                  ))}
                  {staffReport.deals.length === 0 && (
                    <tr><td colSpan="5">No deals closed in this date range.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          {activeTab === 'failed' && (
            <>
              <h3>Failed Deals</h3>
              <p>WhatsApp leads marked "Not Closed" by staff, with the reason logged.</p>

              {Object.keys(report.lostReasonBreakdown).length > 0 && (
                <>
                  <h4>Reasons Breakdown</h4>
                  <table className="team-table">
                    <thead>
                      <tr><th>Reason</th><th>Count</th></tr>
                    </thead>
                    <tbody>
                      {Object.entries(report.lostReasonBreakdown)
                        .sort((a, b) => b[1] - a[1])
                        .map(([reason, count]) => (
                          <tr key={reason}>
                            <td>{reason}</td>
                            <td>{count}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </>
              )}

              <table className="team-table">
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Phone</th>
                    <th>First Message</th>
                    <th>Ad Source</th>
                    <th>Reason</th>
                  </tr>
                </thead>
                <tbody>
                  {report.leads.filter((l) => l.status === 'lost').map((l) => (
                    <tr key={l.phone}>
                      <td>{l.name || '—'}</td>
                      <td>{l.phone}</td>
                      <td>{new Date(l.firstMessage).toLocaleDateString()}</td>
                      <td>{l.adSource || '—'}</td>
                      <td>{l.lostReason || '—'}</td>
                    </tr>
                  ))}
                  {report.leads.filter((l) => l.status === 'lost').length === 0 && (
                    <tr><td colSpan="5">No failed deals in this date range.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}

          {activeTab === 'staff' && (
            <>
              <h3>Staff Performance</h3>
              <p>Leads Assigned/Conversations come from staff self-assigning WhatsApp leads. Deals Closed comes directly from who created each booking, regardless of how the customer first reached out.</p>

              <table className="team-table">
                <thead>
                  <tr>
                    <th>Staff</th>
                    <th>Leads Assigned</th>
                    <th>Conversations</th>
                    <th>Leads Converted</th>
                    <th>Not Closed</th>
                    <th>Deals Closed</th>
                  </tr>
                </thead>
                <tbody>
                  {staffReport.staff.map((s) => (
                    <tr key={s.email}>
                      <td>{s.name}</td>
                      <td>{s.leadsAssigned}</td>
                      <td>{s.conversations}</td>
                      <td>{s.converted} {s.leadsAssigned > 0 && `(${s.conversionRate}%)`}</td>
                      <td>{s.lost}</td>
                      <td>{s.dealsClosed}</td>
                    </tr>
                  ))}
                  {staffReport.staff.length === 0 && (
                    <tr><td colSpan="6">No staff activity in this date range.</td></tr>
                  )}
                </tbody>
              </table>
            </>
          )}
        </>
      )}
    </section>
  )
}
