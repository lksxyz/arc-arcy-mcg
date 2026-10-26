// Built with Arc Studio — https://studio.arc.io

import { http, createConfig } from 'wagmi'
import { mainnet } from 'wagmi/chains'
import { arc, arcTestnet } from 'viem/chains'
import { injected } from 'wagmi/connectors'
import { IS_MAINNET_BUILD } from './contracts'

const connectors = [injected()]

export const config = IS_MAINNET_BUILD
  ? createConfig({
      chains: [arc, mainnet],
      connectors,
      transports: {
        [arc.id]: http(),
        [mainnet.id]: http(),
      },
    })
  : createConfig({
      chains: [arcTestnet, mainnet],
      connectors,
      transports: {
        [arcTestnet.id]: http(),
        [mainnet.id]: http(),
      },
    })
