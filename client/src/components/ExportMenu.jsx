import { useState, useRef, useEffect } from 'react'
import { Download, FileText, Sheet, ChevronDown } from 'lucide-react'

export default function ExportMenu({ onExportPDF, onExportExcel, label = 'Export' }) {
  const [open, setOpen] = useState(false)
  const ref = useRef(null)

  useEffect(() => {
    function handler(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        className="inline-flex items-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-medium transition hover:bg-white/[0.07]"
        style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)', color: 'var(--app-text-soft)' }}
      >
        <Download className="h-4 w-4" />
        {label}
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-44 rounded-2xl border py-1.5 shadow-xl z-50"
          style={{ background: 'var(--app-bg-elevated)', borderColor: 'var(--app-border)', backdropFilter: 'blur(20px)' }}
        >
          <button
            type="button"
            onClick={() => { setOpen(false); onExportPDF?.() }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-white/[0.05]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <FileText className="h-4 w-4 text-accent" />
            Export PDF
          </button>
          <button
            type="button"
            onClick={() => { setOpen(false); onExportExcel?.() }}
            className="flex w-full items-center gap-3 px-4 py-2.5 text-sm transition hover:bg-white/[0.05]"
            style={{ color: 'var(--app-text-soft)' }}
          >
            <Sheet className="h-4 w-4 text-emerald-400" />
            Export Excel
          </button>
        </div>
      )}
    </div>
  )
}
