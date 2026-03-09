import { createContext, useCallback, useContext, useState } from 'react'

const NotificationContext = createContext(null)

let _id = 0

export function NotificationProvider({ children }) {
  const [notifications, setNotifications] = useState([])

  const dismiss = useCallback((id) => {
    setNotifications(n => n.filter(x => x.id !== id))
  }, [])

  const notify = useCallback(({ type = 'success', title, message, duration = 4000 }) => {
    const id = ++_id
    setNotifications(n => [...n.slice(-4), { id, type, title, message }])
    if (duration > 0) setTimeout(() => dismiss(id), duration)
    return id
  }, [dismiss])

  return (
    <NotificationContext.Provider value={{ notifications, notify, dismiss }}>
      {children}
    </NotificationContext.Provider>
  )
}

export function useNotify() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotify must be used within NotificationProvider')
  return ctx.notify
}

export function useNotifications() {
  const ctx = useContext(NotificationContext)
  if (!ctx) throw new Error('useNotifications must be used within NotificationProvider')
  return ctx
}
