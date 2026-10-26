import { useState } from 'react'
import {
  useAccount, useWriteContract, useWaitForTransactionReceipt,
  useReadContract, useSwitchChain, useSignTypedData, usePublicClient,
} from 'wagmi'
import { ConnectKitButton } from 'connectkit'
import { Loader2, Search, Send, ExternalLink, CheckCircle2, AlertCircle } from 'lucide-react'
import { bytesToHex, hexToBigInt, numberToHex, slice, type Hex } from 'viem'
import { toast } from 'sonner'
import { ARCY_REGISTRY, ARCY_PAY, ACTIVE_CHAIN_ID, USDC_ADDRESS, USDC_PERMIT_NAME, USDC_PERMIT_VERSION } from '@/contracts'
import { generateStealthAddress } from '@/stealth'
import { parseAmount } from '@/onchain-money'
import { buildTxExplorerUrl } from '@/onchain-facts'

const glass = {
  inner: {
    background: 'rgba(255,255,255,0.46)',
    border: '1px solid rgba(255,255,255,0.56)',
  } as React.CSSProperties,
}

interface PayViewProps {
  defaultUsername?: string
}

interface PaymentPreview {
  stealthAddress: `0x${string}`
  ephemeralPubKey: Hex
  viewTag: Hex
  amountLabel: string
  rawAmount: bigint
  username: string
}

const USERNAME_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/

function splitPermitSignature(signature: Hex): { v: number; r: Hex; s: Hex } {
  if (signature.length === 130) {
    const r = slice(signature, 0, 32)
    const yParityAndS = hexToBigInt(slice(signature, 32, 64))
    const v = Number(yParityAndS >> 255n) + 27
    const s = numberToHex(yParityAndS & ((1n << 255n) - 1n), { size: 32 })
    return { v, r, s }
  }

  const r = slice(signature, 0, 32)
  const s = slice(signature, 32, 64)
  const rawV = Number(hexToBigInt(slice(signature, 64, 65)))
  return { v: rawV < 27 ? rawV + 27 : rawV, r, s }
}

