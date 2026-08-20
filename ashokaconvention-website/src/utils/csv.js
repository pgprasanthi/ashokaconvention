// Wraps a value in quotes only when it actually needs escaping (contains a
// comma, quote, or newline) - keeps plain cells readable in the raw file.
function csvEscape(value) {
  const str = String(value ?? '')
  if (/[",\n]/.test(str)) return `"${str.replace(/"/g, '""')}"`
  return str
}

// Builds a CSV from a header row + data rows and triggers a browser download.
// Runs entirely client-side against data the page already has loaded - no
// server endpoint needed for any of the exports that use this.
export function downloadCSV(filename, headers, rows) {
  const csv = [headers, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  URL.revokeObjectURL(url)
}
