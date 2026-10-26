import { useAccount, useSwitchChain } from 'wagmi'
import { ACTIVE_CHAIN_ID, ACTIVE_CHAIN_NAME, IS_MAINNET_BUILD } from './contracts'

interface Eip1193Provider {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>
}

const ACTIVE_CHAIN_PARAMS = {
  chainId: `0x${ACTIVE_CHAIN_ID.toString(16)}`,
  chainName: ACTIVE_CHAIN_NAME,
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: [IS_MAINNET_BUILD ? 'https://rpc.mainnet.arc.io' : 'https://rpc.testnet.arc.io'],
  blockExplorerUrls: [IS_MAINNET_BUILD ? 'https://explorer.arc.io' : 'https://explorer.testnet.arc.io'],
}

export function useEnsureActiveChain(): () => Promise<boolean> {
  const { connector } = useAccount()
  const { switchChainAsync } = useSwitchChain()

  return async () => {
    try {
      await switchChainAsync({ chainId: ACTIVE_CHAIN_ID })
      return true
    } catch {
      const provider = (await connector?.getProvider()) as Eip1193Provider | undefined
      if (!provider?.request) return false

      try {
        await provider.request({
          method: 'wallet_addEthereumChain',
          params: [ACTIVE_CHAIN_PARAMS],
        })
        await switchChainAsync({ chainId: ACTIVE_CHAIN_ID })
        return true
      } catch {
        return false
      }
    }
  }
}
