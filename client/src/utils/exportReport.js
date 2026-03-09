import jsPDF from 'jspdf'
import autoTable from 'jspdf-autotable'
import * as XLSX from 'xlsx'

// ── helpers ───────────────────────────────────────────────────
function formatSGD(v) {
  return new Intl.NumberFormat('en-SG', { style: 'currency', currency: 'SGD', minimumFractionDigits: 0 }).format(v || 0)
}

// ── PDF ────────────────────────────────────────────────────────
export function exportDashboardPDF({ kpis, holdings, allocation, generatedAt }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  // Header bar
  doc.setFillColor(47, 124, 246)
  doc.rect(0, 0, W, 18, 'F')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('SafeSeven — Portfolio Dashboard Report', 14, 12)

  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generated: ${generatedAt}`, W - 14, 12, { align: 'right' })

  // KPI section
  doc.setTextColor(30, 30, 50)
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.text('Portfolio Summary', 14, 28)

  const kpiRows = kpis.map(k => [k.label, k.value])
  autoTable(doc, {
    startY: 32,
    head: [['Metric', 'Value']],
    body: kpiRows,
    theme: 'striped',
    headStyles: { fillColor: [47, 124, 246], textColor: 255 },
    margin: { left: 14, right: 14 },
  })

  // Holdings
  const holdingsY = doc.lastAutoTable.finalY + 10
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 30, 50)
  doc.text('Top Holdings', 14, holdingsY)

  autoTable(doc, {
    startY: holdingsY + 4,
    head: [['Asset', 'Category', 'Value (SGD)', 'Cost (SGD)', 'P&L']],
    body: holdings.map(h => [h.name, h.category, formatSGD(h.value), formatSGD(h.cost), `${h.pnl >= 0 ? '+' : ''}${formatSGD(h.pnl)}`]),
    theme: 'striped',
    headStyles: { fillColor: [47, 124, 246], textColor: 255 },
    margin: { left: 14, right: 14 },
  })

  // Allocation
  if (allocation?.length) {
    const allocY = doc.lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 50)
    doc.text('Asset Allocation', 14, allocY)

    autoTable(doc, {
      startY: allocY + 4,
      head: [['Category', 'Value (SGD)', 'Weight %']],
      body: allocation.map(a => [a.name, formatSGD(a.value), `${a.pct.toFixed(1)}%`]),
      theme: 'striped',
      headStyles: { fillColor: [47, 124, 246], textColor: 255 },
      margin: { left: 14, right: 14 },
    })
  }

  // Footer
  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 180)
    doc.text('SafeSeven · NTU FinTech Hackathon 2026 · Schroders Wealth Wellness Hub', 14, 290)
    doc.text(`Page ${i} of ${pages}`, W - 14, 290, { align: 'right' })
  }

  doc.save(`safeseven-dashboard-${Date.now()}.pdf`)
}

export function exportInsightsPDF({ score, factors, signals, generatedAt }) {
  const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const W = doc.internal.pageSize.getWidth()

  doc.setFillColor(47, 124, 246)
  doc.rect(0, 0, W, 18, 'F')
  doc.setFontSize(13)
  doc.setTextColor(255, 255, 255)
  doc.setFont('helvetica', 'bold')
  doc.text('SafeSeven — Financial Health Report', 14, 12)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.text(`Generated: ${generatedAt}`, W - 14, 12, { align: 'right' })

  doc.setTextColor(30, 30, 50)
  doc.setFontSize(22)
  doc.setFont('helvetica', 'bold')
  doc.text(`Health Score: ${score}/100`, 14, 34)

  autoTable(doc, {
    startY: 42,
    head: [['Factor', 'Score', 'Status', 'Recommendation']],
    body: factors.map(f => [f.label, `${f.score}/100`, f.pass ? 'Pass' : 'Fail', f.recommendation]),
    theme: 'striped',
    headStyles: { fillColor: [47, 124, 246], textColor: 255 },
    columnStyles: { 3: { cellWidth: 80 } },
    margin: { left: 14, right: 14 },
  })

  if (signals?.length) {
    const sigY = doc.lastAutoTable.finalY + 10
    doc.setFontSize(11)
    doc.setFont('helvetica', 'bold')
    doc.setTextColor(30, 30, 50)
    doc.text('Key Signals', 14, sigY)

    autoTable(doc, {
      startY: sigY + 4,
      head: [['Signal', 'Type']],
      body: signals.map(s => [s.label, s.type]),
      theme: 'striped',
      headStyles: { fillColor: [47, 124, 246], textColor: 255 },
      margin: { left: 14, right: 14 },
    })
  }

  const pages = doc.internal.getNumberOfPages()
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i)
    doc.setFontSize(7)
    doc.setTextColor(160, 160, 180)
    doc.text('SafeSeven · NTU FinTech Hackathon 2026 · Schroders Wealth Wellness Hub', 14, 290)
    doc.text(`Page ${i} of ${pages}`, W - 14, 290, { align: 'right' })
  }

  doc.save(`safeseven-insights-${Date.now()}.pdf`)
}

// ── Excel ──────────────────────────────────────────────────────
export function exportDashboardExcel({ kpis, holdings, allocation, generatedAt }) {
  const wb = XLSX.utils.book_new()

  // Summary sheet
  const summaryData = [
    ['SafeSeven Portfolio Report'],
    [`Generated: ${generatedAt}`],
    [],
    ['Metric', 'Value'],
    ...kpis.map(k => [k.label, k.value]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(summaryData)
  ws1['!cols'] = [{ wch: 28 }, { wch: 20 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Summary')

  // Holdings sheet
  const holdingsData = [
    ['Asset', 'Category', 'Value (SGD)', 'Cost (SGD)', 'P&L (SGD)', 'P&L %'],
    ...holdings.map(h => [
      h.name, h.category, h.value, h.cost,
      h.pnl, h.cost > 0 ? ((h.pnl / h.cost) * 100).toFixed(2) + '%' : 'N/A',
    ]),
  ]
  const ws2 = XLSX.utils.aoa_to_sheet(holdingsData)
  ws2['!cols'] = [{ wch: 28 }, { wch: 16 }, { wch: 14 }, { wch: 14 }, { wch: 14 }, { wch: 10 }]
  XLSX.utils.book_append_sheet(wb, ws2, 'Holdings')

  // Allocation sheet
  if (allocation?.length) {
    const allocData = [
      ['Category', 'Value (SGD)', 'Weight %'],
      ...allocation.map(a => [a.name, a.value, a.pct.toFixed(1) + '%']),
    ]
    const ws3 = XLSX.utils.aoa_to_sheet(allocData)
    ws3['!cols'] = [{ wch: 20 }, { wch: 16 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws3, 'Allocation')
  }

  XLSX.writeFile(wb, `safeseven-dashboard-${Date.now()}.xlsx`)
}

export function exportInsightsExcel({ score, factors, signals, generatedAt }) {
  const wb = XLSX.utils.book_new()

  const factorsData = [
    ['SafeSeven Financial Health Report'],
    [`Generated: ${generatedAt}`],
    [`Overall Score: ${score}/100`],
    [],
    ['Factor', 'Score', 'Status', 'Recommendation'],
    ...factors.map(f => [f.label, f.score, f.pass ? 'Pass' : 'Fail', f.recommendation]),
  ]
  const ws1 = XLSX.utils.aoa_to_sheet(factorsData)
  ws1['!cols'] = [{ wch: 22 }, { wch: 10 }, { wch: 10 }, { wch: 50 }]
  XLSX.utils.book_append_sheet(wb, ws1, 'Health Factors')

  if (signals?.length) {
    const sigData = [['Signal', 'Type'], ...signals.map(s => [s.label, s.type])]
    const ws2 = XLSX.utils.aoa_to_sheet(sigData)
    ws2['!cols'] = [{ wch: 50 }, { wch: 12 }]
    XLSX.utils.book_append_sheet(wb, ws2, 'Signals')
  }

  XLSX.writeFile(wb, `safeseven-insights-${Date.now()}.xlsx`)
}
