export const CorrectionsTable = ({ rows }: { rows: { index: number; before: string; after: string }[] }) => {
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>
          <th style={{ textAlign: 'left', padding: 8 }}>Index</th>
          <th style={{ textAlign: 'left', padding: 8 }}>Before</th>
          <th style={{ textAlign: 'left', padding: 8 }}>After</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <td style={{ padding: 8 }}>{r.index}</td>
            <td style={{ padding: 8 }}>{r.before}</td>
            <td style={{ padding: 8 }}>{r.after}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
