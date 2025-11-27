import { Card } from "@/components/ui/card"

type KpiProps = { title: string; value: string; caption?: string }

export const KpiCards = ({ items }: { items: KpiProps[] }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 10 }}>
      {items.map((it, i) => (
        <Card key={i} style={{ padding: 12 }}>
          <div style={{ fontSize: 11, color: '#666' }}>{it.title}</div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>{it.value}</div>
          {it.caption && <div style={{ fontSize: 10, color: '#94a3b8', marginTop: 2 }}>{it.caption}</div>}
        </Card>
      ))}
    </div>
  )
}
