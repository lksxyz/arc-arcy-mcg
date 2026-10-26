import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSwitchChain } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Loader2, User, ExternalLink, Trash2, CheckCircle2, Copy } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useEffect, useMemo } from 'react'
import { ARCY_REGISTRY, ACTIVE_CHAIN_ID } from '@/contracts'
import { buildTxExplorerUrl } from '@/onchain-facts'

const glass = {
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

export default function AccountView() {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const [copied, setCopied] = useState(false)

  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID

  const { data: username, refetch: refetchUsername } = useReadContract({
    ...ARCY_REGISTRY,
    functionName: 'getUsername',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const { writeContract: release, data: releaseHash, isPending: isReleasing } = useWriteContract()
  const { isLoading: isReleaseConfirming, isSuccess: isReleased } = useWaitForTransactionReceipt({ hash: releaseHash })

  useEffect(() => {
    if (isReleased) void refetchUsername()
  }, [isReleased, refetchUsername])

  // Build share link (derived during render, not in an effect)
  const shareLink = useMemo(() => {
    if (username && typeof username === 'string' && username.length > 0) {
      return `${window.location.origin}/${username}`
    }
    return ''
  }, [username])

  const handleCopy = () => {
    void navigator.clipboard.writeText(shareLink)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRelease = () => {
    if (wrongChain) { switchChain({ chainId: ACTIVE_CHAIN_ID }); return }
    release({ ...ARCY_REGISTRY, functionName: 'releaseUsername' })
  }

  const txUrl = releaseHash ? buildTxExplorerUrl(ACTIVE_CHAIN_ID, releaseHash) : null

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="rounded-full p-4" style={{ background: 'rgba(18,45,69,0.06)' }}>
          <User className="size-8" style={{ color: 'var(--ink)' }} />
        </div>
        <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
          Connect your wallet to manage your username.
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  const hasUsername = typeof username === 'string' && username.length > 0

  return (
    <div className="flex flex-col gap-4">
      {/* Connected wallet */}
      <div className="rounded-2xl p-4" style={glass.inner}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>Connected wallet</p>
        <p className="text-xs font-mono break-all" style={{ color: 'var(--ink)' }}>{address}</p>
      </div>

      {hasUsername ? (
        <>
          {/* Username card */}
          <div className="rounded-2xl p-4 flex flex-col gap-3" style={glass.inner}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>Your username</p>
              <p className="text-2xl font-bold display mt-1" style={{ color: 'var(--ink)' }}>@{username}</p>
            </div>

            {shareLink && (
              <div className="flex flex-col gap-1.5">
                <p className="text-xs" style={{ color: 'var(--muted)' }}>Share this link to receive payments:</p>
                <div className="flex items-center gap-2 rounded-xl px-3 py-2" style={{ background: 'rgba(18,45,69,0.04)', border: '1px solid rgba(18,45,69,0.08)' }}>
                  <span className="text-xs font-mono flex-1 truncate" style={{ color: 'var(--ink)' }}>{shareLink}</span>
                  <button onClick={handleCopy} className="shrink-0 rounded-lg p-1.5 transition-colors" style={{ background: 'rgba(18,45,69,0.08)' }}>
                    {copied ? <CheckCircle2 className="size-3.5" style={{ color: 'var(--success)' }} /> : <Copy className="size-3.5" style={{ color: 'var(--ink)' }} />}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Release */}
          {!isReleased && (
            <button
              disabled={isReleasing || isReleaseConfirming}
              onClick={handleRelease}
              className="w-full rounded-2xl py-3 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)', border: '1px solid rgba(186,43,76,0.16)' }}
            >
              {wrongChain ? 'Switch to Arc Testnet'
                : isReleasing ? <><Loader2 className="size-4 animate-spin" />Confirm in wallet...</>
                : isReleaseConfirming ? <><Loader2 className="size-4 animate-spin" />Releasing...</>
                : <><Trash2 className="size-4" />Release username</>}
            </button>
          )}

          {isReleased && txUrl && (
            <div className="rounded-2xl p-4 flex flex-col gap-2" style={glass.inner}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Username released</span>
              </div>
              <a href={txUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
                View transaction <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl p-4 text-center" style={glass.inner}>
          <p className="text-sm" style={{ color: 'var(--muted)' }}>No username registered.</p>
          <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>You will be redirected to set up your username.</p>
        </div>
      )}
    </div>
  )
}
