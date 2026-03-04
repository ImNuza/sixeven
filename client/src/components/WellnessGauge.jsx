import { PieChart, Pie, Cell } from 'recharts'

export default function WellnessGauge({ score }) {
  const data = [
    { value: score },
    { value: 100 - score },
  ]

  const getColor = (s) => {
    if (s >= 80) return '#10B981'
    if (s >= 60) return '#3B82F6'
    if (s >= 40) return '#F59E0B'
    return '#EF4444'
  }

  const getLabel = (s) => {
    if (s >= 80) return 'Excellent'
    if (s >= 60) return 'Good'
    if (s >= 40) return 'Fair'
    return 'Needs Work'
  }

  const color = getColor(score)

  return (
    <div className="flex flex-col items-center">
      <div className="relative">
        <PieChart width={180} height={110}>
          <Pie
            data={data}
            cx={90}
            cy={100}
            startAngle={180}
            endAngle={0}
            innerRadius={65}
            outerRadius={85}
            dataKey="value"
            stroke="none"
          >
            <Cell fill={color} />
            <Cell fill="rgba(255,255,255,0.06)" />
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-end pb-2">
          <span className="text-3xl font-bold" style={{ color }}>{score}</span>
          <span className="text-[11px] text-white/40 font-medium">/100</span>
        </div>
      </div>
      <span
        className="text-xs font-semibold mt-1 px-3 py-1 rounded-full"
        style={{ color, backgroundColor: `${color}15` }}
      >
        {getLabel(score)}
      </span>
    </div>
  )
}
