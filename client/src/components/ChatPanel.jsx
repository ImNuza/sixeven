import { useEffect, useRef, useState } from 'react'
import { Bot, Send, X, Sparkles, RefreshCw, AlertTriangle, ChevronRight } from 'lucide-react'
import { useChat } from '../context/ChatContext'
import { sendChatMessage } from '../services/api'

const SUGGESTED = [
  { icon: '📊', text: 'How can I improve my wellness score?' },
  { icon: '⚖️', text: 'Am I taking too much risk?' },
  { icon: '🛡️', text: 'How should I build my emergency fund?' },
  { icon: '🌍', text: 'What does diversification mean for me?' },
]

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
      </div>
    </div>
  )
}

export default function ChatPanel() {
  const { isOpen, closeChat, pendingPrompt, setPendingPrompt, portfolioContext } = useChat()
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [disclaimerDismissed, setDisclaimerDismissed] = useState(false)
  const bottomRef = useRef(null)
  const inputRef = useRef(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, loading])

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => inputRef.current?.focus(), 150)
    }
  }, [isOpen])

  useEffect(() => {
    if (isOpen && pendingPrompt) {
      setPendingPrompt(null)
      handleSend(pendingPrompt)
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, pendingPrompt])

  async function handleSend(text) {
    const content = (text || input).trim()
    if (!content || loading) return
    setInput('')

    const userMsg = { role: 'user', content }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setLoading(true)

    try {
      const { reply } = await sendChatMessage(nextMessages, portfolioContext)
      setMessages(prev => [...prev, { role: 'assistant', content: reply }])
    } catch (err) {
      setMessages(prev => [...prev, {
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
      {/* ── Header ─────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-4 pt-4 pb-3"
        style={{ borderBottom: '1px solid var(--app-border)' }}
      >
        {/* Gradient bar */}
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
                onClick={() => setMessages([])}
                title="New conversation"
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

      {/* ── Disclaimer banner ──────────────────────────────────── */}
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

      {/* ── Messages ───────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {messages.length === 0 && (
          <div className="space-y-4">
            {/* Welcome */}
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

            {/* Suggested questions */}
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
                {[0, 1, 2].map(i => (
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

      {/* ── Input ──────────────────────────────────────────────── */}
      <div
        className="flex-shrink-0 px-3 pt-2 pb-3"
        style={{ borderTop: '1px solid var(--app-border)' }}
      >
        <div
          className="flex items-end gap-2 rounded-2xl border px-3 py-2.5 transition-all focus-within:border-accent/50"
          style={{
            background: 'var(--app-surface)',
            borderColor: 'var(--app-border)',
          }}
        >
          <textarea
            ref={inputRef}
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask about your portfolio…"
            rows={1}
            className="flex-1 resize-none bg-transparent text-sm outline-none leading-relaxed max-h-28"
            style={{ color: 'var(--app-text)' }}
          />
          <button
            onClick={() => handleSend()}
            disabled={!input.trim() || loading}
            className="h-8 w-8 rounded-xl flex-shrink-0 flex items-center justify-center transition-all disabled:opacity-35 hover:opacity-85 shadow-md"
            style={{ background: 'linear-gradient(135deg, var(--app-accent), #0ea5e9)', color: 'white' }}
          >
            <Send className="h-3.5 w-3.5" />
          </button>
        </div>
        <p className="text-[10px] text-center mt-2" style={{ color: 'var(--app-text-muted)', opacity: 0.6 }}>
          Not financial advice · Educational purposes only
        </p>
      </div>
    </div>
  )
}
