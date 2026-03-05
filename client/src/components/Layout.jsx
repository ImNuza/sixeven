import { Outlet } from 'react-router-dom'
import Sidebar from './Sidebar'
import ChatPanel from './ChatPanel'
import { useChat } from '../context/ChatContext'
import { useSidebar } from '../context/SidebarContext'

export default function Layout() {
  const { isOpen } = useChat()
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
    </div>
  )
}
