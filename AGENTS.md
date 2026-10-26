# arcy.me — Project Memory

> Built with Arc Studio — money-powered apps in minutes

## What This App Does

arcy.me is a private USDC payment app using ERC-5564 stealth addresses on Arc Testnet.
Users register a username (e.g. `arcy.me/alice`) and share it instead of their wallet address.
Senders derive a one-time stealth address client-side and pay via the ArcyPay contract.
Recipients derive their stealth keys from a wallet signature, scan announcement logs, and claim.

## Deployed Contracts (Arc Testnet)

| Contract | Address | Explorer |
|---|---|---|
| ArcyRegistry | `0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316` | [View](https://explorer.testnet.arc.io/address/0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316) |
| ArcyAnnouncer | `0xc077eab453e1028ca231ed0d232e4ff1309ae60d` | [View](https://explorer.testnet.arc.io/address/0xc077eab453e1028ca231ed0d232e4ff1309ae60d) |
| ArcyPay | `0x0b7288b4a05ee06a4489ebf98522ca988b5fbece` | [View](https://explorer.testnet.arc.io/address/0x0b7288b4a05ee06a4489ebf98522ca988b5fbece) |

ArcyPay constructor args: `(ArcyRegistry, ArcyAnnouncer)`.

## Tech Stack

- Frontend: React 18, Vite, TypeScript, Tailwind CSS
- Web3: wagmi v2, viem v2, ConnectKit
- Contracts: Solidity 0.8.28 + Foundry. Sources in `contracts/`, build output in gitignored `contracts/out/`
- Crypto: @noble/curves/secp256k1 (ECDH stealth key derivation, bundled with viem)
- Chain: Arc Testnet (5042002) and Arc Mainnet (5042), selected with `VITE_NETWORK`
- Token: USDC (6 decimals, `0x3600000000000000000000000000000000000000`), also the gas token

## Key Files

- `src/App.tsx` — Route shell (`/`, `/<username>`, `/app`, `/app/setup`, `/app/claim`, `/app/account`)
- `src/components/PayView.tsx` — Sender flow: resolve username, derive stealth address, sign permit, pay USDC
- `src/components/RegisterView.tsx` — Recipient registration: derive keys from signature, register username
- `src/components/ScanView.tsx` — Recipient scanning: derive keys, scan `Announcement` logs, copy stealth private key
- `src/components/AccountView.tsx` — Copy share link, upgrade legacy keys, two-step username transfer, release
- `src/stealth.ts` — ERC-5564 secp256k1 implementation, v1/v2 deterministic key derivation, meta-address versioning
- `src/contracts.ts` — Addresses, chain config, ABIs imported from `src/abi/`
- `src/abi/*.json` — Committed contract ABIs, regenerate from `contracts/out/` after interface changes
- `contracts/ArcyRegistry.sol` — Username to stealth meta-address registry
- `contracts/ArcyAnnouncer.sol` — ERC-5564-style announcement emitter
- `contracts/ArcyPay.sol` — Atomic permit + USDC transferFrom + announce
- `contracts/test/` — Foundry tests for all three contracts
- `docs/ARCHITECTURE.md` — Stealth math, data flow, trust model
- `docs/DEPLOYMENT.md` — Testnet and mainnet deployment runbook
- `docs/SECURITY_AUDIT.md` — Internal audit with open findings (M-01 scan DoS, H-01 key derivation, M-02 unverified target)

## Privacy Design

- Username is stored onchain (pseudonymous, but anyone can see which address registered it).
- Payment announcements contain only schemeId, stealthAddress, msg.sender (payer), ephemeralPubKey, viewTag. No recipient username.
- The recipient's real wallet address never appears in the payment path.
- The stealth meta-address (two public keys) is public by design; it cannot be linked to the real wallet.

## Stealth Keys

- Stealth meta-address: 132 bytes = spending pubkey (33) + viewing pubkey (33) + 65 zero padding + version byte.
- Version `2` (current) derives entropy as `keccak256(signature || "arcy.me/stealth-key/v2/<chainId>")`; version `0` is legacy and uses `sig[0..32]`.
- Keys are derived from a wallet signature; no key file is stored or downloaded. The signature is as powerful as the spending key.
- Claim key: `spendingPrivKey + keccak256(viewingPrivKey · ephemeralPubKey) mod n`.
- Usernames: 1-32 chars, `a-z`, `0-9`, `-`, no leading/trailing hyphen. Transfers are two-step (`transferUsername` / `acceptUsername`).

## Commands

```bash
bun install
bun run dev
bun run check
bun run contracts:test
bun run build
```

## Conventions

- No code comments except functional directives and SPDX headers; documentation lives in `README.md` and `docs/`.
- Keep `src/abi/*.json` in sync with the Solidity interfaces.
- Onchain changes require redeploying all three contracts; regenerate ABIs and update `src/contracts.ts`.
- Never commit `.env`, build artifacts, or runtime logs.
