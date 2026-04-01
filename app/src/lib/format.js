/* Shared formatting utilities and badge components */

export function fmtMoney(n) {
  return n != null ? `$${parseFloat(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'
}

export function fmtDate(d) {
  if (!d) return '—'
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
}

export function daysUntil(d) {
  if (!d) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const exp = new Date(d + 'T00:00:00')
  return Math.ceil((exp - now) / (1000 * 60 * 60 * 24))
}

export function badgeStyle(c) {
  return { display: 'inline-block', fontFamily: 'var(--fh)', fontSize: 10, fontWeight: 700, letterSpacing: '1.5px', textTransform: 'uppercase', color: c, background: `${c}22`, padding: '3px 10px', borderRadius: 3 }
}

export const COLORS = {
  green: '#357A38',
  red: '#D4483A',
  amber: '#C9922E',
  steel: '#929BAA',
  blue: '#3D5A80',
  slate: '#7A8490',
}
