import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowRight, DatabaseZap, Sparkles } from 'lucide-react'
import AssetForm from '../components/AssetForm'
import { createAsset } from '../services/api.js'

export default function AddAsset() {
  const navigate = useNavigate()
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')

  async function handleCreate(payload) {
    try {
      setIsSubmitting(true)
      setSubmitError('')
      await createAsset(payload)
      navigate('/assets')
    } catch (err) {
      setSubmitError(err.message || 'Failed to create asset.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="max-w-7xl mx-auto grid grid-cols-[1.5fr_0.9fr] gap-6">
      <div className="glass-card p-6">
        <div className="mb-6">
          <p className="app-kicker">Create</p>
          <h1 className="mt-2 text-2xl font-bold text-white">Add New Asset</h1>
          <p className="mt-1 text-sm text-white/45">
            Create a new record for a manual asset or a live-priced stock or crypto position.
          </p>
        </div>

        <AssetForm
          onSubmit={handleCreate}
          submitLabel="Create Asset"
          isSubmitting={isSubmitting}
          submitError={submitError}
        />
      </div>

      <div className="space-y-4">
        <FeaturePanel
          icon={DatabaseZap}
          title="Portfolio Database"
          body="Every asset you add is stored in PostgreSQL and becomes available to the dashboard, assets inventory, and insights engine."
        />
        <FeaturePanel
          icon={Sparkles}
          title="Live Price Support"
          body="Use STOCKS or CRYPTO with a ticker and quantity to let the backend refresh the value automatically from Yahoo Finance, Alpha Vantage, and CoinGecko."
        />
        <div className="glass-card p-5">
          <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-white/40">Next</h2>
          <p className="mt-3 text-sm leading-relaxed text-white/60">
            After saving, SafeSeven will pick up the new position in the next automatic market sync, and the Assets page can still trigger an immediate refresh when needed.
          </p>
          <div className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-accent">
            Open asset inventory
            <ArrowRight className="h-4 w-4" />
          </div>
        </div>
      </div>
    </div>
  )
}

function FeaturePanel({ icon: Icon, title, body }) {
  return (
    <div className="glass-card p-5">
      <div className="flex items-center gap-3">
        <div className="rounded-xl border border-white/10 bg-white/[0.04] p-2 text-accent">
          <Icon className="h-4 w-4" />
        </div>
        <h2 className="text-base font-semibold text-white">{title}</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-white/55">{body}</p>
    </div>
  )
}
