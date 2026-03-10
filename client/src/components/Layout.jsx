import { Outlet } from 'react-router-dom'
import { Sparkles } from 'lucide-react'
import Sidebar from './Sidebar'
import ChatPanel from './ChatPanel'
import ToastContainer from './ToastContainer'
import { useChat } from '../context/ChatContext'
import { useSidebar } from '../context/SidebarContext'

export default function Layout() {
  const { isOpen, toggleChat } = useChat()
  const { collapsed } = useSidebar()

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

      {/* Floating WealthAI toggle — Notion-style bottom-right */}
      {!isOpen && (
        <button
          onClick={toggleChat}
          className="fixed bottom-6 right-6 z-[150] flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold text-white transition-all hover:scale-105 active:scale-95"
          style={{
            background: 'var(--app-accent)',
            boxShadow: '0 4px 20px color-mix(in srgb, var(--app-accent) 40%, transparent)',
          }}
          title="Open WealthAI"
        >
          <Sparkles className="h-4 w-4" />
          WealthAI
        </button>
      )}
    </div>
  )
}
