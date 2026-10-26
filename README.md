# arcy.me — Private USDC Payments

Pay anyone privately with USDC using their username — not their wallet address. Built with [Arc Studio](https://studio.arc.io).

## What it does

arcy.me lets you share a username like `arcy.me/alice` and receive USDC payments without ever revealing your wallet address. Senders compute a one-time stealth address in their browser and pay through it. Only you — with your private key file — can detect and claim incoming payments.

Built on ERC-5564 stealth addresses + an onchain username registry on Arc Testnet.

## Tech stack

- React 18, Vite, TypeScript, Tailwind CSS
- wagmi v2, viem v2, ConnectKit
- Solidity 0.8.28, Foundry
- @noble/curves (SECP256k1 ECDH, bundled with viem)
- Arc Testnet (USDC as native gas)

## Environment variables

None required to run. The app connects to Arc Testnet RPC directly through wagmi.

| Variable | Purpose |
|---|---|
| `RPC_PROXY_BASE_URL` | Optional — Arc Studio RPC proxy (provided automatically inside Arc Studio) |
| `RPC_PROXY_TOKEN` | Optional — RPC proxy auth token (provided automatically inside Arc Studio) |
| `RPC_PROXY_CHAINS` | Optional — comma-separated list of proxied chain keys |

## Development

```bash
bun install
bun run dev
```

## Build

```bash
bun run build
```

## Contracts

Build Solidity contracts:

```bash
bun run contracts:build
```

Test contracts:

```bash
bun run contracts:test
```

### Deployed on Arc Testnet

| Contract | Address |
|---|---|
| ArcyRegistry | `0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316` |
| ArcyAnnouncer | `0xc077eab453e1028ca231ed0d232e4ff1309ae60d` |
| ArcyPay | `0x90e0e3b1afc941679a473de10f6d5fc68d271f6e` |

## How to try it

1. Get test USDC from the **Get test USDC** button in the Arc Studio sidebar.
2. Go to **Register** — generate your stealth keys (saved to a JSON file) and claim a username.
3. Share your link: `arcy.me/your-username`.
4. Have someone go to **Pay**, enter your username, and send USDC.
5. Go to **Scan** — load your key file and click Scan to find incoming payments.
6. Copy the stealth private key and import it into MetaMask to sweep the funds to your main wallet.
