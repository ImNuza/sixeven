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
const DEFAULT_BUTTON_WIDTH = 132
const DEFAULT_BUTTON_HEIGHT = 44

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

function getStorageKey(userId) {
  return `${FLOATING_CHAT_STORAGE_KEY}:${userId || 'anon'}`
}

function getDefaultFloatingPosition() {
  if (typeof window === 'undefined') {
    return { x: FLOATING_CHAT_MARGIN, y: FLOATING_CHAT_MARGIN }
  }

  return {
    x: Math.max(FLOATING_CHAT_MARGIN, window.innerWidth - DEFAULT_BUTTON_WIDTH - FLOATING_CHAT_MARGIN),
    y: Math.max(FLOATING_CHAT_MARGIN, window.innerHeight - DEFAULT_BUTTON_HEIGHT - FLOATING_CHAT_MARGIN),
  }
}

function clampFloatingPosition(position, rect = { width: DEFAULT_BUTTON_WIDTH, height: DEFAULT_BUTTON_HEIGHT }) {
  if (typeof window === 'undefined') {
    return position
  }

  const maxX = Math.max(FLOATING_CHAT_MARGIN, window.innerWidth - rect.width - FLOATING_CHAT_MARGIN)
  const maxY = Math.max(FLOATING_CHAT_MARGIN, window.innerHeight - rect.height - FLOATING_CHAT_MARGIN)

  return {
    x: clamp(Number(position?.x ?? FLOATING_CHAT_MARGIN), FLOATING_CHAT_MARGIN, maxX),
    y: clamp(Number(position?.y ?? FLOATING_CHAT_MARGIN), FLOATING_CHAT_MARGIN, maxY),
  }
}

function loadFloatingPosition(userId) {
  if (typeof window === 'undefined') {
    return getDefaultFloatingPosition()
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId))
    if (!raw) {
      return getDefaultFloatingPosition()
    }

    const parsed = JSON.parse(raw)
    if (Number.isFinite(parsed?.x) && Number.isFinite(parsed?.y)) {
      return clampFloatingPosition(parsed)
    }
  } catch {
    // Ignore storage failures and fall back to default.
  }

  return getDefaultFloatingPosition()
}

export default function Layout() {
  const { isOpen, toggleChat } = useChat()
  const { collapsed } = useSidebar()
  const { user } = useAuth()
  const [floatingPosition, setFloatingPosition] = useState(() => loadFloatingPosition(user?.id))
  const [dragState, setDragState] = useState(null)
  const buttonRef = useRef(null)
  const dragMetaRef = useRef(null)
  const suppressClickRef = useRef(false)
  const justDraggedUntilRef = useRef(0)

  useEffect(() => {
    setFloatingPosition(loadFloatingPosition(user?.id))
  }, [user?.id])

  useEffect(() => {
    function handleResize() {
      const rect = buttonRef.current?.getBoundingClientRect() || {
        width: DEFAULT_BUTTON_WIDTH,
        height: DEFAULT_BUTTON_HEIGHT,
      }
      setFloatingPosition((current) => clampFloatingPosition(current, rect))
    }

    window.addEventListener('resize', handleResize)
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  useEffect(() => {
    try {
      window.localStorage.setItem(getStorageKey(user?.id), JSON.stringify(floatingPosition))
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
      const moved = Math.abs(x - dragState.startX) > 6 || Math.abs(y - dragState.startY) > 6
      dragMetaRef.current = { moved }
      setDragState((current) => current ? { ...current, x, y, moved } : current)
    }

    function handlePointerUp() {
      setDragState((current) => {
        if (!current) return null
        const didDrag = Boolean(dragMetaRef.current?.moved)
        suppressClickRef.current = didDrag
        if (didDrag) {
          justDraggedUntilRef.current = Date.now() + 250
        }
        setFloatingPosition(clampFloatingPosition({ x: current.x, y: current.y }, current.rect))
        dragMetaRef.current = null
        return null
      })
    }

    window.addEventListener('pointermove', handlePointerMove)
    window.addEventListener('pointerup', handlePointerUp)

    return () => {
      window.removeEventListener('pointermove', handlePointerMove)
      window.removeEventListener('pointerup', handlePointerUp)
    }
  }, [dragState])

  function handleFloatingPointerDown(event) {
    const rect = buttonRef.current?.getBoundingClientRect()
    if (!rect) return

    dragMetaRef.current = { moved: false }
    setDragState({
      rect,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      x: rect.left,
      y: rect.top,
      startX: rect.left,
      startY: rect.top,
      moved: false,
    })
  }

  function handleFloatingClick() {
    if (suppressClickRef.current || Date.now() < justDraggedUntilRef.current) {
      suppressClickRef.current = false
      return
    }
    toggleChat()
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

      {/* Draggable WealthAI toggle — freely placeable anywhere on screen */}
      {!isOpen && (
        <button
          ref={buttonRef}
          onPointerDown={handleFloatingPointerDown}
          onClick={handleFloatingClick}
          className="fixed bottom-6 right-6 z-[150] flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
          style={{
            ...(dragState
              ? {
                  top: `${dragState.y}px`,
                  left: `${dragState.x}px`,
                }
              : {
                  top: `${floatingPosition.y}px`,
                  left: `${floatingPosition.x}px`,
                }),
            right: 'auto',
            bottom: 'auto',
            transform: 'none',
            transition: dragState ? 'none' : undefined,
            background: 'var(--app-accent)',
            boxShadow: '0 4px 20px color-mix(in srgb, var(--app-accent) 40%, transparent)',
            cursor: dragState ? 'grabbing' : 'grab',
          }}
          aria-label="Open WealthAI chat"
          title="Drag to move WealthAI"
        >
          <Sparkles className="h-4 w-4" />
          WealthAI
        </button>
      )}
    </div>
  )
}
