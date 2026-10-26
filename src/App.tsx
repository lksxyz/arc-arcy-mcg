import { useEffect, useState } from 'react'
import { useAccount } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { ScanSearch, User, ArrowRight, Lock, Shield, ChevronLeft } from 'lucide-react'
import { TokenUSDC } from '@web3icons/react'
import PayView from '@/components/PayView'
import RegisterView from '@/components/RegisterView'
import ScanView from '@/components/ScanView'
import AccountView from '@/components/AccountView'
import { useReadContract } from 'wagmi'
import { ARCY_REGISTRY, ACTIVE_CHAIN_ID, IS_MAINNET_BUILD } from '@/contracts'

type Route =
  | { page: 'pay'; username: string }
  | { page: 'app' }
  | { page: 'app/setup' }
  | { page: 'app/claim' }
  | { page: 'app/account' }
  | { page: 'home' }

function parsePath(path: string): Route {
  if (path === '/app/setup')   return { page: 'app/setup' }
  if (path === '/app/claim')   return { page: 'app/claim' }
  if (path === '/app/account') return { page: 'app/account' }
  if (path === '/app' || path === '/app/') return { page: 'app' }
  const m = path.match(/^\/([a-z0-9-]{1,32})$/)
  if (m) return { page: 'pay', username: m[1] }
  return { page: 'home' }
}

function go(path: string) {
  window.history.pushState(null, '', path)
  window.dispatchEvent(new PopStateEvent('popstate'))
}

const spectral = 'linear-gradient(90deg, #5fbeff, #af8ff4, #f05c6b, #ffcd83, #7ef1b3)'

const glass = {
  card: {
    background: 'rgba(255,255,255,0.68)',
    backdropFilter: 'blur(24px) saturate(180%)',
    WebkitBackdropFilter: 'blur(24px) saturate(180%)',
    border: '1px solid rgba(255,255,255,0.72)',
    boxShadow: '0 8px 32px rgba(18,45,69,0.08), inset 0 1px 0 rgba(255,255,255,0.55)',
  } as React.CSSProperties,
}

function Blobs() {
  return (
    <div className="fixed inset-0 pointer-events-none overflow-hidden" aria-hidden>
      <div style={{ position:'absolute', top:'5%',  left:'3%',  width:380, height:380, borderRadius:'50%', background:'radial-gradient(circle, rgba(133,177,237,0.22) 0%, transparent 70%)', filter:'blur(72px)' }} />
      <div style={{ position:'absolute', bottom:'8%', right:'4%', width:300, height:300, borderRadius:'50%', background:'radial-gradient(circle, rgba(255,205,131,0.20) 0%, transparent 70%)', filter:'blur(64px)' }} />
      <div style={{ position:'absolute', top:'42%', right:'14%', width:200, height:200, borderRadius:'50%', background:'radial-gradient(circle, rgba(175,143,244,0.14) 0%, transparent 70%)', filter:'blur(48px)' }} />
    </div>
  )
}

