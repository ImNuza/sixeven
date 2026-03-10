import { useEffect, useRef, useState } from 'react'
import * as XLSX from 'xlsx'
import { Bot, Send, X, Sparkles, RefreshCw, AlertTriangle, ChevronRight, Plus, Paperclip, FileText, Image as ImageIcon } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { sendChatMessage } from '../services/api'

const SUGGESTED = [
  { icon: '📊', text: 'How can I improve my wellness score?' },
  { icon: '⚖️', text: 'Am I taking too much risk?' },
  { icon: '🛡️', text: 'How should I build my emergency fund?' },
  { icon: '🌍', text: 'What does diversification mean for me?' },
]

const MAX_ATTACHMENT_TEXT_LENGTH = 4000
const SUPPORTED_ATTACHMENT_LABEL = '.txt, .csv, .json, .xlsx, .xls, images'

function formatFileSize(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 KB'
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

function getAttachmentIcon(type) {
  return type.startsWith('image/') ? ImageIcon : FileText
}

function readFileAsText(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.onload = () => resolve(String(reader.result || ''))
    reader.readAsText(file)
  })
}

function readFileAsArrayBuffer(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error(`Failed to read ${file.name}`))
    reader.onload = () => resolve(reader.result)
    reader.readAsArrayBuffer(file)
  })
}

async function parseAttachment(file) {
  const name = file.name || 'attachment'
  const type = file.type || 'application/octet-stream'
  const base = {
    id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
    name,
    type,
    size: file.size || 0,
    status: 'ready',
    summary: '',
    extractedText: '',
  }

  if (type.startsWith('image/')) {
    return {
      ...base,
      summary: `Attached image: ${name} (${formatFileSize(file.size)}). The current chat model cannot inspect image pixels directly, so include a short description in your question if the image contains important details.`,
    }
  }

  const lower = name.toLowerCase()
  if (lower.endsWith('.txt') || lower.endsWith('.csv') || lower.endsWith('.json') || type.startsWith('text/')) {
    const rawText = await readFileAsText(file)
    const extractedText = rawText.slice(0, MAX_ATTACHMENT_TEXT_LENGTH)
    return {
      ...base,
      summary: `Attached file: ${name} (${formatFileSize(file.size)}). Text extracted for analysis.`,
      extractedText,
    }
  }

  if (lower.endsWith('.xlsx') || lower.endsWith('.xls')) {
    const buffer = await readFileAsArrayBuffer(file)
    const workbook = XLSX.read(buffer, { type: 'array' })
    const sheetName = workbook.SheetNames[0]
    const sheet = sheetName ? workbook.Sheets[sheetName] : null
    const extractedText = sheet
      ? XLSX.utils.sheet_to_csv(sheet).slice(0, MAX_ATTACHMENT_TEXT_LENGTH)
      : ''

    return {
      ...base,
      summary: `Attached spreadsheet: ${name} (${formatFileSize(file.size)}). First worksheet extracted for analysis.`,
      extractedText,
    }
  }

  return {
    ...base,
    status: 'unsupported',
    summary: `Unsupported file type for ${name}. Upload ${SUPPORTED_ATTACHMENT_LABEL}.`,
  }
}

function buildAttachmentContext(attachments) {
  const usable = attachments.filter((attachment) => attachment.status === 'ready')
  if (!usable.length) {
    return null
  }

  return usable.map((attachment, index) => {
    const lines = [
      `Attachment ${index + 1}: ${attachment.name}`,
      `Type: ${attachment.type || 'unknown'}`,
      `Size: ${formatFileSize(attachment.size)}`,
      attachment.summary,
    ]

    if (attachment.extractedText) {
      lines.push('Extracted content:')
      lines.push(attachment.extractedText)
    }

    return lines.join('\n')
  }).join('\n\n')
}

