import { useMemo } from 'react'
import {
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip,
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
} from 'recharts'
import { TrendingUp, TrendingDown, AlertTriangle, CheckCircle, Info } from 'lucide-react'
import { ASSETS, NET_WORTH_HISTORY, MOCK_INSIGHTS } from '../../../shared/mockData.js'
import { ASSET_CATEGORIES, CATEGORY_COLORS } from '../../../shared/constants.js'
import { calculateWellnessScore } from '../data/wellnessCalculator.js'
import WellnessGauge from '../components/WellnessGauge'

function formatCurrency(value) {
  return new Intl.NumberFormat('en-SG', {
    style: 'currency',
    currency: 'SGD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value)
}

const CustomTooltip = ({ active, payload }) => {
  if (!active || !payload?.length) return null
  return (
    <div className="glass-card px-4 py-3 text-sm">
      <p className="text-white/60 text-xs">{payload[0]?.payload?.name || payload[0]?.payload?.month}</p>
      <p className="text-white font-semibold">{formatCurrency(payload[0].value)}</p>
    </div>
  )
}

const insightIcons = {
  warning: <AlertTriangle className="w-4 h-4 text-warning" />,
  positive: <CheckCircle className="w-4 h-4 text-positive" />,
  info: <Info className="w-4 h-4 text-accent" />,
}

const insightBorders = {
  warning: 'border-warning/20',
  positive: 'border-positive/20',
  info: 'border-accent/20',
}

export default function Dashboard() {
  const totalNetWorth = useMemo(() => ASSETS.reduce((sum, a) => sum + a.value, 0), [])
  const totalCost = useMemo(() => ASSETS.reduce((sum, a) => sum + a.cost, 0), [])
  const totalGainLoss = totalNetWorth - totalCost
  const gainLossPercent = ((totalGainLoss / totalCost) * 100).toFixed(1)

  const { score, breakdown } = useMemo(() => calculateWellnessScore(ASSETS), [])

  const pieData = useMemo(() => {
    const grouped = {}
    ASSETS.forEach((a) => {
      grouped[a.category] = (grouped[a.category] || 0) + a.value
    })
    return Object.entries(grouped).map(([key, value]) => ({
      name: ASSET_CATEGORIES[key],
      value,
      key,
    }))
  }, [])

  const previousValue = NET_WORTH_HISTORY[NET_WORTH_HISTORY.length - 2]?.value || totalNetWorth
  const monthlyChange = totalNetWorth - previousValue
  const monthlyChangePercent = ((monthlyChange / previousValue) * 100).toFixed(1)

  return (
    <div className="max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-white">Wealth Dashboard</h1>
        <p className="text-sm text-white/40 mt-1">Overview of your total financial health</p>
      </div>

      {/* Top Row: Net Worth + Wellness Score */}
      <div className="grid grid-cols-3 gap-6">
        {/* Net Worth Hero */}
        <div className="col-span-2 glass-card p-8 glow-blue">
          <p className="text-sm text-white/40 font-medium mb-2">Total Net Worth</p>
          <h2 className="text-5xl font-extrabold gradient-text tracking-tight">
            {formatCurrency(totalNetWorth)}
          </h2>
          <div className="flex items-center gap-6 mt-4">
            <div className="flex items-center gap-2">
              {monthlyChange >= 0 ? (
                <TrendingUp className="w-4 h-4 text-positive" />
              ) : (
                <TrendingDown className="w-4 h-4 text-negative" />
              )}
              <span className={`text-sm font-semibold ${monthlyChange >= 0 ? 'text-positive' : 'text-negative'}`}>
                {monthlyChange >= 0 ? '+' : ''}{formatCurrency(monthlyChange)} ({monthlyChangePercent}%)
              </span>
              <span className="text-xs text-white/30">this month</span>
            </div>
            <div className="w-px h-4 bg-white/10" />
            <div className="flex items-center gap-2">
              <span className={`text-sm font-semibold ${totalGainLoss >= 0 ? 'text-positive' : 'text-negative'}`}>
                {totalGainLoss >= 0 ? '+' : ''}{formatCurrency(totalGainLoss)} ({gainLossPercent}%)
              </span>
              <span className="text-xs text-white/30">total P&L</span>
            </div>
          </div>
        </div>

        {/* Wellness Score */}
        <div className="glass-card p-6 flex flex-col items-center justify-center">
          <p className="text-sm text-white/40 font-medium mb-3">Financial Wellness</p>
          <WellnessGauge score={score} />
        </div>
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-5 gap-6">
        {/* Allocation Donut */}
        <div className="col-span-2 glass-card p-6">
          <p className="text-sm text-white/40 font-medium mb-4">Asset Allocation</p>
          <ResponsiveContainer width="100%" height={220}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={60}
                outerRadius={95}
                paddingAngle={2}
                dataKey="value"
                stroke="none"
              >
                {pieData.map((entry) => (
                  <Cell key={entry.key} fill={CATEGORY_COLORS[entry.key]} />
                ))}
              </Pie>
              <Tooltip content={<CustomTooltip />} />
            </PieChart>
          </ResponsiveContainer>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2 mt-4">
            {pieData.map((entry) => (
              <div key={entry.key} className="flex items-center gap-2 text-xs">
                <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: CATEGORY_COLORS[entry.key] }} />
                <span className="text-white/50 truncate">{entry.name}</span>
                <span className="text-white/80 font-medium ml-auto">{((entry.value / totalNetWorth) * 100).toFixed(0)}%</span>
              </div>
            ))}
          </div>
        </div>

        {/* Net Worth Over Time */}
        <div className="col-span-3 glass-card p-6">
          <p className="text-sm text-white/40 font-medium mb-4">Net Worth Over Time</p>
          <ResponsiveContainer width="100%" height={280}>
            <AreaChart data={NET_WORTH_HISTORY}>
              <defs>
                <linearGradient id="netWorthGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3B82F6" stopOpacity={0.3} />
                  <stop offset="100%" stopColor="#3B82F6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="rgba(255,255,255,0.04)" strokeDasharray="3 3" />
              <XAxis
                dataKey="month"
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                tick={{ fill: 'rgba(255,255,255,0.3)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                tickFormatter={(v) => `${(v / 1000).toFixed(0)}K`}
                domain={['dataMin - 10000', 'dataMax + 10000']}
              />
              <Tooltip content={<CustomTooltip />} />
              <Area
                type="monotone"
                dataKey="value"
                stroke="#3B82F6"
                strokeWidth={2.5}
                fill="url(#netWorthGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Bottom Row: Wellness Breakdown + Insights */}
      <div className="grid grid-cols-2 gap-6">
        {/* Wellness Breakdown */}
        <div className="glass-card p-6">
          <p className="text-sm text-white/40 font-medium mb-4">Wellness Score Breakdown</p>
          <div className="space-y-4">
            {breakdown.map((item) => (
              <div key={item.label}>
                <div className="flex justify-between items-center mb-1.5">
                  <span className="text-sm text-white/70">{item.label}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-white/40">{item.detail}</span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${
                      item.status === 'pass'
                        ? 'text-positive bg-positive/10'
                        : 'text-negative bg-negative/10'
                    }`}>
                      {item.score}/{item.max}
                    </span>
                  </div>
                </div>
                <div className="h-1.5 bg-white/[0.06] rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${(item.score / item.max) * 100}%`,
                      backgroundColor: item.status === 'pass' ? '#10B981' : '#EF4444',
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Quick Insights */}
        <div className="glass-card p-6">
          <p className="text-sm text-white/40 font-medium mb-4">Quick Insights</p>
          <div className="space-y-3">
            {MOCK_INSIGHTS.map((insight, i) => (
              <div key={i} className={`flex gap-3 p-3 rounded-xl bg-white/[0.02] border ${insightBorders[insight.type]}`}>
                <div className="mt-0.5 flex-shrink-0">{insightIcons[insight.type]}</div>
                <div>
                  <p className="text-sm font-medium text-white/80">{insight.title}</p>
                  <p className="text-xs text-white/40 mt-0.5 leading-relaxed">{insight.message}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