function Landing() {
  return (
    <div className="relative z-10 mx-auto max-w-md px-4 pb-12 pt-8">
      <header className="mb-8 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TokenUSDC variant="branded" size={26} />
          <span className="display text-2xl font-bold" style={{ color:'var(--ink)', letterSpacing:'-0.03em' }}>arcy.me</span>
        </div>
        <button
          onClick={() => go('/app')}
          className="flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold transition-all hover:scale-[1.02] active:scale-[0.98]"
          style={{ background:'var(--accent)', color:'white' }}
        >
          Open app
        </button>
      </header>

      <section className="rounded-3xl p-6 mb-6" style={glass.card}>
        <div className="h-1 w-14 rounded-full mb-5" style={{ background: spectral }} />
        <div className="flex items-center gap-2 mb-3">
          <div className="rounded-full p-1.5" style={{ background:'rgba(18,45,69,0.07)' }}>
            <Lock className="size-3.5" style={{ color:'var(--accent)' }} />
          </div>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color:'var(--muted)', letterSpacing:'0.08em' }}>Private payments on Arc</span>
        </div>
        <h1 className="display text-3xl font-bold text-balance" style={{ color:'var(--ink)', letterSpacing:'-0.03em' }}>
          Pay anyone.<br />Stay private.
        </h1>
        <p className="text-sm mt-3 text-pretty" style={{ color:'var(--muted)', lineHeight:1.6 }}>
          Share your username, never your wallet. Each payment lands at a one-time stealth address — only you can detect and claim it.
        </p>
        <div className="mt-4 flex gap-2 flex-wrap">
          {['ERC-5564 stealth', 'Onchain usernames', 'USDC · Arc Testnet'].map(t => (
            <span key={t} className="rounded-full px-2.5 py-1 text-xs font-medium" style={{ background:'rgba(18,45,69,0.06)', color:'var(--ink-2)' }}>{t}</span>
          ))}
        </div>
      </section>

      <div className="flex flex-col gap-3">
        {[
          { icon: <Shield className="size-5" style={{ color:'var(--accent)' }} />, title:'Get your private link', desc:'Register a username. Share arcy.me/you with anyone.', action: () => go('/app') },
          { icon: <ScanSearch className="size-5" style={{ color:'var(--accent)' }} />, title:'Claim incoming payments', desc:'Scan for stealth payments and sweep them to your wallet.', action: () => go('/app/claim') },
        ].map(f => (
          <button key={f.title} onClick={f.action}
            className="rounded-2xl p-4 text-left flex items-center gap-4 transition-all hover:scale-[1.01] active:scale-[0.99]"
            style={glass.card}
          >
            <div className="rounded-xl p-2.5 shrink-0" style={{ background:'rgba(18,45,69,0.06)' }}>{f.icon}</div>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold" style={{ color:'var(--ink)' }}>{f.title}</div>
              <div className="text-xs mt-0.5 text-pretty" style={{ color:'var(--muted)' }}>{f.desc}</div>
            </div>
            <ArrowRight className="size-4 shrink-0" style={{ color:'var(--subtle)' }} />
          </button>
        ))}
      </div>

      <p className="text-center text-xs mt-8" style={{ color:'var(--subtle)' }}>
        ERC-5564 stealth addresses · {IS_MAINNET_BUILD ? 'Arc Mainnet' : 'Arc Testnet'}
      </p>
      <p className="text-center text-xs mt-2" style={{ color:'var(--subtle)' }}>
        Experimental, unaudited software. Use small amounts.
      </p>
    </div>
  )
}

function PublicPayPage({ username }: { username: string }) {
  return (
    <div className="relative z-10 mx-auto max-w-md px-4 pb-12 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <button onClick={() => go('/')}
          className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold transition-all hover:scale-[1.02]"
          style={{ background:'rgba(18,45,69,0.06)', color:'var(--muted)' }}
        >
          <ChevronLeft className="size-3.5" /> arcy.me
        </button>
        <ConnectKitButton />
      </header>

      <div className="rounded-3xl p-5" style={glass.card}>
        <div className="flex items-center gap-2 mb-5">
          <div className="rounded-full p-2" style={{ background:'rgba(18,45,69,0.06)' }}>
            <User className="size-5" style={{ color:'var(--ink)' }} />
          </div>
          <div>
            <p className="text-xs" style={{ color:'var(--muted)' }}>Paying</p>
            <p className="text-base font-bold display" style={{ color:'var(--ink)' }}>@{username}</p>
          </div>
        </div>
        <PayView defaultUsername={username} />
      </div>

      <p className="text-center text-xs mt-6" style={{ color:'var(--subtle)' }}>
        Stealth payment powered by arcy.me · ERC-5564
      </p>
    </div>
  )
}

type AppTab = 'claim' | 'account'

