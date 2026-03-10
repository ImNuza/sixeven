import { createContext, useCallback, useContext, useState } from 'react'

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const [isOpen, setIsOpen] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState(null)
  const [portfolioContext, setPortfolioContext] = useState(null)

  const openChat = useCallback((prompt = null) => {
    setPendingPrompt(prompt)
    setIsOpen(true)
  }, [])

  const closeChat = useCallback(() => setIsOpen(false), [])
  const toggleChat = useCallback(() => setIsOpen(v => !v), [])

  return (
    <ChatContext.Provider value={{ isOpen, openChat, closeChat, toggleChat, pendingPrompt, setPendingPrompt, portfolioContext, setPortfolioContext }}>
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
