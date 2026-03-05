import { createWeb3Modal, defaultWagmiConfig } from '@web3modal/wagmi/react'
import { mainnet, polygon, arbitrum, bsc } from 'viem/chains'

export const projectId = import.meta.env.VITE_WALLETCONNECT_PROJECT_ID || ''

const metadata = {
  name: 'SafeSeven',
  description: 'Unified Wealth Wellness Hub — NTU FinTech Hackathon 2026',
  url: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:5173',
  icons: [],
}

const chains = [mainnet, polygon, arbitrum, bsc]

export const wagmiConfig = defaultWagmiConfig({
  chains,
  projectId,
  metadata,
  enableWalletConnect: true,
  enableInjected: true,
  enableEIP6963: true,
  enableCoinbase: true,
})

createWeb3Modal({
  wagmiConfig,
  projectId,
  chains,
  themeMode: 'dark',
  themeVariables: {
    '--w3m-accent': '#2f7cf6',
    '--w3m-border-radius-master': '4px',
    '--w3m-font-family': 'Inter, sans-serif',
  },
})
