import { useAccount, useWriteContract, useWaitForTransactionReceipt, useReadContract, useSignMessage } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Loader2, User, ExternalLink, Trash2, CheckCircle2, Copy, ArrowRightLeft, RefreshCw, UserCheck } from 'lucide-react'
import { toast } from 'sonner'
import { useState, useEffect, useMemo } from 'react'
import { isAddress } from 'viem'
import { ARCY_REGISTRY, ACTIVE_CHAIN_ID, ACTIVE_CHAIN_NAME } from '@/contracts'
import { useEnsureActiveChain } from '@/chain-switch'
import { buildTxExplorerUrl } from '@/onchain-facts'
import {
  deriveStealthKeysFromSignature,
  stealthKeyDerivationMessage,
  stealthMetaVersion,
  CURRENT_META_VERSION,
  META_VERSION_LEGACY,
} from '@/stealth'

const glass = {
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

export default function AccountView() {
  const { address, chainId, isConnected } = useAccount()
  const ensureChain = useEnsureActiveChain()
  const { signMessageAsync } = useSignMessage()
  const [copied, setCopied] = useState(false)
  const [transferTo, setTransferTo] = useState('')
  const [acceptName, setAcceptName] = useState('')

  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID

  const { data: username, refetch: refetchUsername } = useReadContract({
    ...ARCY_REGISTRY,
    functionName: 'getUsername',
    args: address ? [address] : undefined,
    query: { enabled: !!address },
  })

  const activeUsername = typeof username === 'string' && username.length > 0 ? username : null

  const { data: meta, refetch: refetchMeta } = useReadContract({
    ...ARCY_REGISTRY,
    functionName: 'getStealthMetaAddress',
    args: activeUsername ? [activeUsername] : undefined,
    query: { enabled: !!activeUsername },
  })

  const { data: pendingOwner, error: pendingLookupError, refetch: refetchPending } = useReadContract({
    ...ARCY_REGISTRY,
    functionName: 'getPendingOwner',
    args: activeUsername ? [activeUsername] : undefined,
    query: { enabled: !!activeUsername },
  })

  const { writeContract: release, data: releaseHash, isPending: isReleasing } = useWriteContract()
  const { isLoading: isReleaseConfirming, isSuccess: isReleased } = useWaitForTransactionReceipt({ hash: releaseHash })

  const { writeContract: rotate, data: rotateHash, isPending: isRotating } = useWriteContract()
  const { isLoading: isRotateConfirming, isSuccess: isRotated } = useWaitForTransactionReceipt({ hash: rotateHash })

  const { writeContract: startTransfer, data: transferHash, isPending: isTransferring } = useWriteContract()
  const { isLoading: isTransferConfirming, isSuccess: isTransferStarted } = useWaitForTransactionReceipt({ hash: transferHash })

  const { writeContract: cancelTransfer, data: cancelHash, isPending: isCancelling } = useWriteContract()
  const { isLoading: isCancelConfirming, isSuccess: isCancelled } = useWaitForTransactionReceipt({ hash: cancelHash })

  const { writeContract: accept, data: acceptHash, isPending: isAccepting } = useWriteContract()
  const { isLoading: isAcceptConfirming, isSuccess: isAccepted } = useWaitForTransactionReceipt({ hash: acceptHash })

  const metaVersion = typeof meta === 'string' ? stealthMetaVersion(meta as `0x${string}`) : CURRENT_META_VERSION
  const pendingAddress = typeof pendingOwner === 'string'
    && pendingOwner !== '0x0000000000000000000000000000000000000000'
    ? pendingOwner
    : null
  const needsKeyUpgrade = !!activeUsername && metaVersion === META_VERSION_LEGACY

  useEffect(() => {
    if (isReleased) void refetchUsername()
  }, [isReleased, refetchUsername])

  useEffect(() => {
    if (isRotated) {
      void refetchMeta()
      toast.success('Stealth keys upgraded to the domain-separated derivation.')
    }
  }, [isRotated, refetchMeta])

  useEffect(() => {
    if (isTransferStarted) {
      void refetchPending()
      toast.success('Transfer started. The recipient must accept it.')
    }
  }, [isTransferStarted, refetchPending])

  useEffect(() => {
    if (isCancelled) {
      void refetchPending()
      toast.success('Transfer cancelled.')
    }
  }, [isCancelled, refetchPending])

  useEffect(() => {
    if (isAccepted) {
      void refetchUsername()
      toast.success('Username accepted.')
    }
  }, [isAccepted, refetchUsername])

  const shareLink = useMemo(() => {
    if (activeUsername) return `${window.location.origin}/${activeUsername}`
    return ''
  }, [activeUsername])

  const handleCopy = () => {
    void navigator.clipboard.writeText(shareLink)
    setCopied(true)
    toast.success('Link copied!')
    setTimeout(() => setCopied(false), 2000)
  }

  const handleRelease = async () => {
    if (wrongChain) {
      const switched = await ensureChain()
      if (!switched) {
        toast.error(`Could not switch to ${ACTIVE_CHAIN_NAME}. Add the network in your wallet and try again.`)
        return
      }
    }
    release({ ...ARCY_REGISTRY, functionName: 'releaseUsername' })
  }

  const handleRotate = async () => {
    if (wrongChain) {
      const switched = await ensureChain()
      if (!switched) {
        toast.error(`Could not switch to ${ACTIVE_CHAIN_NAME}. Add the network in your wallet and try again.`)
        return
      }
    }
    try {
      const sig = await signMessageAsync({
        message: stealthKeyDerivationMessage(CURRENT_META_VERSION, ACTIVE_CHAIN_ID),
      })
      const { stealthMetaAddress } = deriveStealthKeysFromSignature(sig, {
        version: CURRENT_META_VERSION,
        chainId: ACTIVE_CHAIN_ID,
      })
      rotate({ ...ARCY_REGISTRY, functionName: 'updateStealthMetaAddress', args: [stealthMetaAddress] })
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('rejected') && !msg.includes('denied')) toast.error('Key upgrade failed.')
    }
  }

  const handleTransfer = async () => {
    if (wrongChain) {
      const switched = await ensureChain()
      if (!switched) {
        toast.error(`Could not switch to ${ACTIVE_CHAIN_NAME}. Add the network in your wallet and try again.`)
        return
      }
    }
    if (!isAddress(transferTo)) { toast.error('Enter a valid wallet address.'); return }
    startTransfer({ ...ARCY_REGISTRY, functionName: 'transferUsername', args: [transferTo] })
  }

  const handleCancelTransfer = async () => {
    if (wrongChain) {
      const switched = await ensureChain()
      if (!switched) {
        toast.error(`Could not switch to ${ACTIVE_CHAIN_NAME}. Add the network in your wallet and try again.`)
        return
      }
    }
    cancelTransfer({ ...ARCY_REGISTRY, functionName: 'cancelUsernameTransfer' })
  }

  const handleAccept = async () => {
    if (wrongChain) {
      const switched = await ensureChain()
      if (!switched) {
        toast.error(`Could not switch to ${ACTIVE_CHAIN_NAME}. Add the network in your wallet and try again.`)
        return
      }
    }
    if (!/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/.test(acceptName)) {
      toast.error('Enter a valid username.')
      return
    }
    accept({ ...ARCY_REGISTRY, functionName: 'acceptUsername', args: [acceptName] })
  }

  const releaseUrl = releaseHash ? buildTxExplorerUrl(ACTIVE_CHAIN_ID, releaseHash) : null

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

  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-2xl p-4" style={glass.inner}>
        <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>Connected wallet</p>
        <p className="text-xs font-mono break-all" style={{ color: 'var(--ink)' }}>{address}</p>
      </div>

      {activeUsername ? (
        <>
          <div className="rounded-2xl p-4 flex flex-col gap-3" style={glass.inner}>
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>Your username</p>
              <p className="text-2xl font-bold display mt-1" style={{ color: 'var(--ink)' }}>@{activeUsername}</p>
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

          <div className="rounded-2xl p-4 flex flex-col gap-3" style={glass.inner}>
            <div className="flex items-center gap-2">
              <RefreshCw className="size-4" style={{ color: 'var(--ink)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Stealth keys</p>
            </div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              {needsKeyUpgrade
                ? 'Your keys use the legacy derivation. Upgrade to the domain-separated version. Payments sent before the upgrade use your old keys and will not appear in a standard scan.'
                : 'Your keys use the current derivation.'}
            </p>
            {needsKeyUpgrade && (
              <button
                disabled={isRotating || isRotateConfirming}
                onClick={() => void handleRotate()}
                className="w-full rounded-xl py-2 text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--ink)' }}
              >
                {isRotating || isRotateConfirming
                  ? <><Loader2 className="size-3.5 animate-spin" />Upgrading...</>
                  : <><RefreshCw className="size-3.5" />Upgrade stealth keys</>}
              </button>
            )}
          </div>

          <div className="rounded-2xl p-4 flex flex-col gap-3" style={glass.inner}>
            <div className="flex items-center gap-2">
              <ArrowRightLeft className="size-4" style={{ color: 'var(--ink)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Transfer username</p>
            </div>
            {pendingLookupError ? (
              <p className="text-xs" style={{ color: 'var(--danger)' }}>
                Username transfers need the updated registry deployment. Redeploy the contracts to enable them.
              </p>
            ) : pendingAddress ? (
              <>
                <p className="text-xs" style={{ color: 'var(--muted)' }}>
                  Pending transfer to <span className="font-mono break-all">{pendingAddress}</span>. They must accept it from their wallet.
                </p>
                <button
                  disabled={isCancelling || isCancelConfirming}
                  onClick={() => void handleCancelTransfer()}
                  className="w-full rounded-xl py-2 text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)' }}
                >
                  {isCancelling || isCancelConfirming
                    ? <><Loader2 className="size-3.5 animate-spin" />Cancelling...</>
                    : 'Cancel transfer'}
                </button>
              </>
            ) : (
              <>
                <input
                  value={transferTo}
                  onChange={e => setTransferTo(e.target.value.trim())}
                  placeholder="0x recipient address"
                  className="w-full rounded-xl px-3 py-2 text-xs font-mono outline-none"
                  style={{ background: 'rgba(18,45,69,0.04)', border: '1px solid rgba(18,45,69,0.08)', color: 'var(--ink)' }}
                />
                <button
                  disabled={isTransferring || isTransferConfirming || transferTo.length === 0}
                  onClick={() => void handleTransfer()}
                  className="w-full rounded-xl py-2 text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
                  style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--ink)' }}
                >
                  {isTransferring || isTransferConfirming
                    ? <><Loader2 className="size-3.5 animate-spin" />Starting transfer...</>
                    : <><ArrowRightLeft className="size-3.5" />Start transfer</>}
                </button>
              </>
            )}
          </div>

          {!isReleased && (
            <button
              disabled={isReleasing || isReleaseConfirming}
              onClick={() => void handleRelease()}
              className="w-full rounded-2xl py-3 text-sm font-semibold transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: 'rgba(186,43,76,0.08)', color: 'var(--danger)', border: '1px solid rgba(186,43,76,0.16)' }}
            >
              {wrongChain ? `Switch to ${ACTIVE_CHAIN_NAME}`
                : isReleasing ? <><Loader2 className="size-4 animate-spin" />Confirm in wallet...</>
                : isReleaseConfirming ? <><Loader2 className="size-4 animate-spin" />Releasing...</>
                : <><Trash2 className="size-4" />Release username</>}
            </button>
          )}

          {isReleased && releaseUrl && (
            <div className="rounded-2xl p-4 flex flex-col gap-2" style={glass.inner}>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="size-4" style={{ color: 'var(--success)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--success)' }}>Username released</span>
              </div>
              <a href={releaseUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
                View transaction <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </>
      ) : (
        <>
          <div className="rounded-2xl p-4 text-center" style={glass.inner}>
            <p className="text-sm" style={{ color: 'var(--muted)' }}>No username registered.</p>
            <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>Set one up from the Register tab, or accept a transferred username below.</p>
          </div>

          <div className="rounded-2xl p-4 flex flex-col gap-3" style={glass.inner}>
            <div className="flex items-center gap-2">
              <UserCheck className="size-4" style={{ color: 'var(--ink)' }} />
              <p className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Accept a transferred username</p>
            </div>
            <input
              value={acceptName}
              onChange={e => setAcceptName(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))}
              placeholder="username"
              maxLength={32}
              className="w-full rounded-xl px-3 py-2 text-xs font-semibold outline-none"
              style={{ background: 'rgba(18,45,69,0.04)', border: '1px solid rgba(18,45,69,0.08)', color: 'var(--ink)' }}
            />
            <button
              disabled={isAccepting || isAcceptConfirming || acceptName.length === 0}
              onClick={() => void handleAccept()}
              className="w-full rounded-xl py-2 text-xs font-semibold disabled:opacity-40 flex items-center justify-center gap-2"
              style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--ink)' }}
            >
              {isAccepting || isAcceptConfirming
                ? <><Loader2 className="size-3.5 animate-spin" />Accepting...</>
                : <><UserCheck className="size-3.5" />Accept username</>}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
