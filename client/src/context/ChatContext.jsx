import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from '../auth/AuthContext.jsx'

const ChatContext = createContext(null)
const CHAT_STORAGE_KEY = 'safeseven.chat.tabs'

function getStorageKey(userId) {
  return `${CHAT_STORAGE_KEY}:${userId || 'anon'}`
}

function makeTab(title = 'New Chat') {
  const id = `chat_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
  return {
    id,
    title,
    messages: [],
    draftAttachments: [],
    updatedAt: new Date().toISOString(),
  }
}

function loadStoredState(userId) {
  if (typeof window === 'undefined') {
    const tab = makeTab()
    return { tabs: [tab], activeTabId: tab.id }
  }

  try {
    const raw = window.localStorage.getItem(getStorageKey(userId))
    if (!raw) {
      const tab = makeTab()
      return { tabs: [tab], activeTabId: tab.id }
    }

    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed?.tabs) || !parsed.tabs.length) {
      const tab = makeTab()
      return { tabs: [tab], activeTabId: tab.id }
    }

    const tabs = parsed.tabs
      .filter((tab) => tab && typeof tab.id === 'string')
      .map((tab) => ({
        id: tab.id,
        title: String(tab.title || 'New Chat'),
        messages: Array.isArray(tab.messages) ? tab.messages : [],
        draftAttachments: Array.isArray(tab.draftAttachments) ? tab.draftAttachments : [],
        updatedAt: tab.updatedAt || new Date().toISOString(),
      }))

    if (!tabs.length) {
      const tab = makeTab()
      return { tabs: [tab], activeTabId: tab.id }
    }

    const activeTabId = tabs.some((tab) => tab.id === parsed.activeTabId)
      ? parsed.activeTabId
      : tabs[0].id

    return { tabs, activeTabId }
  } catch {
    const tab = makeTab()
    return { tabs: [tab], activeTabId: tab.id }
  }
}

export function ChatProvider({ children }) {
  const { user } = useAuth()
  const [isOpen, setIsOpen] = useState(false)
  const [pendingPrompt, setPendingPrompt] = useState(null)
  const [portfolioContext, setPortfolioContext] = useState(null)
  const [chatState, setChatState] = useState(() => loadStoredState(user?.id))

  useEffect(() => {
    setChatState(loadStoredState(user?.id))
  }, [user?.id])

  useEffect(() => {
    try {
      window.localStorage.setItem(getStorageKey(user?.id), JSON.stringify(chatState))
    } catch {
      // Ignore storage failures.
    }
  }, [chatState, user?.id])

  const activeTab = useMemo(
    () => chatState.tabs.find((tab) => tab.id === chatState.activeTabId) || chatState.tabs[0],
    [chatState]
  )

  const openChat = useCallback((prompt = null) => {
    setPendingPrompt(prompt)
    setIsOpen(true)
  }, [])

  const closeChat = useCallback(() => setIsOpen(false), [])
  const toggleChat = useCallback(() => setIsOpen((v) => !v), [])

  const setActiveTabId = useCallback((tabId) => {
    setChatState((current) => current.tabs.some((tab) => tab.id === tabId)
      ? { ...current, activeTabId: tabId }
      : current)
  }, [])

  const createTab = useCallback(() => {
    const tab = makeTab()
    setChatState((current) => ({
      tabs: [tab, ...current.tabs].slice(0, 8),
      activeTabId: tab.id,
    }))
    setIsOpen(true)
  }, [])

  const deleteTab = useCallback((tabId) => {
    setChatState((current) => {
      const tabs = current.tabs.filter((tab) => tab.id !== tabId)
      if (!tabs.length) {
        const fallback = makeTab()
        return { tabs: [fallback], activeTabId: fallback.id }
      }
      const activeTabId = current.activeTabId === tabId ? tabs[0].id : current.activeTabId
      return { tabs, activeTabId }
    })
  }, [])

  const replaceActiveMessages = useCallback((messages) => {
    setChatState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => tab.id === current.activeTabId
        ? {
            ...tab,
            title: tab.title === 'New Chat' && messages[0]?.content
              ? String(messages[0].content).slice(0, 28)
              : tab.title,
            messages,
            updatedAt: new Date().toISOString(),
          }
        : tab),
    }))
  }, [])

  const clearActiveTab = useCallback(() => {
    setChatState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => tab.id === current.activeTabId
        ? { ...tab, title: 'New Chat', messages: [], draftAttachments: [], updatedAt: new Date().toISOString() }
        : tab),
    }))
  }, [])

  const setActiveDraftAttachments = useCallback((attachments) => {
    setChatState((current) => ({
      ...current,
      tabs: current.tabs.map((tab) => tab.id === current.activeTabId
        ? { ...tab, draftAttachments: Array.isArray(attachments) ? attachments : [], updatedAt: new Date().toISOString() }
        : tab),
    }))
  }, [])

  return (
    <ChatContext.Provider
      value={{
        isOpen,
        openChat,
        closeChat,
        toggleChat,
        pendingPrompt,
        setPendingPrompt,
        portfolioContext,
        setPortfolioContext,
        tabs: chatState.tabs,
        activeTabId: chatState.activeTabId,
        activeTab,
        setActiveTabId,
        createTab,
        deleteTab,
        replaceActiveMessages,
        clearActiveTab,
        setActiveDraftAttachments,
      }}
    >
      {children}
    </ChatContext.Provider>
  )
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