function Message({ msg }) {
  const isUser = msg.role === 'user'
  return (
    <div className={`flex gap-2.5 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
      {!isUser && (
        <div
          className="h-7 w-7 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
          style={{ background: 'linear-gradient(135deg, var(--app-accent), #06b6d4)' }}
        >
          <Sparkles className="h-3.5 w-3.5 text-white" />
        </div>
      )}
      <div
        className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
          isUser ? 'rounded-tr-sm' : 'rounded-tl-sm'
        }`}
        style={
          isUser
            ? { background: 'linear-gradient(135deg, var(--app-accent), #0ea5e9)', color: 'white' }
            : { background: 'var(--app-surface)', border: '1px solid var(--app-border)', color: 'var(--app-text-soft)' }
        }
      >
        {msg.content.split('\n').map((line, i, arr) => (
          <span key={i}>
            {line}
            {i < arr.length - 1 && <br />}
          </span>
        ))}
        {Array.isArray(msg.attachments) && msg.attachments.length > 0 && (
          <div className={`mt-3 space-y-2 ${isUser ? 'text-white/90' : ''}`}>
            {msg.attachments.map((attachment) => {
              const Icon = getAttachmentIcon(attachment.type || '')
              return (
                <div
                  key={attachment.id}
                  className="rounded-xl px-3 py-2 text-[11px]"
                  style={{
                    background: isUser ? 'rgba(255,255,255,0.14)' : 'rgba(255,255,255,0.04)',
                    border: '1px solid rgba(255,255,255,0.08)',
                  }}
                >
                  <div className="flex items-center gap-2 font-medium">
                    <Icon className="h-3.5 w-3.5" />
                    <span className="truncate">{attachment.name}</span>
                    <span className="opacity-70">{formatFileSize(attachment.size)}</span>
                  </div>
                  {attachment.summary && (
                    <p className="mt-1 leading-relaxed opacity-80">{attachment.summary}</p>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const {
    isOpen,
    closeChat,
    pendingPrompt,
    setPendingPrompt,
    portfolioContext,
    tabs,
    activeTab,
    activeTabId,
    setActiveTabId,
    createTab,
    deleteTab,
    replaceActiveMessages,
    clearActiveTab,
    setActiveDraftAttachments,
  } = useChat()
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false)
  const [attachmentError, setAttachmentError] = useState('')
  const bottomRef = useRef(null)
  const inputRef = useRef(null)
  const fileInputRef = useRef(null)
  const messages = activeTab?.messages || []
  const draftAttachments = activeTab?.draftAttachments || []

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen, activeTabId])

  useEffect(() => {
    if (isOpen && pendingPrompt) {
      setPendingPrompt(null)
      handleSend(pendingPrompt)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingPrompt, activeTabId])

  async function handleSend(text) {
    const content = (text || input).trim()
    if ((!content && draftAttachments.length === 0) || loading) return
    setInput('')
    setAttachmentError('')

    const attachmentContext = buildAttachmentContext(draftAttachments)
    const userMsg = {
      role: 'user',
      content: content || 'Please analyze the attached supporting data.',
      attachments: draftAttachments,
    }
    const requestContent = attachmentContext
      ? `${userMsg.content}\n\nSupporting data from attached files:\n${attachmentContext}`
      : userMsg.content

    const nextMessages = [...messages, userMsg]
    const requestMessages = [...messages, { role: 'user', content: requestContent }]
    replaceActiveMessages(nextMessages)
    setActiveDraftAttachments([])
    setLoading(true)

    try {
      const combinedContext = [portfolioContext, attachmentContext].filter(Boolean).join('\n\n')
      const { reply } = await sendChatMessage(requestMessages, combinedContext || null)
      replaceActiveMessages([...nextMessages, { role: 'assistant', content: reply }])
    } catch (err) {
      replaceActiveMessages([...nextMessages, {
        role: 'assistant',
        content: `Sorry, I ran into an error: ${err.message}. Please try again.`,
      }])
    } finally {
      setLoading(false)
    }
  }

  function handleKeyDown(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function handleAttachmentChange(event) {
    const files = Array.from(event.target.files || [])
    event.target.value = ''
    if (!files.length) return

    setAttachmentError('')
    const parsed = []

    for (const file of files.slice(0, 4)) {
      try {
        parsed.push(await parseAttachment(file))
      } catch (error) {
        parsed.push({
          id: `${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
          name: file.name,
          type: file.type || 'application/octet-stream',
          size: file.size || 0,
          status: 'error',
          summary: error.message || `Failed to process ${file.name}.`,
          extractedText: '',
        })
      }
    }

    const next = [...draftAttachments, ...parsed].slice(0, 4)
    setActiveDraftAttachments(next)

    if (parsed.some((file) => file.status !== 'ready')) {
      setAttachmentError(`Some files could not be fully analyzed. Supported types: ${SUPPORTED_ATTACHMENT_LABEL}.`)
    }
  }

  function removeDraftAttachment(attachmentId) {
    setActiveDraftAttachments(draftAttachments.filter((attachment) => attachment.id !== attachmentId))
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed top-0 right-0 z-[95] h-screen w-[380px] flex flex-col"
      style={{
        background: 'var(--app-bg-elevated)',
        borderLeft: '1px solid var(--app-border)',
        backdropFilter: 'blur(28px)',
        WebkitBackdropFilter: 'blur(28px)',
      }}
    >
      <div
        className="flex-shrink-0 px-4 pt-4 pb-3"
        style={{ borderBottom: '1px solid var(--app-border)' }}
      >
        <div
          className="absolute top-0 left-0 right-0 h-0.5 rounded-t"
          style={{ background: 'linear-gradient(90deg, var(--app-accent), #06b6d4, #818cf8)' }}
        />
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="h-9 w-9 rounded-2xl flex items-center justify-center shadow-lg"
              style={{ background: 'linear-gradient(135deg, var(--app-accent), #06b6d4)' }}
            >
              <Sparkles className="h-4 w-4 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-bold tracking-tight" style={{ color: 'var(--app-text)' }}>WealthAI</p>
                <span
                  className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
                >
                  Beta
                </span>
              </div>
              <p className="text-[10px] mt-0.5" style={{ color: 'var(--app-text-muted)' }}>
                Qwen 2.5 7B · Financial Wellness Advisor
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            {messages.length > 0 && (
              <button
                onClick={clearActiveTab}
                title="Clear current conversation"
                className="h-8 w-8 rounded-xl flex items-center justify-center transition-colors hover:bg-white/[0.06]"
                style={{ color: 'var(--app-text-muted)' }}
              >
                <RefreshCw className="h-3.5 w-3.5" />
              </button>
            )}
            <button
              onClick={closeChat}
              className="h-8 w-8 rounded-xl flex items-center justify-center transition-colors hover:bg-white/[0.06]"
              style={{ color: 'var(--app-text-muted)' }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-shrink-0 px-3 pt-3">
        <div className="flex items-center gap-2 overflow-x-auto pb-1">
          {tabs.map((tab) => (
            <div
              key={tab.id}
              className="flex items-center gap-1 rounded-xl border px-2.5 py-1.5 flex-shrink-0"
              style={{
                borderColor: tab.id === activeTabId ? 'color-mix(in srgb, var(--app-accent) 55%, transparent)' : 'var(--app-border)',
                background: tab.id === activeTabId ? 'var(--app-accent-soft)' : 'var(--app-surface)',
              }}
            >
              <button
                onClick={() => setActiveTabId(tab.id)}
                className="text-[11px] font-medium truncate max-w-[112px]"
                style={{ color: tab.id === activeTabId ? 'var(--app-accent)' : 'var(--app-text-soft)' }}
                title={tab.title}
              >
                {tab.title}
              </button>
              {tabs.length > 1 && (
                <button
                  onClick={() => deleteTab(tab.id)}
                  className="rounded-md p-0.5 transition-colors hover:bg-white/[0.06]"
                  style={{ color: 'var(--app-text-muted)' }}
                  title="Close chat tab"
                >
                  <X className="h-3 w-3" />
                </button>
              )}
            </div>
          ))}
          <button
            onClick={createTab}
            className="flex h-8 w-8 items-center justify-center rounded-xl border flex-shrink-0 transition-colors hover:bg-white/[0.06]"
            style={{ borderColor: 'var(--app-border)', color: 'var(--app-text-soft)', background: 'var(--app-surface)' }}
            title="New chat tab"
          >
            <Plus className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {!disclaimerDismissed && (
        <div
          className="flex-shrink-0 mx-3 mt-3 rounded-2xl px-3.5 py-3"
          style={{
            background: 'rgba(240,161,0,0.08)',
            border: '1px solid rgba(240,161,0,0.22)',
          }}
        >
          <div className="flex gap-2.5">
            <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#f0a100' }} />
            <div className="flex-1 min-w-0">
              <p className="text-xs font-semibold mb-0.5" style={{ color: '#f0a100' }}>
                AI can make mistakes
              </p>
              <p className="text-[11px] leading-relaxed" style={{ color: 'var(--app-text-muted)' }}>
                WealthAI provides general guidance only — not regulated financial advice. Always verify with a licensed adviser before making investment decisions.
              </p>
              <button
                onClick={() => setDisclaimerDismissed(true)}
                className="mt-2 text-[11px] font-semibold flex items-center gap-1 transition-opacity hover:opacity-70"
                style={{ color: '#f0a100' }}
              >
                I understand <ChevronRight className="h-3 w-3" />
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-4">
            <div className="flex flex-col items-center text-center pt-2 pb-1 gap-2">
              <div
                className="h-16 w-16 rounded-3xl flex items-center justify-center shadow-xl"
                style={{ background: 'linear-gradient(135deg, var(--app-accent), #06b6d4)' }}
              >
                <Bot className="h-7 w-7 text-white" />
              </div>
              <p className="text-base font-bold mt-1" style={{ color: 'var(--app-text)' }}>
                How can I help you?
              </p>
              <p className="text-xs max-w-[260px]" style={{ color: 'var(--app-text-muted)' }}>
                Ask me anything about your portfolio, financial goals, or wealth wellness strategy.
              </p>
            </div>

            <div>
              <p
                className="text-[10px] font-semibold uppercase tracking-wider mb-2 px-0.5"
                style={{ color: 'var(--app-text-muted)' }}
              >
                Suggested
              </p>
              <div className="space-y-2">
                {SUGGESTED.map(({ icon, text }) => (
                  <button
                    key={text}
                    onClick={() => handleSend(text)}
                    className="w-full text-left flex items-center gap-3 px-3.5 py-3 rounded-2xl border transition-all hover:border-accent/40 group"
                    style={{
                      borderColor: 'var(--app-border)',
                      background: 'var(--app-surface)',
                    }}
                  >
                    <span className="text-base flex-shrink-0">{icon}</span>
                    <span
                      className="text-xs leading-snug flex-1 group-hover:text-accent transition-colors"
                      style={{ color: 'var(--app-text-soft)' }}
                    >
                      {text}
                    </span>
                    <ChevronRight
                      className="h-3.5 w-3.5 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all -translate-x-1 group-hover:translate-x-0 text-accent"
                    />
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}

        {messages.map((msg, i) => (
          <Message key={i} msg={msg} />
        ))}

        {loading && (
          <div className="flex gap-2.5">
            <div
              className="h-7 w-7 rounded-xl flex-shrink-0 flex items-center justify-center mt-0.5"
              style={{ background: 'linear-gradient(135deg, var(--app-accent), #06b6d4)' }}
            >
              <Sparkles className="h-3.5 w-3.5 text-white" />
            </div>
            <div
              className="px-3.5 py-3 rounded-2xl rounded-tl-sm"
              style={{ background: 'var(--app-surface)', border: '1px solid var(--app-border)' }}
            >
              <div className="flex gap-1.5 items-center">
                {[0, 1, 2].map((i) => (
                  <span
                    key={i}
                    className="h-1.5 w-1.5 rounded-full animate-bounce"
                    style={{ background: 'var(--app-accent)', opacity: 0.7, animationDelay: `${i * 160}ms` }}
                  />
                ))}
              </div>
            </div>
          </div>
        )}

        <div ref={bottomRef} />
      </div>

      <div
        className="flex-shrink-0 px-3 pt-2 pb-3"
        style={{ borderTop: '1px solid var(--app-border)' }}
      >
        {draftAttachments.length > 0 && (
          <div className="mb-2 flex flex-wrap gap-2">
            {draftAttachments.map((attachment) => {
              const Icon = getAttachmentIcon(attachment.type || '')
              return (
                <div
                  key={attachment.id}
                  className="flex items-center gap-2 rounded-xl border px-2.5 py-2 text-[11px]"
                  style={{ borderColor: 'var(--app-border)', background: 'var(--app-surface)' }}
                >
                  <Icon className="h-3.5 w-3.5" style={{ color: 'var(--app-text-muted)' }} />
                  <div className="min-w-0">
                    <p className="truncate font-medium" style={{ color: 'var(--app-text-soft)' }}>{attachment.name}</p>
                    <p style={{ color: 'var(--app-text-muted)' }}>{attachment.status === 'ready' ? 'Ready' : attachment.summary}</p>
                  </div>
                  <button
                    onClick={() => removeDraftAttachment(attachment.id)}
                    className="rounded-md p-0.5 transition-colors hover:bg-white/[0.06]"
                    style={{ color: 'var(--app-text-muted)' }}
                    title="Remove attachment"
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              )
            })}
          </div>
        )}
        {attachmentError && (
          <p className="mb-2 text-[11px]" style={{ color: '#f0a100' }}>
            {attachmentError}
          </p>
        )}
        <div
          className="flex items-end gap-2 rounded-2xl border px-3 py-2.5 transition-all focus-within:border-accent/50"
          style={{
            background: 'var(--app-surface)',
            borderColor: 'var(--app-border)',
          }}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".txt,.csv,.json,.xlsx,.xls,image/*"
            multiple
            className="hidden"
            onChange={handleAttachmentChange}
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="h-8 w-8 rounded-xl flex-shrink-0 flex items-center justify-center transition-all hover:opacity-85"
            style={{ background: 'var(--app-accent-soft)', color: 'var(--app-accent)' }}
            title={`Attach supporting files (${SUPPORTED_ATTACHMENT_LABEL})`}
          >
            <Paperclip className="h-3.5 w-3.5" />
          </button>
          <textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your portfolio…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed max-h-28"
            style={{ color: 'var(--app-text)' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={(!input.trim() && draftAttachments.length === 0) || loading}
            className="h-8 w-8 rounded-xl flex-shrink-0 flex items-center justify-center transition-all disabled:opacity-35 hover:opacity-85 shadow-md"
            style={{ background: 'linear-gradient(135deg, var(--app-accent), #0ea5e9)', color: 'white' }}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-center mt-2" style={{ color: 'var(--app-text-muted)', opacity: 0.6 }}>
          Attach supporting files: {SUPPORTED_ATTACHMENT_LABEL} · Not financial advice
        </p>
      </div>
    </div>
  )
}
