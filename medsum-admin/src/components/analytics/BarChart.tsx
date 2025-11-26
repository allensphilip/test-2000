export const BarChart = ({ labels, values }: { labels: string[]; values: number[] }) => {
  const max = Math.max(1, ...values)
  return (
    <div style={{ display: 'grid', gap: 8 }}>
      {labels.map((l, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <div style={{ width: 160, fontSize: 12, color: '#444' }}>{l}</div>
          <div style={{ background: '#10b981', height: 12, width: `${(values[i] / max) * 400}px` }} />
          <div style={{ width: 60, textAlign: 'right' }}>{values[i].toFixed(3)}</div>
        </div>
      ))}
    </div>
  )
}
