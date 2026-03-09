import { createPortal } from 'react-dom'
import { X, CheckCircle2, AlertCircle, Info, AlertTriangle } from 'lucide-react'
import { useNotifications } from '../context/NotificationContext'

const ICONS = {
  success: { icon: CheckCircle2, color: '#18a871', bg: 'rgba(24,168,113,0.12)', border: 'rgba(24,168,113,0.25)' },
  error:   { icon: AlertCircle,  color: '#e65054', bg: 'rgba(230,80,84,0.12)',  border: 'rgba(230,80,84,0.25)' },
  warning: { icon: AlertTriangle,color: '#f0a100', bg: 'rgba(240,161,0,0.12)', border: 'rgba(240,161,0,0.25)' },
  info:    { icon: Info,         color: '#2f7cf6', bg: 'rgba(47,124,246,0.12)', border: 'rgba(47,124,246,0.25)' },
}

function Toast({ id, type = 'success', title, message }) {
  const { dismiss } = useNotifications()
  const { icon: Icon, color, bg, border } = ICONS[type] ?? ICONS.info

  return (
    <div
      className="flex items-start gap-3 rounded-2xl px-4 py-3 shadow-xl"
      style={{
        background: 'var(--app-bg-elevated)',
        border: `1px solid ${border}`,
        backdropFilter: 'blur(20px)',
        minWidth: 280,
        maxWidth: 340,
        animation: 'toast-in 0.3s cubic-bezier(0.34,1.56,0.64,1)',
      }}
    >
      <div
        className="flex-shrink-0 flex h-8 w-8 items-center justify-center rounded-xl mt-0.5"
        style={{ background: bg }}
      >
        <Icon className="h-4 w-4" style={{ color }} />
      </div>
      <div className="flex-1 min-w-0">
        {title && <p className="text-sm font-semibold" style={{ color: 'var(--app-text)' }}>{title}</p>}
        {message && <p className="text-xs mt-0.5" style={{ color: 'var(--app-text-muted)' }}>{message}</p>}
      </div>
      <button
        onClick={() => dismiss(id)}
        className="flex-shrink-0 h-6 w-6 flex items-center justify-center rounded-lg hover:bg-white/[0.06] transition-colors mt-0.5"
        style={{ color: 'var(--app-text-muted)' }}
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

export default function ToastContainer() {
  const { notifications } = useNotifications()

  return createPortal(
    <div
      className="fixed z-[9999] flex flex-col gap-2.5"
      style={{ bottom: 24, right: 24, pointerEvents: notifications.length ? 'auto' : 'none' }}
    >
      {notifications.map(n => <Toast key={n.id} {...n} />)}
    </div>,
    document.body
  )
}
