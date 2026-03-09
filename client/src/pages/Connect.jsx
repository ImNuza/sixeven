import { useCallback, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, Link2 } from 'lucide-react'
import SingpassPanel from '../components/SingpassPanel'
import BankPanel from '../components/BankPanel'
import WalletPanel from '../components/WalletPanel'
import SnapTradePanel from '../components/SnapTradePanel'

export default function Connect() {
  const navigate = useNavigate()
  const [importCount, setImportCount] = useState(0)

  const handleImportDone = useCallback(() => {
    setImportCount(n => n + 1)
  }, [])

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <button
          onClick={() => navigate('/assets')}
          className="inline-flex items-center gap-2 text-sm text-white/50 hover:text-white/80 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Assets
        </button>
      </div>

      <div>
        <div className="flex items-center gap-3 mb-1">
          <div className="h-9 w-9 rounded-2xl flex items-center justify-center bg-accent/10">
            <Link2 className="h-4 w-4 text-accent" />
          </div>
          <h1 className="text-2xl font-bold text-white">Connect Data Sources</h1>
        </div>
        <p className="text-sm text-white/40 ml-12">
          Link your financial accounts to automatically import assets into your portfolio.
        </p>
        {importCount > 0 && (
          <p className="text-xs text-emerald-400 mt-1 ml-12">
            {importCount} import{importCount > 1 ? 's' : ''} added —{' '}
            <button
              onClick={() => navigate('/assets')}
              className="underline hover:no-underline"
            >
              view in Assets
            </button>
          </p>
        )}
      </div>

      <SingpassPanel onImportDone={handleImportDone} />
      <BankPanel onImportDone={handleImportDone} />
      <SnapTradePanel onImportDone={handleImportDone} />
      <WalletPanel onImportDone={handleImportDone} />
    </div>
  )
}
