import { useEffect, useRef, useState } from 'react'
import { Outlet } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import Sidebar from './Sidebar'
import ChatPanel from './ChatPanel'
import ToastContainer from './ToastContainer'
import { useChat } from '../context/ChatContext'
import { useSidebar } from '../context/SidebarContext'
import { useAuth } from '../auth/AuthContext.jsx'

const FLOATING_CHAT_MARGIN = 24
const FLOATING_CHAT_STORAGE_KEY = 'safeseven.wealthai.position'

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getStorageKey(userId) {
  return `${FLOATING_CHAT_STORAGE_KEY}:${userId || 'anon'}`
}

function loadFloatingPosition(userId) {
  if (typeof window === 'undefined') {
    return 'bottom-right'
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId))
    if (['top-left', 'top-right', 'bottom-left', 'bottom-right'].includes(raw)) {
      return raw
    }
  } catch {
    // Ignore storage failures and fall back to default.
  }

  return 'bottom-right'
}

function getCornerStyle(position) {
  const base = { top: 'auto', right: 'auto', bottom: 'auto', left: 'auto' }

  if (position === 'top-left') {
    return { ...base, top: `${FLOATING_CHAT_MARGIN}px`, left: `${FLOATING_CHAT_MARGIN}px` }
  }
  if (position === 'top-right') {
    return { ...base, top: `${FLOATING_CHAT_MARGIN}px`, right: `${FLOATING_CHAT_MARGIN}px` }
  }
  if (position === 'bottom-left') {
    return { ...base, bottom: `${FLOATING_CHAT_MARGIN}px`, left: `${FLOATING_CHAT_MARGIN}px` }
  }

  return { ...base, bottom: `${FLOATING_CHAT_MARGIN}px`, right: `${FLOATING_CHAT_MARGIN}px` }
}

export default function Layout() {
  const { isOpen, toggleChat } = useChat()
  const { collapsed } = useSidebar()
  const { user } = useAuth()
  const [floatingPosition, setFloatingPosition] = useState(() => loadFloatingPosition(user?.id))
  const [dragState, setDragState] = useState(null)
  const buttonRef = useRef(null)

  useEffect(() => {
    setFloatingPosition(loadFloatingPosition(user?.id))
  }, [user?.id])

  useEffect(() => {
    try {
      window.localStorage.setItem(getStorageKey(user?.id), floatingPosition)
    } catch {
      // Ignore storage failures.
    }
  }, [floatingPosition, user?.id])

  useEffect(() => {
    if (!dragState) return undefined

    function handlePointerMove(event) {
      const rect = dragState.rect
      const maxX = window.innerWidth - rect.width - FLOATING_CHAT_MARGIN
      const maxY = window.innerHeight - rect.height - FLOATING_CHAT_MARGIN
      const x = clamp(event.clientX - dragState.offsetX, FLOATING_CHAT_MARGIN, maxX)
      const y = clamp(event.clientY - dragState.offsetY, FLOATING_CHAT_MARGIN, maxY)
      setDragState((current) => current ? { ...current, x, y, moved: true } : current)
    }

    function handlePointerUp() {
      setDragState((current) => {
        if (!current) return null

        if (!current.moved) {
          toggleChat()
          return null
        }

        const centerX = current.x + current.rect.width / 2
        const centerY = current.y + current.rect.height / 2
        const horizontal = centerX < window.innerWidth / 2 ? 'left' : 'right'
        const vertical = centerY < window.innerHeight / 2 ? 'top' : 'bottom'
        setFloatingPosition(`${vertical}-${horizontal}`)
        return null
      })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState, toggleChat])

  function handleFloatingPointerDown(event) {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return

    setDragState({
      rect,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      x: rect.left,
      y: rect.top,
      moved: false,
    })
  }

  return (
    <div className="app-shell">
      <Sidebar />
      <main
        className="min-h-screen px-8 py-6 transition-all duration-300 ease-in-out"
        style={{
          marginLeft: collapsed ? '68px' : '256px',
          marginRight: isOpen ? '380px' : '0',
        }}
      >
        <Outlet />
      </main>
      <ChatPanel />
      <ToastContainer />

      {/* Draggable WealthAI toggle — snaps to the nearest corner */}
      {!isOpen && (
        <button
          ref={buttonRef}
          onPointerDown={handleFloatingPointerDown}
          className="fixed bottom-6 right-6 z-[150] flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
          style={{
            ...(dragState
              ? {
                  top: `${dragState.y}px`,
                  left: `${dragState.x}px`,
                  right: 'auto',
                  bottom: 'auto',
                  transform: 'none',
                  transition: 'none',
                }
              : getCornerStyle(floatingPosition)),
            background: 'var(--app-accent)',
            boxShadow: '0 4px 20px color-mix(in srgb, var(--app-accent) 40%, transparent)',
            cursor: dragState ? 'grabbing' : 'grab',
          }}
          title="Drag to move WealthAI"
        >
          <Sparkles className="h-4 w-4" />
          WealthAI
        </button>
      )}
    </div>
  )
}
