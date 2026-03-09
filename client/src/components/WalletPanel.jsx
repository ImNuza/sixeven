import { useEffect, useState } from 'react'
import { useWeb3Modal } from '@web3modal/wagmi/react'
import { useAccount, useBalance, useDisconnect, useChainId } from 'wagmi'
import {
  Wallet, Unplug, RefreshCw, ChevronDown, ChevronUp,
  Plus, Trash2, ExternalLink, Download, AlertCircle,
} from 'lucide-react'
import {
  fetchWalletConnections, saveWalletConnection, deleteWalletConnection, fetchWalletBalances,
  fetchWalletPortfolio, createAsset,
} from '../services/api.js'
import { resolveCoinGeckoId } from '../../../shared/constants.js'

const CHAIN_LABELS = { 1: 'Ethereum', 137: 'Polygon', 42161: 'Arbitrum', 56: 'BSC' }

function shortAddress(addr) {
  if (!addr) return ''
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`
}

function TokenRow({ token, onImport }) {
  const [importing, setImporting] = useState(false)
  const [done, setDone] = useState(false)

  async function handleImport() {
    setImporting(true)
    try {
      await onImport(token)
      setDone(true)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04] last:border-0">
      <div className="flex items-center gap-3 min-w-0">
        {token.logo ? (
          <img src={token.logo} alt={token.symbol} className="h-7 w-7 rounded-full flex-shrink-0" onError={(e) => { e.target.style.display = 'none' }} />
        ) : (
          <div className="h-7 w-7 rounded-full bg-accent/20 flex items-center justify-center flex-shrink-0">
            <span className="text-[10px] font-bold text-accent">{(token.symbol || '?').slice(0, 2)}</span>
          </div>
        )}
        <div className="min-w-0">
          <p className="text-sm font-semibold text-white/90">{token.symbol}</p>
          <p className="text-xs text-white/35 truncate">{token.name}</p>
        </div>
      </div>
      <div className="flex items-center gap-4 flex-shrink-0">
        <p className="text-sm font-mono text-white/70 tabular-nums">
          {token.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}
        </p>
        {done ? (
          <span className="text-xs text-emerald-400 font-medium">Added</span>
        ) : (
          <button
            onClick={handleImport}
            disabled={importing}
            className="text-xs text-accent border border-accent/20 bg-accent/8 rounded-lg px-2.5 py-1 hover:bg-accent/18 transition-colors disabled:opacity-50"
          >
            {importing ? '…' : 'Import'}
          </button>
        )}
      </div>
    </div>
  )
}

function WalletCard({ connection, onRemove, onRefresh }) {
  const [open, setOpen] = useState(false)
  const [balances, setBalances] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  async function loadBalances() {
    setLoading(true)
    setError('')
    try {
      // Try Zerion first (multi-chain, richer data in 1 call)
      try {
        const data = await fetchWalletPortfolio(connection.address)
        if (data?.tokens?.length) {
          setBalances({
            native: data.tokens.find((t) => !t.contractAddress) || { symbol: 'ETH', balance: 0 },
            tokens: data.tokens.filter((t) => t.contractAddress),
            source: 'zerion',
          })
          setOpen(true)
          return
        }
      } catch {
        // Zerion unavailable or not configured — fall through to Alchemy
      }
      // Alchemy fallback (single-chain)
      const data = await fetchWalletBalances(connection.address, connection.chain_id)
      setBalances({ ...data, source: 'alchemy' })
      setOpen(true)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function importToken(token) {
    const today = new Date().toISOString().split('T')[0]
    const chainLabel = token.chainId || CHAIN_LABELS[connection.chain_id] || 'Wallet'
    await createAsset({
      name: token.name || token.symbol,
      category: 'CRYPTO',
      ticker: token.coingeckoId || resolveCoinGeckoId(token.symbol),
      quantity: token.balance,
      value: token.valueUsd ? Math.round(token.valueUsd * 1.35 * 100) / 100 : 0, // rough USD→SGD
      cost: 0,
      date: today,
      institution: `${chainLabel} Wallet`,
      details: {
        walletAddress: connection.address,
        contractAddress: token.contractAddress,
        chainId: token.chainId || connection.chain_id,
        importedFrom: balances?.source || 'wallet',
      },
    })
  }

  async function importNative() {
    if (!balances?.native) return
    const today = new Date().toISOString().split('T')[0]
    const native = balances.native
    await createAsset({
      name: native.name || native.symbol,
      category: 'CRYPTO',
      ticker: native.coingeckoId || resolveCoinGeckoId(native.symbol),
      quantity: native.balance,
      value: native.valueUsd ? Math.round(native.valueUsd * 1.35 * 100) / 100 : 0,
      cost: 0,
      date: today,
      institution: `${CHAIN_LABELS[connection.chain_id] || 'Wallet'} Wallet`,
      details: {
        walletAddress: connection.address,
        chainId: connection.chain_id,
        importedFrom: balances?.source || 'wallet',
      },
    })
  }

  const chainLabel = CHAIN_LABELS[connection.chain_id] || `Chain ${connection.chain_id}`
  const explorerBase = connection.chain_id === 1 ? 'https://etherscan.io'
    : connection.chain_id === 137 ? 'https://polygonscan.com'
    : connection.chain_id === 42161 ? 'https://arbiscan.io'
    : 'https://etherscan.io'

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-white/[0.03] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-accent/30 to-cyan-500/20 flex items-center justify-center flex-shrink-0">
            <Wallet className="h-3.5 w-3.5 text-accent" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-white/90 font-mono">{shortAddress(connection.address)}</p>
            <p className="text-xs text-white/35">{chainLabel}</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <a
            href={`${explorerBase}/address/${connection.address}`}
            target="_blank"
            rel="noopener noreferrer"
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
          >
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
          <button
            onClick={loadBalances}
            disabled={loading}
            className="p-1.5 rounded-lg text-white/30 hover:text-accent hover:bg-accent/[0.08] transition-colors"
            title="Load balances"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setOpen(o => !o)}
            className="p-1.5 rounded-lg text-white/30 hover:text-white/70 hover:bg-white/[0.05] transition-colors"
          >
            {open ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => onRemove(connection.id)}
            className="p-1.5 rounded-lg text-white/30 hover:text-red-400 hover:bg-red-500/[0.08] transition-colors"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {/* Balances */}
      {open && (
        <div className="border-t border-white/[0.05] px-4 py-3">
          {error && (
            <div className="flex items-center gap-2 text-xs text-red-300 bg-red-500/10 border border-red-500/20 rounded-xl px-3 py-2 mb-3">
              <AlertCircle className="h-3.5 w-3.5 flex-shrink-0" />
              {error}
            </div>
          )}
          {!balances && !error && (
            <p className="text-xs text-white/30 text-center py-2">
              Click <RefreshCw className="inline h-3 w-3" /> to load on-chain balances
            </p>
          )}
          {balances && (
            <>
              {/* Native token */}
              <div className="flex items-center justify-between py-2.5 border-b border-white/[0.04]">
                <div className="flex items-center gap-3">
                  <div className="h-7 w-7 rounded-full bg-gradient-to-br from-accent to-cyan-400 flex items-center justify-center flex-shrink-0">
                    <span className="text-[10px] font-bold text-white">{balances.native.symbol.slice(0, 2)}</span>
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-white/90">{balances.native.symbol}</p>
                    <p className="text-xs text-white/35">Native</p>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <p className="text-sm font-mono text-white/70 tabular-nums">
                    {balances.native.balance.toLocaleString(undefined, { maximumFractionDigits: 6 })}
                  </p>
                  <button
                    onClick={importNative}
                    className="text-xs text-accent border border-accent/20 bg-accent/8 rounded-lg px-2.5 py-1 hover:bg-accent/18 transition-colors"
                  >
                    Import
                  </button>
                </div>
              </div>

              {/* ERC-20 tokens */}
              {balances.tokens.length === 0 ? (
                <p className="text-xs text-white/25 text-center py-3">No ERC-20 tokens found</p>
              ) : (
                balances.tokens.map((t) => (
                  <TokenRow key={t.contractAddress} token={t} onImport={importToken} />
                ))
              )}

              {/* Import all */}
              {balances.tokens.length > 0 && (
                <button
                  onClick={async () => {
                    await importNative()
                    for (const t of balances.tokens) await importToken(t)
                  }}
                  className="mt-3 w-full flex items-center justify-center gap-2 rounded-xl border border-accent/20 bg-accent/8 py-2 text-xs font-semibold text-accent hover:bg-accent/15 transition-colors"
                >
                  <Download className="h-3.5 w-3.5" />
                  Import All to Portfolio
                </button>
              )}
            </>
          )}
        </div>
      )}
    </div>
  )
}

export default function WalletPanel({ onImportDone }) {
  const { open: openModal } = useWeb3Modal()
  const { address, isConnected, chain } = useAccount()
  const chainId = useChainId()
  const { data: ethBalance } = useBalance({ address })
  const { disconnect } = useDisconnect()

  const [connections, setConnections] = useState([])
  const [expanded, setExpanded] = useState(true)
  const [addAddress, setAddAddress] = useState('')
  const [addChain, setAddChain] = useState('1')
  const [addError, setAddError] = useState('')
  const [showManual, setShowManual] = useState(false)

  useEffect(() => {
    loadConnections()
  }, [])

  // Auto-save when wallet connects via Web3Modal
  useEffect(() => {
    if (isConnected && address) {
      handleSaveAddress(address, chainId || 1)
    }
  }, [isConnected, address, chainId])

  async function loadConnections() {
    try {
      const data = await fetchWalletConnections()
      setConnections(data)
    } catch {
      // silent
    }
  }

  async function handleSaveAddress(addr, cId = 1) {
    if (!addr || !/^0x[0-9a-fA-F]{40}$/.test(addr)) {
      setAddError('Invalid Ethereum address (must start with 0x, 42 chars)')
      return
    }
    setAddError('')
    try {
      const saved = await saveWalletConnection(addr, parseInt(cId))
      setConnections(prev => {
        const exists = prev.find(c => c.address === saved.address && c.chain_id === saved.chain_id)
        return exists ? prev : [saved, ...prev]
      })
      setAddAddress('')
      setShowManual(false)
      onImportDone?.()
    } catch (err) {
      setAddError(err.message)
    }
  }

  async function handleRemove(id) {
    await deleteWalletConnection(id)
    setConnections(prev => prev.filter(c => c.id !== id))
  }

  return (
    <div className="rounded-3xl border border-white/[0.07] bg-white/[0.025] backdrop-blur-sm overflow-hidden mb-6">
      {/* Panel header */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="w-full flex items-center justify-between px-6 py-4 hover:bg-white/[0.02] transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-xl bg-gradient-to-br from-accent/25 to-cyan-500/15 flex items-center justify-center">
            <Wallet className="h-4 w-4 text-accent" />
          </div>
          <div className="text-left">
            <p className="text-sm font-semibold text-white/90">Connected Wallets</p>
            <p className="text-xs text-white/35">
              {connections.length === 0 ? 'No wallets connected' : `${connections.length} wallet${connections.length > 1 ? 's' : ''} linked`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {isConnected && (
            <span className="flex items-center gap-1.5 text-xs text-emerald-400 font-medium">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {shortAddress(address)} · {chain?.name || 'Unknown'}
            </span>
          )}
          {expanded ? <ChevronUp className="h-4 w-4 text-white/30" /> : <ChevronDown className="h-4 w-4 text-white/30" />}
        </div>
      </button>

      {expanded && (
        <div className="px-6 pb-5 border-t border-white/[0.04]">
          {/* Connect actions */}
          <div className="flex items-center gap-3 pt-4 pb-4 flex-wrap">
            <button
              onClick={() => openModal()}
              className="inline-flex items-center gap-2 rounded-2xl bg-gradient-to-r from-accent to-cyan-500 px-5 py-2.5 text-sm font-semibold text-white shadow-md shadow-accent/20 hover:shadow-accent/35 transition-shadow"
            >
              <Wallet className="h-4 w-4" />
              Connect Wallet
            </button>

            {isConnected && (
              <button
                onClick={() => disconnect()}
                className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white/50 hover:text-red-400 hover:border-red-500/20 transition-colors"
              >
                <Unplug className="h-3.5 w-3.5" />
                Disconnect
              </button>
            )}

            <button
              onClick={() => setShowManual(s => !s)}
              className="inline-flex items-center gap-2 rounded-2xl border border-white/[0.08] bg-white/[0.03] px-4 py-2.5 text-sm text-white/50 hover:text-white/80 hover:border-white/[0.14] transition-colors"
            >
              <Plus className="h-3.5 w-3.5" />
              Add by Address
            </button>
          </div>

          {/* Manual address input */}
          {showManual && (
            <div className="mb-4 rounded-2xl border border-white/[0.06] bg-white/[0.02] p-4">
              <p className="text-xs font-semibold text-white/40 uppercase tracking-widest mb-3">Add Wallet Address</p>
              <div className="flex gap-2 mb-2">
                <input
                  value={addAddress}
                  onChange={e => setAddAddress(e.target.value)}
                  placeholder="0x..."
                  className="app-input flex-1 text-sm font-mono"
                />
                <select
                  value={addChain}
                  onChange={e => setAddChain(e.target.value)}
                  className="app-input w-36 text-sm"
                >
                  <option value="1">Ethereum</option>
                  <option value="137">Polygon</option>
                  <option value="42161">Arbitrum</option>
                  <option value="56">BSC</option>
                </select>
              </div>
              {addError && <p className="text-xs text-red-300 mb-2">{addError}</p>}
              <button
                onClick={() => handleSaveAddress(addAddress, addChain)}
                className="text-sm font-semibold text-accent border border-accent/20 bg-accent/8 rounded-xl px-4 py-2 hover:bg-accent/15 transition-colors"
              >
                Add Wallet
              </button>
            </div>
          )}

          {/* Saved wallets */}
          {connections.length === 0 ? (
            <div className="py-6 text-center">
              <Wallet className="h-8 w-8 text-white/10 mx-auto mb-2" />
              <p className="text-sm text-white/25">No wallets connected yet</p>
              <p className="text-xs text-white/15 mt-1">Connect via WalletConnect or paste an address above</p>
            </div>
          ) : (
            <div className="space-y-2">
              {connections.map(c => (
                <WalletCard
                  key={c.id}
                  connection={c}
                  onRemove={handleRemove}
                  onRefresh={loadConnections}
                />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
