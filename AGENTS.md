# arcy.me — Project Memory

> Built with Arc Studio - money-powered apps in minutes

---

## What This App Does

arcy.me is a private USDC payment app using ERC-5564 stealth addresses on Arc Testnet.
Users register a username (e.g. `arcy.me/alice`) and share it instead of their wallet address.
Senders derive a one-time stealth address client-side and pay via the ArcyPay contract.
Recipients scan announcement logs with their private keys to detect and claim incoming payments.

## Deployed Contracts (Arc Testnet)

| Contract | Address | Explorer |
|---|---|---|
| ArcyRegistry | `0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316` | [View](https://explorer.testnet.arc.io/address/0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316) |
| ArcyAnnouncer | `0xc077eab453e1028ca231ed0d232e4ff1309ae60d` | [View](https://explorer.testnet.arc.io/address/0xc077eab453e1028ca231ed0d232e4ff1309ae60d) |
| ArcyPay | `0x90e0e3b1afc941679a473de10f6d5fc68d271f6e` | [View](https://explorer.testnet.arc.io/address/0x90e0e3b1afc941679a473de10f6d5fc68d271f6e) |

ArcyPay constructor args: `(ArcyRegistry, ArcyAnnouncer)`.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, artifacts in `contracts/out/`
- Crypto: @noble/curves/secp256k1 (ECDH stealth key derivation, bundled with viem)
- Chain: Arc Testnet (Chain ID: 5042002)
- Token: USDC (6 decimals, address: 0x3600000000000000000000000000000000000000)
- Toasts: Sonner

## Key Files

- `src/App.tsx` — Tab shell (Pay / Register / Scan / Account)
- `src/components/PayView.tsx` — Sender flow: resolve username, derive stealth address, approve + pay USDC
- `src/components/RegisterView.tsx` — Recipient registration: generate keys, register username onchain
- `src/components/ScanView.tsx` — Recipient scanning: load key file, scan Announcement events, export stealth privkey to claim
- `src/components/AccountView.tsx` — Show username, copy share link, release username
- `src/stealth.ts` — ERC-5564 SECP256k1 implementation: encodeStealthMetaAddress, generateStealthAddress, checkStealthAddress, computeStealthKey
- `src/contracts.ts` — Contract addresses, ABIs, chain ID constant
- `contracts/ArcyRegistry.sol` — Username → stealth meta-address registry
- `contracts/ArcyAnnouncer.sol` — ERC-5564-style announcement emitter
- `contracts/ArcyPay.sol` — Atomic USDC transferFrom + announce

## Privacy Design

- Username is stored onchain (pseudonymous — anyone can see who registered, but not their wallet).
- Payment announcements (Announcement events) contain only: schemeId, stealthAddress, msg.sender (payer), ephemeralPubKey, viewTag — NO recipient username in the event.
- The recipient's real wallet address is never exposed to senders or observers.
- The stealth meta-address (two public keys) is public by design; it cannot be used to find the real wallet.

## Stealth Key Format

- Stealth meta-address: 132 bytes = spending pubkey (33 bytes) + viewing pubkey (33 bytes) + 66 zero-padding bytes.
- Key file (arcy-keys-*.json): downloaded at registration, contains spendingPrivKey, viewingPrivKey, spendingPubKey, viewingPubKey, stealthMetaAddress.

## To Run

```bash
bun install
bun run dev
```
