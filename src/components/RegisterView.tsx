import { useState, useEffect } from 'react'
import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain, useSignMessage } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Loader2, User, Shield, ExternalLink, CheckCircle2, XCircle } from 'lucide-react'
import { toast } from 'sonner'
import { ARCY_REGISTRY, ACTIVE_CHAIN_ID } from '@/contracts'
import { deriveStealthKeysFromSignature, STEALTH_KEY_DERIVATION_MESSAGE } from '@/stealth'
import { buildTxExplorerUrl } from '@/onchain-facts'

const glass = {
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

export default function RegisterView() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const { writeContract, data: hash, isPending, error: writeError } = useWriteContract()
  const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash })
  const { signMessageAsync, isPending: isSigning } = useSignMessage()

  const [username, setUsername] = useState('')
  const [debouncedUsername, setDebouncedUsername] = useState('')
  const [stealthMetaAddress, setStealthMetaAddress] = useState<`0x${string}` | null>(null)

  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID

  // Debounce username 500ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedUsername(username), 500)
    return () => clearTimeout(t)
  }, [username])

  // Existing username for this wallet
  const { data: existingUsername } = useReadContract({
    ...ARCY_REGISTRY,
    functionName: 'getUsername',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const usernameValid = /^[a-z0-9-]{1,32}$/.test(username)

  // Availability check (debounced)
  const { data: isAvailable, isLoading: isCheckingAvailability } = useReadContract({
    ...ARCY_REGISTRY,
    functionName: 'isUsernameAvailable',
    args: [debouncedUsername],
    query: { enabled: /^[a-z0-9-]{1,32}$/.test(debouncedUsername) },
  })

  const canRegister = usernameValid && isAvailable === true && debouncedUsername === username

  const handleRegister = async () => {
    if (!canRegister) return
    if (wrongChain) { switchChain({ chainId: ACTIVE_CHAIN_ID }); return }

    try {
      // 1. Sign the deterministic message to derive stealth keys
      const sig = await signMessageAsync({ message: STEALTH_KEY_DERIVATION_MESSAGE })
      const { stealthMetaAddress: meta } = deriveStealthKeysFromSignature(sig)
      setStealthMetaAddress(meta)

      // 2. Register onchain
      writeContract({
        ...ARCY_REGISTRY,
        functionName: 'registerUsername',
        args: [username, meta],
      })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('rejected') && !msg.includes('denied')) {
        toast.error('Something went wrong. Please try again.')
      }
    }
  }

  const txUrl = hash ? buildTxExplorerUrl(ACTIVE_CHAIN_ID, hash) : null
  const baseUrl = `${window.location.origin}/`

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="rounded-full p-4" style={{ background: 'rgba(18,45,69,0.06)' }}>
          <User className="size-8" style={{ color: 'var(--ink)' }} />
        </div>
        <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
          Connect your wallet to claim a username.
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  if (existingUsername && typeof existingUsername === 'string' && existingUsername.length > 0) {
    return (
      <div className="flex flex-col gap-3">
        <div className="rounded-2xl p-4 flex items-center gap-3" style={glass.inner}>
          <CheckCircle2 className="size-5 shrink-0" style={{ color: 'var(--success)' }} />
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Already registered</div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--muted)' }}>
              Your username: <span className="font-mono font-semibold">{baseUrl}{existingUsername}</span>
            </div>
          </div>
        </div>
        <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
          Release your username in Account to register a new one.
        </p>
      </div>
    )
  }

  const isBusy = isSigning || isPending || isConfirming

  return (
    <div className="flex flex-col gap-4">
      {/* Username input */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
          Choose username
        </label>
        <div className="flex items-center rounded-2xl px-4 py-3 gap-2" style={glass.inner}>
          <span className="text-sm font-medium shrink-0" style={{ color: 'var(--subtle)' }}>@</span>
          <input
            value={username}
            onChange={e => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
            placeholder="your-name"
            maxLength={32}
            className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-normal min-w-0"
            style={{ color: 'var(--ink)' }}
          />
          {usernameValid && isCheckingAvailability && (
            <Loader2 className="size-4 animate-spin shrink-0" style={{ color: 'var(--subtle)' }} />
          )}
          {usernameValid && !isCheckingAvailability && debouncedUsername === username && isAvailable === true && (
            <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--success)' }} />
          )}
          {usernameValid && !isCheckingAvailability && debouncedUsername === username && isAvailable === false && (
            <XCircle className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />
          )}
        </div>
        {username.length > 0 && !usernameValid && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>1–32 chars, lowercase letters, numbers, hyphens only.</p>
        )}
        {usernameValid && !isCheckingAvailability && debouncedUsername === username && isAvailable === false && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>That username is already taken.</p>
        )}
        {usernameValid && !isCheckingAvailability && debouncedUsername === username && isAvailable === true && (
          <p className="text-xs" style={{ color: 'var(--success)' }}>Username is available!</p>
        )}
      </div>

      {/* How it works */}
      {canRegister && (
        <div className="rounded-2xl p-4 flex items-start gap-3" style={glass.inner}>
          <div className="rounded-lg p-2 shrink-0" style={{ background: 'rgba(18,45,69,0.08)' }}>
            <Shield className="size-4" style={{ color: 'var(--ink)' }} />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Your wallet signs once</div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Your stealth keys are derived from a signature — nothing to save or import. Every time you claim payments, the same signature re-derives the same keys automatically.
            </p>
          </div>
        </div>
      )}

      {/* Register button */}
      <button
        disabled={!canRegister || isBusy}
        onClick={() => void handleRegister()}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background: 'var(--accent)' }}
      >
        {wrongChain ? 'Switch to Arc Testnet'
          : isSigning ? <><Loader2 className="size-4 animate-spin" />Sign in wallet...</>
          : isPending ? <><Loader2 className="size-4 animate-spin" />Confirm transaction...</>
          : isConfirming ? <><Loader2 className="size-4 animate-spin" />Registering...</>
          : isSuccess ? 'Registered!'
          : !canRegister ? 'Enter an available username'
          : 'Sign & register username'}
      </button>

      {writeError && (
        <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>
          {writeError.message.includes('UsernameAlreadyTaken') ? 'That username is already taken.'
            : writeError.message.includes('AddressAlreadyHasUsername') ? 'Your wallet already has a username.'
            : 'Transaction failed. Please try again.'}
        </p>
      )}

      {isSuccess && txUrl && (
        <div className="rounded-2xl p-4 flex flex-col gap-2" style={glass.inner}>
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
            <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Registered!</span>
          </div>
          <p className="text-xs" style={{ color: 'var(--muted)' }}>
            Your link: <span className="font-mono font-semibold">{baseUrl}{username}</span>
          </p>
          <a href={txUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
            View transaction <ExternalLink className="size-3" />
          </a>
        </div>
      )}

      {stealthMetaAddress && isSuccess && (
        <p className="text-xs text-center" style={{ color: 'var(--subtle)' }}>
          Your stealth keys are derived from your wallet. Connect the same wallet on any device to scan and claim payments.
        </p>
      )}
    </div>
  )
}
