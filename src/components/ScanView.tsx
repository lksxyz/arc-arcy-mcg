import { useState, useCallback } from 'react'
import { useAccount, usePublicClient, useSignMessage } from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Loader2, ScanSearch, Wallet, ExternalLink, CheckCircle2, KeyRound } from 'lucide-react'
import { erc20Abi, formatUnits } from 'viem'
import { toast } from 'sonner'
import { ARCY_ANNOUNCER, ACTIVE_CHAIN_ID, USDC_ADDRESS } from '@/contracts'
import {
  deriveStealthKeysFromSignature,
  STEALTH_KEY_DERIVATION_MESSAGE,
  checkStealthAddress,
  computeStealthKey,
  padPrivKey,
  getKeyPair,
} from '@/stealth'
import { buildTxExplorerUrl } from '@/onchain-facts'

const glass = {
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

interface ClaimablePayment {
  stealthAddress: `0x${string}`
  ephemeralPubKey: `0x${string}`
  viewTag: `0x${string}`
  txHash: `0x${string}`
  blockNumber: bigint
  stealthPrivKey: bigint
  balance?: bigint
}

export default function ScanView() {
  const { isConnected } = useAccount()
  const publicClient = usePublicClient({ chainId: ACTIVE_CHAIN_ID })
  const { signMessageAsync, isPending: isSigning } = useSignMessage()

  const [isScanning, setIsScanning] = useState(false)
  const [payments, setPayments] = useState<ClaimablePayment[]>([])
  const [scanned, setScanned] = useState(false)
  const [totalChecked, setTotalChecked] = useState(0)
  const [claimStep, setClaimStep] = useState<Record<string, 'idle' | 'copied'>>({})

  const scan = useCallback(async () => {
    if (!publicClient) return
    setIsScanning(true)
    setPayments([])
    setScanned(false)

    try {
      // 1. Sign to derive stealth keys
      const sig = await signMessageAsync({ message: STEALTH_KEY_DERIVATION_MESSAGE })
      const { spendingPrivKey, viewingPrivKey, spendingPubKey } = deriveStealthKeysFromSignature(sig)

      const { privKey: viewPrivKey } = getKeyPair(viewingPrivKey)
      const { privKey: spendPrivKey } = getKeyPair(spendingPrivKey)

      // 2. Scan Announcement events in 2,000-block chunks
      const CHUNK = 2000n
      const currentBlock = await publicClient.getBlockNumber()
      const fromBlock = currentBlock > 10000n ? currentBlock - 10000n : 0n

      const announcementEvent = {
        type: 'event' as const,
        name: 'Announcement',
        inputs: [
          { name: 'schemeId',       type: 'uint256', indexed: true },
          { name: 'stealthAddress', type: 'address', indexed: true },
          { name: 'caller',         type: 'address', indexed: true },
          { name: 'ephemeralPubKey',type: 'bytes',   indexed: false },
          { name: 'viewTag',        type: 'bytes1',  indexed: false },
        ],
      } as const

      // Fetch with retry + backoff for rate-limit errors
      interface AnnouncementLog {
        args: { stealthAddress: `0x${string}`; ephemeralPubKey: `0x${string}`; viewTag: `0x${string}` }
        transactionHash: `0x${string}` | null
        blockNumber: bigint | null
      }

      const fetchChunk = async (start: bigint, end: bigint, attempt = 0): Promise<AnnouncementLog[]> => {
        try {
          return (await publicClient.getLogs({
            address: ARCY_ANNOUNCER.address,
            event: announcementEvent,
            args: { schemeId: 1n },
            fromBlock: start,
            toBlock: end,
          })) as AnnouncementLog[]
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e)
          if (msg.includes('rate limit') && attempt < 4) {
            await new Promise(r => setTimeout(r, 400 * (attempt + 1)))
            return fetchChunk(start, end, attempt + 1)
          }
          throw e
        }
      }

      const logs: AnnouncementLog[] = []
      for (let start = fromBlock; start <= currentBlock; start += CHUNK) {
        const end = start + CHUNK - 1n < currentBlock ? start + CHUNK - 1n : currentBlock
        const chunk = await fetchChunk(start, end)
        logs.push(...chunk)
      }

      // 3. Check each log against derived keys
      const mine: ClaimablePayment[] = []

      for (const log of logs) {
        const stealthAddress = log.args.stealthAddress
        const ephemeralPubKey = log.args.ephemeralPubKey
        const viewTag = log.args.viewTag
        if (!stealthAddress || !ephemeralPubKey || !viewTag) continue

        const isMine = checkStealthAddress({
          stealthAddress,
          ephemeralPubKeyHex: ephemeralPubKey,
          viewTagByte: viewTag,
          viewingPrivKey: viewPrivKey,
          spendingPubKey,
        })

        if (isMine) {
          const stealthPrivKey = computeStealthKey({
            ephemeralPubKeyHex: ephemeralPubKey,
            viewingPrivKey: viewPrivKey,
            spendingPrivKey: spendPrivKey,
          })

          let balance: bigint | undefined
          try {
            balance = await publicClient.readContract({
              address: USDC_ADDRESS,
              abi: erc20Abi,
              functionName: 'balanceOf',
              args: [stealthAddress],
            })
          } catch { /* ignore */ }

          mine.push({
            stealthAddress,
            ephemeralPubKey,
            viewTag,
            txHash: (log.transactionHash ?? '0x'),
            blockNumber: log.blockNumber ?? 0n,
            stealthPrivKey,
            balance,
          })
        }
      }

      setPayments(mine)
      setTotalChecked(logs.length)
      setScanned(true)
      if (mine.length === 0) toast.info(`Scanned ${logs.length} announcement${logs.length !== 1 ? 's' : ''} — no matches found.`)
      else toast.success(`Found ${mine.length} payment${mine.length !== 1 ? 's' : ''}!`)
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (!msg.includes('rejected') && !msg.includes('denied')) {
        toast.error('Scan failed. Please try again.')
        console.error(err)
      }
    } finally {
      setIsScanning(false)
    }
  }, [publicClient, signMessageAsync])

  const copyPrivKey = (payment: ClaimablePayment) => {
    const privKeyHex = padPrivKey(payment.stealthPrivKey)
    void navigator.clipboard.writeText(privKeyHex)
    setClaimStep(prev => ({ ...prev, [payment.stealthAddress]: 'copied' }))
    toast.success('Stealth private key copied. Import it into your wallet to claim funds.')
  }

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="rounded-full p-4" style={{ background: 'rgba(18,45,69,0.06)' }}>
          <KeyRound className="size-8" style={{ color: 'var(--ink)' }} />
        </div>
        <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
          Connect your wallet to scan for incoming payments.
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Intro card */}
      {!scanned && (
        <div className="rounded-2xl p-4 flex items-start gap-3" style={glass.inner}>
          <div className="rounded-lg p-2 shrink-0" style={{ background: 'rgba(18,45,69,0.08)' }}>
            <KeyRound className="size-4" style={{ color: 'var(--ink)' }} />
          </div>
          <div>
            <div className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>Sign to scan</div>
            <p className="text-xs mt-1" style={{ color: 'var(--muted)' }}>
              Your wallet signs a message to re-derive your stealth keys. The signature stays in your browser — nothing is sent onchain.
            </p>
          </div>
        </div>
      )}

      {/* Scan button */}
      <button
        disabled={isScanning || isSigning}
        onClick={() => void scan()}
        className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40 flex items-center justify-center gap-2"
        style={{ background: 'var(--accent)' }}
      >
        {isSigning
          ? <><Loader2 className="size-4 animate-spin" />Sign in wallet...</>
          : isScanning
          ? <><Loader2 className="size-4 animate-spin" />Scanning...</>
          : <><ScanSearch className="size-4" />{scanned ? 'Scan again' : 'Scan for payments'}</>}
      </button>

      {/* Results */}
      {scanned && !isScanning && (
        payments.length === 0 ? (
          <div className="rounded-2xl p-4 flex flex-col gap-2" style={glass.inner}>
            <p className="text-sm font-medium" style={{ color: 'var(--muted)' }}>No payments found.</p>
            <p className="text-xs" style={{ color: 'var(--subtle)' }}>
              Checked {totalChecked} announcement{totalChecked !== 1 ? 's' : ''} in the last 10,000 blocks.
            </p>
            {totalChecked > 0 && (
              <p className="text-xs mt-1 rounded-xl px-3 py-2" style={{ background: 'rgba(186,43,76,0.06)', color: 'var(--danger)', border: '1px solid rgba(186,43,76,0.12)' }}>
                Announcements were found but none matched your keys. If you registered before today, go to Account, release your username, and re-register — your stealth keys will be updated to match your wallet.
              </p>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            <p className="text-xs font-semibold" style={{ color: 'var(--muted)' }}>
              Found {payments.length} payment{payments.length !== 1 ? 's' : ''}
            </p>
            {payments.map(payment => (
              <div key={payment.stealthAddress} className="rounded-2xl p-4 flex flex-col gap-3" style={glass.inner}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Wallet className="size-4" style={{ color: 'var(--ink)' }} />
                    <span className="text-sm font-semibold" style={{ color: 'var(--ink)' }}>
                      {payment.balance !== undefined ? `${formatUnits(payment.balance, 6)} USDC` : '? USDC'}
                    </span>
                  </div>
                  <a
                    href={buildTxExplorerUrl(ACTIVE_CHAIN_ID, payment.txHash)}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs"
                    style={{ color: 'var(--accent-hover)' }}
                  >
                    View <ExternalLink className="size-3" />
                  </a>
                </div>
                <div>
                  <p className="text-xs" style={{ color: 'var(--muted)' }}>Stealth address:</p>
                  <p className="text-xs font-mono mt-0.5 break-all" style={{ color: 'var(--ink)' }}>
                    {payment.stealthAddress}
                  </p>
                </div>
                <button
                  onClick={() => copyPrivKey(payment)}
                  className="w-full rounded-xl py-2 text-xs font-semibold transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: claimStep[payment.stealthAddress] === 'copied'
                      ? 'rgba(26,128,71,0.10)' : 'rgba(18,45,69,0.08)',
                    color: claimStep[payment.stealthAddress] === 'copied'
                      ? 'var(--success)' : 'var(--ink)',
                  }}
                >
                  {claimStep[payment.stealthAddress] === 'copied'
                    ? <span className="flex items-center justify-center gap-1.5"><CheckCircle2 className="size-3" />Private key copied</span>
                    : 'Copy stealth private key to claim'}
                </button>
                {claimStep[payment.stealthAddress] === 'copied' && (
                  <p className="text-xs" style={{ color: 'var(--subtle)' }}>
                    Import the private key into MetaMask or any EVM wallet to sweep the funds.
                  </p>
                )}
              </div>
            ))}
          </div>
        )
      )}
    </div>
  )
}