export default function PayView({ defaultUsername = '' }: PayViewProps) {
  const { address, chainId, isConnected } = useAccount()
  const { switchChain } = useSwitchChain()
  const publicClient = usePublicClient({ chainId: ACTIVE_CHAIN_ID })

  const [recipientUsername, setRecipientUsername] = useState(defaultUsername)
  const [amount, setAmount] = useState('')
  const [status, setStatus] = useState<'idle' | 'signing' | 'sending'>('idle')
  const [lastPaid, setLastPaid] = useState<{ amount: string; username: string } | null>(null)
  const [preview, setPreview] = useState<PaymentPreview | null>(null)

  const wrongChain = isConnected && chainId !== ACTIVE_CHAIN_ID

  const { data: recipientMetaAddr, isLoading: isLooking, error: lookupError } = useReadContract({
    ...ARCY_REGISTRY,
    functionName: 'getStealthMetaAddress',
    args: [recipientUsername],
    query: { enabled: USERNAME_PATTERN.test(recipientUsername) },
  })

  const { signTypedDataAsync } = useSignTypedData()

  const { writeContractAsync, data: payHash, error: payError, reset: resetPay } = useWriteContract()
  const { isLoading: isPayConfirming, isSuccess: isPaySuccess } = useWaitForTransactionReceipt({ hash: payHash })

  const parsedAmount = amount ? (() => {
    try { return parseAmount(ACTIVE_CHAIN_ID, amount) }
    catch { return null }
  })() : null

  const recipientFound = !!recipientMetaAddr && !lookupError
  const recipientNotFound = !isLooking && !!lookupError && recipientUsername.length > 0
  const readyToPay = recipientFound && !!parsedAmount && !isPaySuccess

  const isBusy = status !== 'idle' || isPayConfirming

  const preparePayment = () => {
    if (!parsedAmount || !recipientMetaAddr || !address) return
    if (wrongChain) { switchChain({ chainId: ACTIVE_CHAIN_ID }); return }

    try {
      const { stealthAddress, ephemeralPubKey, viewTag } = generateStealthAddress(
        recipientMetaAddr as `0x${string}`,
      )

      setPreview({
        stealthAddress,
        ephemeralPubKey: bytesToHex(ephemeralPubKey),
        viewTag: bytesToHex(viewTag),
        amountLabel: amount,
        rawAmount: parsedAmount.raw,
        username: recipientUsername,
      })
    } catch {
      toast.error('This username has invalid stealth keys. Ask the recipient to update them.')
    }
  }

  const handlePay = async () => {
    if (!preview || !address || !publicClient) return
    if (wrongChain) { switchChain({ chainId: ACTIVE_CHAIN_ID }); return }

    try {
      setStatus('signing')
      const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600)

      const nonce = await publicClient.readContract({
        address: USDC_ADDRESS,
        abi: [{ name: 'nonces', type: 'function', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }], outputs: [{ type: 'uint256' }] }],
        functionName: 'nonces',
        args: [address],
      })

      const permitSig = await signTypedDataAsync({
        domain: {
          name: USDC_PERMIT_NAME,
          version: USDC_PERMIT_VERSION,
          chainId: ACTIVE_CHAIN_ID,
          verifyingContract: USDC_ADDRESS,
        },
        types: {
          Permit: [
            { name: 'owner',   type: 'address' },
            { name: 'spender', type: 'address' },
            { name: 'value',   type: 'uint256' },
            { name: 'nonce',   type: 'uint256' },
            { name: 'deadline',type: 'uint256' },
          ],
        },
        primaryType: 'Permit',
        message: {
          owner:    address,
          spender:  ARCY_PAY.address,
          value:    preview.rawAmount,
          nonce:    nonce,
          deadline,
        },
      })

      const { v, r, s } = splitPermitSignature(permitSig)

      setStatus('sending')
      setLastPaid({ amount: preview.amountLabel, username: preview.username })
      await writeContractAsync({
        ...ARCY_PAY,
        functionName: 'payByUsernameWithPermit',
        args: [
          preview.username,
          preview.stealthAddress,
          preview.rawAmount,
          preview.ephemeralPubKey,
          preview.viewTag,
          deadline,
          v,
          r,
          s,
        ],
      })
      setPreview(null)
      setStatus('idle')
    } catch (err) {
      setStatus('idle')
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('rejected') || msg.includes('denied') || msg.includes('user rejected')) return
      console.error(err)
    }
  }

  const txUrl = payHash ? buildTxExplorerUrl(ACTIVE_CHAIN_ID, payHash) : null

  if (!isConnected) {
    return (
      <div className="flex flex-col items-center gap-4 py-8">
        <div className="rounded-full p-4" style={{ background: 'rgba(18,45,69,0.06)' }}>
          <Send className="size-8" style={{ color: 'var(--ink)' }} />
        </div>
        <p className="text-sm text-center" style={{ color: 'var(--muted)' }}>
          Connect your wallet to send a private USDC payment.
        </p>
        <ConnectKitButton />
      </div>
    )
  }

  if (isPaySuccess) {
    return (
      <div className="flex flex-col gap-4 items-center py-4">
        <div className="rounded-full p-5" style={{ background: 'rgba(26,128,71,0.10)' }}>
          <CheckCircle2 className="size-10" style={{ color: 'var(--success)' }} />
        </div>
        <div className="text-center">
          <div className="text-xl font-bold display" style={{ color: 'var(--ink)' }}>Payment sent</div>
          <p className="text-sm mt-1" style={{ color: 'var(--muted)' }}>
            {lastPaid?.amount} USDC sent privately to <span className="font-semibold">@{lastPaid?.username}</span>
          </p>
          <p className="text-xs mt-1" style={{ color: 'var(--subtle)' }}>
            The recipient&apos;s real wallet address was never revealed.
          </p>
        </div>
        {txUrl && (
          <a href={txUrl} target="_blank" rel="noreferrer"
            className="inline-flex items-center gap-1 text-xs" style={{ color: 'var(--accent-hover)' }}>
            View transaction <ExternalLink className="size-3" />
          </a>
        )}
        <button
          onClick={() => { setAmount(''); setRecipientUsername(''); setStatus('idle'); resetPay() }}
          className="text-sm font-semibold" style={{ color: 'var(--accent)' }}
        >
          Send another payment
        </button>
      </div>
    )
  }

  const buttonLabel = () => {
    if (wrongChain) return 'Switch to Arc Testnet'
    if (status === 'signing') return <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Sign permit in wallet...</span>
    if (status === 'sending') return <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Confirm payment in wallet...</span>
    if (isPayConfirming) return <span className="flex items-center justify-center gap-2"><Loader2 className="size-4 animate-spin" />Sending...</span>
    if (!recipientFound) return 'Enter a recipient username'
    if (!parsedAmount) return 'Enter an amount'
    return `Send ${amount} USDC privately`
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
          Pay to
        </label>
        <div className="flex items-center rounded-2xl px-4 py-3 gap-2" style={glass.inner}>
          <span className="text-sm font-medium" style={{ color: 'var(--subtle)' }}>@</span>
          <input
            value={recipientUsername}
            onChange={e => {
              setRecipientUsername(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, ''))
              setPreview(null)
            }}
            placeholder="username"
            maxLength={32}
            className="flex-1 bg-transparent text-sm font-semibold outline-none placeholder:font-normal"
            style={{ color: 'var(--ink)' }}
          />
          {isLooking && <Loader2 className="size-4 animate-spin shrink-0" style={{ color: 'var(--subtle)' }} />}
          {recipientFound && <CheckCircle2 className="size-4 shrink-0" style={{ color: 'var(--success)' }} />}
          {recipientNotFound && <AlertCircle className="size-4 shrink-0" style={{ color: 'var(--danger)' }} />}
          {!isLooking && !recipientFound && !recipientNotFound && recipientUsername.length === 0 && (
            <Search className="size-4 shrink-0" style={{ color: 'var(--subtle)' }} />
          )}
        </div>
        {recipientNotFound && (
          <p className="text-xs" style={{ color: 'var(--danger)' }}>Username not found.</p>
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>
          Amount
        </label>
        <div className="rounded-2xl px-4 py-3" style={glass.inner}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={e => {
              const v = e.target.value.replace(/[^0-9.]/g, '')
              if (v === '' || /^\d*\.?\d*$/.test(v)) {
                setAmount(v)
                setPreview(null)
              }
            }}
            placeholder="0.00"
            className="display w-full bg-transparent text-4xl font-bold tabular-nums outline-none placeholder:text-slate-300"
            style={{ color: 'var(--ink)' }}
          />
          <div className="mt-2 text-xs" style={{ color: 'var(--subtle)' }}>USDC</div>
        </div>
      </div>

      {preview && (
        <div className="rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(18,45,69,0.04)', border: '1px solid rgba(18,45,69,0.12)' }}>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--muted)', letterSpacing: '0.08em' }}>Review payment</p>
            <p className="text-sm mt-1" style={{ color: 'var(--ink)' }}>
              {preview.amountLabel} USDC to <span className="font-semibold">@{preview.username}</span>
            </p>
          </div>
          <div>
            <p className="text-xs" style={{ color: 'var(--muted)' }}>One-time stealth address that receives the funds:</p>
            <p className="text-xs font-mono mt-1 break-all" style={{ color: 'var(--ink)' }}>{preview.stealthAddress}</p>
          </div>
          <p className="text-xs" style={{ color: 'var(--danger)' }}>
            This address is generated in your browser and is not verified by the contract. If it does not match what your wallet or this page showed before, cancel.
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPreview(null)}
              className="flex-1 rounded-xl py-2 text-xs font-semibold"
              style={{ background: 'rgba(18,45,69,0.08)', color: 'var(--ink)' }}
            >
              Cancel
            </button>
            <button
              onClick={() => void handlePay()}
              disabled={status !== 'idle'}
              className="flex-1 rounded-xl py-2 text-xs font-semibold text-white disabled:opacity-40"
              style={{ background: 'var(--accent)' }}
            >
              {status === 'signing' ? 'Sign permit...' : status === 'sending' ? 'Sending...' : 'Confirm & sign'}
            </button>
          </div>
        </div>
      )}

      {readyToPay && !preview && (
        <div className="rounded-xl px-4 py-3 flex flex-col gap-1" style={{ background: 'rgba(18,45,69,0.04)', border: '1px solid rgba(18,45,69,0.08)' }}>
          <div className="flex items-center gap-2">
            <div className="size-1.5 rounded-full shrink-0" style={{ background: 'var(--success)' }} />
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Stealth address generated in your browser. Only the recipient can detect this payment.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="size-1.5 rounded-full shrink-0" style={{ background: 'var(--accent)' }} />
            <p className="text-xs" style={{ color: 'var(--muted)' }}>
              Two wallet prompts: sign a gasless permit, then confirm the payment — no separate approve transaction.
            </p>
          </div>
        </div>
      )}

      {!preview && (
        <button
          disabled={isBusy || !readyToPay}
          onClick={preparePayment}
          className="w-full rounded-2xl py-3.5 text-sm font-semibold text-white transition-all hover:scale-[1.01] active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ background: 'var(--accent)' }}
        >
          {buttonLabel()}
        </button>
      )}

      {payError && (
        <p className="text-xs text-center" style={{ color: 'var(--danger)' }}>
          {payError.message.includes('UsernameNotFound')
            ? 'Username not found.'
            : payError.message.includes('TransferFailed') || payError.message.includes('insufficient')
            ? 'Insufficient USDC balance.'
            : payError.message.includes('PermitFailed')
            ? 'Permit was rejected or already used. Please retry and sign a new permit.'
            : payError.message.includes('deadline')
            ? 'Permit expired. Please try again.'
            : 'Payment failed. Please try again.'}
        </p>
      )}
    </div>
  )
}