function AppShell() {
  const { address, isConnected, isConnecting } = useAccount()
  const [activeTab, setActiveTab] = useState<AppTab>(() => {
    return window.location.pathname === '/app/claim' ? 'claim' : 'account'
  })

  const { data: username, isLoading: usernameLoading } = useReadContract({
    ...ARCY_REGISTRY,
    functionName: 'getUsername',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
    chainId: ACTIVE_CHAIN_ID,
  })

  useEffect(() => {
    const target = activeTab === 'claim' ? '/app/claim' : '/app/account'
    if (window.location.pathname !== target) go(target)
  }, [activeTab])

  if (!isConnected && !isConnecting) {
    return (
      <div className="relative z-10 mx-auto max-w-md px-4 pb-12 pt-8">
        <header className="mb-6 flex items-center justify-between">
          <button onClick={() => go('/')}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
            style={{ background:'rgba(18,45,69,0.06)', color:'var(--muted)' }}
          >
            <ChevronLeft className="size-3.5" /> arcy.me
          </button>
        </header>
        <div className="rounded-3xl p-8 flex flex-col items-center gap-5 text-center" style={glass.card}>
          <div className="rounded-full p-4" style={{ background:'rgba(18,45,69,0.06)' }}>
            <Lock className="size-8" style={{ color:'var(--ink)' }} />
          </div>
          <div>
            <p className="text-lg font-bold display" style={{ color:'var(--ink)' }}>Connect your wallet</p>
            <p className="text-sm mt-1.5" style={{ color:'var(--muted)' }}>You need a wallet to use the app.</p>
          </div>
          <ConnectKitButton />
        </div>
      </div>
    )
  }

  if (usernameLoading) {
    return (
      <div className="relative z-10 mx-auto max-w-md px-4 pb-12 pt-8 flex items-center justify-center min-h-dvh">
        <div className="w-8 h-8 rounded-full border-2 border-t-transparent animate-spin" style={{ borderColor:'var(--accent)', borderTopColor:'transparent' }} />
      </div>
    )
  }

  const hasUsername = typeof username === 'string' && username.length > 0

  if (!hasUsername) {
    return (
      <div className="relative z-10 mx-auto max-w-md px-4 pb-12 pt-8">
        <header className="mb-6 flex items-center justify-between">
          <button onClick={() => go('/')}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
            style={{ background:'rgba(18,45,69,0.06)', color:'var(--muted)' }}
          >
            <ChevronLeft className="size-3.5" /> arcy.me
          </button>
          <ConnectKitButton />
        </header>
        <div className="mb-4 px-1">
          <p className="display text-xl font-bold" style={{ color:'var(--ink)' }}>Claim your username</p>
          <p className="text-sm mt-1" style={{ color:'var(--muted)' }}>Pick a username to receive private payments.</p>
        </div>
        <div className="rounded-3xl p-5" style={glass.card}>
          <RegisterView />
        </div>
      </div>
    )
  }

  const tabs: { id: AppTab; label: string; icon: React.ReactNode }[] = [
    { id: 'claim',   label: 'Claim',   icon: <ScanSearch className="size-4" /> },
    { id: 'account', label: 'Account', icon: <User className="size-4" /> },
  ]

  return (
    <div className="relative z-10 mx-auto max-w-md px-4 pb-12 pt-8">
      <header className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={() => go('/')}
            className="flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-semibold"
            style={{ background:'rgba(18,45,69,0.06)', color:'var(--muted)' }}
          >
            <ChevronLeft className="size-3.5" /> arcy.me
          </button>
          <span className="display text-base font-bold" style={{ color:'var(--ink)' }}>@{username}</span>
        </div>
        <ConnectKitButton />
      </header>

      <div className="flex rounded-2xl p-1 mb-4 gap-1"
        style={{ background:'rgba(255,255,255,0.50)', backdropFilter:'blur(16px)', WebkitBackdropFilter:'blur(16px)', border:'1px solid rgba(255,255,255,0.60)' }}
      >
        {tabs.map(t => (
          <button key={t.id} onClick={() => setActiveTab(t.id)}
            className="flex-1 flex items-center justify-center gap-1.5 rounded-xl py-2 text-xs font-semibold transition-all"
            style={{ background: activeTab === t.id ? 'var(--accent)' : 'transparent', color: activeTab === t.id ? 'white' : 'var(--muted)' }}
          >
            {t.icon}{t.label}
          </button>
        ))}
      </div>

      <div className="rounded-3xl p-5" style={glass.card}>
        {activeTab === 'claim'   && <ScanView />}
        {activeTab === 'account' && <AccountView />}
      </div>
    </div>
  )
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parsePath(window.location.pathname))

  useEffect(() => {
    const handle = () => setRoute(parsePath(window.location.pathname))
    window.addEventListener('popstate', handle)
    return () => window.removeEventListener('popstate', handle)
  }, [])

  return (
    <div className="min-h-dvh" style={{ background:'linear-gradient(180deg, #f9f9fc 0%, #fffcf7 52%, #fbf7f2 100%)' }}>
      <Blobs />
      {route.page === 'home'        && <Landing />}
      {route.page === 'pay'         && <PublicPayPage username={route.username} />}
      {(route.page === 'app' || route.page === 'app/setup' || route.page === 'app/claim' || route.page === 'app/account') && <AppShell />}
    </div>
  )
}
