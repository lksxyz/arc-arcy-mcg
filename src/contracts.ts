import registryAbi from './abi/ArcyRegistry.json'
import announcerAbi from './abi/ArcyAnnouncer.json'
import payAbi from './abi/ArcyPay.json'

const IS_MAINNET = import.meta.env.VITE_NETWORK === 'mainnet'

const TESTNET = {
  registry:  '0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316' as `0x${string}`,
  announcer: '0xc077eab453e1028ca231ed0d232e4ff1309ae60d' as `0x${string}`,
  pay:       '0x0b7288b4a05ee06a4489ebf98522ca988b5fbece' as `0x${string}`,
}

const MAINNET = {
  registry:  (import.meta.env.VITE_REGISTRY_MAINNET  ?? '') as `0x${string}`,
  announcer: (import.meta.env.VITE_ANNOUNCER_MAINNET ?? '') as `0x${string}`,
  pay:       (import.meta.env.VITE_PAY_MAINNET       ?? '') as `0x${string}`,
}

const addrs = IS_MAINNET ? MAINNET : TESTNET

export const ARCY_REGISTRY = {
  address: addrs.registry,
  abi: registryAbi,
} as const

export const ARCY_ANNOUNCER = {
  address: addrs.announcer,
  abi: announcerAbi,
} as const

export const ARCY_PAY = {
  address: addrs.pay,
  abi: payAbi,
} as const

export const ARC_TESTNET_CHAIN_ID = 5042002
export const ARC_MAINNET_CHAIN_ID = 5042

export const ACTIVE_CHAIN_ID = IS_MAINNET ? ARC_MAINNET_CHAIN_ID : ARC_TESTNET_CHAIN_ID

export const IS_MAINNET_BUILD = IS_MAINNET

const ADDRESS_PATTERN = /^0x[0-9a-fA-F]{40}$/

export const MISSING_MAINNET_ADDRESSES: string[] = IS_MAINNET
  ? [
      ADDRESS_PATTERN.test(MAINNET.registry) ? '' : 'VITE_REGISTRY_MAINNET',
      ADDRESS_PATTERN.test(MAINNET.announcer) ? '' : 'VITE_ANNOUNCER_MAINNET',
      ADDRESS_PATTERN.test(MAINNET.pay) ? '' : 'VITE_PAY_MAINNET',
    ].filter(Boolean)
  : []

export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`

export const USDC_PERMIT_NAME    = 'USDC'
export const USDC_PERMIT_VERSION = '2'
