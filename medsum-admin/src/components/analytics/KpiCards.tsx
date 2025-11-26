import { Card } from "@/components/ui/card"

type KpiProps = { title: string; value: string }

export const KpiCards = ({ items }: { items: KpiProps[] }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 12 }}>
      {items.map((it, i) => (
        <Card key={i} style={{ padding: 16 }}>
          <div style={{ fontSize: 12, color: '#666' }}>{it.title}</div>
          <div style={{ fontSize: 24, fontWeight: 600 }}>{it.value}</div>
        </Card>
      ))}
    </div>
  )
}
