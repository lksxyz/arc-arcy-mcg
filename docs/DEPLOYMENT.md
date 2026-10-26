# Deployment Runbook

Arc Studio deploys to testnet automatically. This document covers manual deployments to Arc Testnet
and Arc Mainnet from your own machine.

## Network reference

| Network | Chain ID | RPC | Explorer |
|---|---|---|---|
| Arc Testnet | 5042002 | `https://rpc.testnet.arc.io` | `https://explorer.testnet.arc.io` |
| Arc Mainnet | 5042 | `https://rpc.mainnet.arc.io` | `https://explorer.arc.io` |

USDC is `0x3600000000000000000000000000000000000000` on both networks and is also the gas token.

## Pre-flight checks

```bash
cast chain-id --rpc-url https://rpc.mainnet.arc.io
```

Expected `5042`. The `VITE_*_MAINNET` addresses are validated at build time: a mainnet build with a
missing or malformed address renders a configuration error screen instead of the app.

## Current testnet deployment

| Contract | Address |
|---|---|
| ArcyRegistry | `0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316` |
| ArcyAnnouncer | `0xc077eab453e1028ca231ed0d232e4ff1309ae60d` |
| ArcyPay | `0x0b7288b4a05ee06a4489ebf98522ca988b5fbece` |

ArcyPay constructor arguments: `(ArcyRegistry, ArcyAnnouncer)`.

## 1. Prerequisites

- [Foundry](https://book.getfoundry.sh) (`curl -L https://foundry.paradigm.xyz | bash && foundryup`)
- Bun 1.2+
- A funded deployer wallet on the target network

```bash
bun install
forge build
forge test
```

`forge build` writes artifacts to `contracts/out/`. The directory is gitignored; commit ABIs through
`src/abi/*.json` instead.

> **Redeploy required for the current source.** The contracts changed after the security review
> (permit fallback, announcement prefix checks, meta-address validation, username transfers). The
> addresses in the table above still run the previous bytecode. Redeploy all three contracts and update
> the addresses before relying on the new onchain behavior. The frontend keeps working with the old
> deployment except for the transfer/accept controls in the Account tab.

## 2. Deploy

```bash
export PRIVATE_KEY=0x<deployer-private-key>

forge script contracts/script/DeployArcy.s.sol \
  --rpc-url https://rpc.testnet.arc.io \
  --broadcast \
  --private-key "$PRIVATE_KEY" \
  -vvvv
```

The script deploys `ArcyRegistry`, `ArcyAnnouncer`, then `ArcyPay` and prints all three addresses.
Never commit a private key or a `.env` file.

For mainnet, replace the RPC URL with `https://rpc.mainnet.arc.io` after completing the audit checklist
below.

## 3. Update the app

1. Set the addresses in `src/contracts.ts`. Testnet addresses are constants; mainnet addresses come
   from environment variables:

   ```bash
   VITE_NETWORK=mainnet
   VITE_REGISTRY_MAINNET=0x<ArcyRegistry>
   VITE_ANNOUNCER_MAINNET=0x<ArcyAnnouncer>
   VITE_PAY_MAINNET=0x<ArcyPay>
   ```

2. Refresh the committed ABIs after every contract change:

   ```bash
   for name in ArcyRegistry ArcyAnnouncer ArcyPay; do
     jq '.abi' "contracts/out/$name.sol/$name.json" > "src/abi/$name.json"
   done
   ```

3. Update the address tables in `README.md`, `AGENTS.md`, and this file.

4. If you are redeploying an existing testnet, note that usernames and their stealth meta-addresses live
   in the old registry. Users must register again on the new deployment, or you must snapshot and
   migrate the mappings.

## 4. Verify (recommended)

```bash
forge verify-contract <address> contracts/ArcyRegistry.sol:ArcyRegistry \
  --rpc-url https://rpc.testnet.arc.io \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api
```

Repeat for `ArcyAnnouncer` and `ArcyPay`. For ArcyPay, pass the ABI-encoded constructor arguments:

```bash
forge verify-contract <pay-address> contracts/ArcyPay.sol:ArcyPay \
  --constructor-args $(cast abi-encode "constructor(address,address)" <registry> <announcer>) \
  --rpc-url https://rpc.testnet.arc.io \
  --verifier blockscout \
  --verifier-url https://explorer.testnet.arc.io/api
```

## 5. Build and publish the frontend

```bash
bun run check
bun run build
```

Deploy `dist/` to any static host. `vercel.json` adds the SPA fallback so `/<username>` routes resolve
to `index.html`. Set the `VITE_*` variables in the hosting environment, not in the repository.

## 6. Mainnet checklist

- [ ] Independent professional audit of all three contracts
- [ ] Full register → pay → scan → claim rehearsal on testnet with real wallets
- [ ] Confirm the Arc Mainnet chain ID is `5042`
- [ ] Confirm USDC EIP-712 permit domain (`USDC_PERMIT_NAME`, `USDC_PERMIT_VERSION` in `src/contracts.ts`)
- [ ] Confirm the USDC address on mainnet
- [ ] Fund the deployer wallet for gas
- [ ] Deploy and verify all three contracts
- [ ] Register a test username, send a payment, scan, and claim
- [ ] Confirm the "Arc Mainnet" badge in the footer
- [ ] Update the address tables in the docs and `AGENTS.md`

## Wallet network setup

The app first tries `wallet_switchEthereumChain`. If the wallet does not know Arc, it falls back to
`wallet_addEthereumChain` with the parameters below and retries the switch. If the wallet rejects the
request, add the network manually:

| Field | Arc Mainnet | Arc Testnet |
|---|---|---|
| RPC URL | `https://rpc.mainnet.arc.io` | `https://rpc.testnet.arc.io` |
| Chain ID | `5042` | `5042002` |
| Symbol | `USDC` | `USDC` |
| Explorer | `https://explorer.arc.io` | `https://explorer.testnet.arc.io` |

## Post-deploy smoke test

1. Open `https://arcy.me/` and connect a wallet on the target chain.
2. Register a username at `/app/setup`.
3. Send a small payment to `arcy.me/<username>` from a second wallet. Confirm the review card shows the
   stealth address before signing.
4. Scan at `/app/claim` and confirm the payment is detected with the right amount.
5. Copy the stealth private key and sweep the USDC to confirm claimability.
6. Start a username transfer from `/app/account`, accept it from the second wallet, and confirm the
   reverse lookup moved.
7. Upgrade a legacy registration with the Account tab and confirm the meta-address version byte changed
   to `0x02`.
8. Release the username from `/app/account` if it was a test.
