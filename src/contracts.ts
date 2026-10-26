import registryArtifact from '../contracts/out/ArcyRegistry.sol/ArcyRegistry.json'
import announcerArtifact from '../contracts/out/ArcyAnnouncer.sol/ArcyAnnouncer.json'
import payArtifact from '../contracts/out/ArcyPay.sol/ArcyPay.json'

// ---------------------------------------------------------------------------
// Network config — set VITE_NETWORK=mainnet in .env to switch to Arc Mainnet.
// After deploying to mainnet, fill in the three VITE_*_MAINNET addresses below.
// ---------------------------------------------------------------------------

const IS_MAINNET = import.meta.env.VITE_NETWORK === 'mainnet'

// Testnet addresses (Arc Testnet, chain ID 5042002)
const TESTNET = {
  registry:  '0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316' as `0x${string}`,
  announcer: '0xc077eab453e1028ca231ed0d232e4ff1309ae60d' as `0x${string}`,
  pay:       '0x0b7288b4a05ee06a4489ebf98522ca988b5fbece' as `0x${string}`,
}

// Mainnet addresses (Arc Mainnet, chain ID 5042001)
// Fill these in after running the deploy script.
const MAINNET = {
  registry:  (import.meta.env.VITE_REGISTRY_MAINNET  ?? '') as `0x${string}`,
  announcer: (import.meta.env.VITE_ANNOUNCER_MAINNET ?? '') as `0x${string}`,
  pay:       (import.meta.env.VITE_PAY_MAINNET       ?? '') as `0x${string}`,
}

const addrs = IS_MAINNET ? MAINNET : TESTNET

export const ARCY_REGISTRY = {
  address: addrs.registry,
  abi: registryArtifact.abi,
} as const

export const ARCY_ANNOUNCER = {
  address: addrs.announcer,
  abi: announcerArtifact.abi,
} as const

export const ARCY_PAY = {
  address: addrs.pay,
  abi: payArtifact.abi,
} as const

// Chain IDs
export const ARC_TESTNET_CHAIN_ID = 5042002
export const ARC_MAINNET_CHAIN_ID = 5042001

/** The chain ID the app is currently targeting. */
export const ACTIVE_CHAIN_ID = IS_MAINNET ? ARC_MAINNET_CHAIN_ID : ARC_TESTNET_CHAIN_ID

/** True when running against Arc Mainnet. */
export const IS_MAINNET_BUILD = IS_MAINNET

// USDC address is identical on both Arc Testnet and Arc Mainnet.
export const USDC_ADDRESS = '0x3600000000000000000000000000000000000000' as `0x${string}`

// USDC EIP-712 permit domain values — verified on Arc Testnet; confirm on mainnet.
export const USDC_PERMIT_NAME    = 'USDC'
export const USDC_PERMIT_VERSION = '2'
