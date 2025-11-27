export const CorrectionsTable = ({ rows }: { rows: { index: number; before: string; after: string }[] }) => {
  return (
    <div style={{ maxHeight: 500, overflowY: 'auto', border: '1px solid #e2e8f0', borderRadius: 8 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse' }}>
        <thead style={{ position: 'sticky', top: 0, background: '#f8fafc', borderBottom: '2px solid #e2e8f0', zIndex: 1 }}>
          <tr>
            <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#475569' }}>Index</th>
            <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#475569' }}>Before</th>
            <th style={{ textAlign: 'left', padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#475569' }}>After</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{ borderBottom: i < rows.length - 1 ? '1px solid #f1f5f9' : 'none' }}>
              <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600, color: '#64748b', fontVariantNumeric: 'tabular-nums' }}>{r.index}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: '#dc2626', fontFamily: 'monospace', background: '#fef2f2' }}>{r.before}</td>
              <td style={{ padding: '12px 16px', fontSize: 13, color: '#16a34a', fontFamily: 'monospace', background: '#f0fdf4' }}>{r.after}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
