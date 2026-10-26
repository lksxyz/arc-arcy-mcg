# arcy.me — Private USDC Payments

Pay anyone with USDC using a username instead of a wallet address. arcy.me derives a one-time
[ERC-5564](https://eips.ethereum.org/EIPS/eip-5564) stealth address for every payment on
**Arc Testnet**, so the recipient's wallet never appears onchain.

Built with [Arc Studio](https://studio.arc.io).

- **Sender** resolves `arcy.me/alice`, derives a fresh stealth address in the browser, and pays it.
- **Recipient** signs a fixed message once to derive stealth keys, scans announcements, and claims.

## Deployed contracts (Arc Testnet, chain ID 5042002)

| Contract | Address | Explorer |
|---|---|---|
| ArcyRegistry | `0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316` | [View](https://explorer.testnet.arc.io/address/0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316) |
| ArcyAnnouncer | `0xc077eab453e1028ca231ed0d232e4ff1309ae60d` | [View](https://explorer.testnet.arc.io/address/0xc077eab453e1028ca231ed0d232e4ff1309ae60d) |
| ArcyPay | `0x0b7288b4a05ee06a4489ebf98522ca988b5fbece` | [View](https://explorer.testnet.arc.io/address/0x0b7288b4a05ee06a4489ebf98522ca988b5fbece) |

USDC on Arc: `0x3600000000000000000000000000000000000000` (6 decimals). Arc uses USDC as its gas token.

## How it works

### 1. Register

The recipient connects a wallet and signs a versioned derivation message. The signature is hashed into
two secp256k1 keypairs:

```
entropy         = keccak256(signature || "arcy.me/stealth-key/v2/<chainId>")
spendingPrivKey = keccak256("spend" || entropy) mod (n - 1) + 1
viewingPrivKey  = keccak256("view"  || entropy) mod (n - 1) + 1
```

The public keys are packed into a 132-byte meta-address
(`spendingPubKey[33] || viewingPubKey[33] || zero padding[65] || version[1]`) and registered with a
username through `ArcyRegistry.registerUsername`. Version `2` is current; version `0` marks a legacy
registration that used the original fixed message.

Keys are never stored by the app: signing the same message with the same wallet always reproduces them.
The signature is as powerful as the spending key, so only sign the derivation message on arcy.me. The
Account tab can upgrade a legacy registration to the current derivation.

Usernames can be transferred with a two-step handshake (`transferUsername` then `acceptUsername`) and
released with `releaseUsername`. Names must be 1-32 characters of `a-z`, `0-9`, and `-`, starting and
ending with a letter or number.

### 2. Pay

The sender loads `/<username>`, reads the meta-address from the registry, and builds the payment:

```
r  = random ephemeral private key
R  = r·G                                  (ephemeral public key, 33 bytes)
s  = keccak256(r·V)[0..32]                (V = viewing public key)
S  = K + s·G                              (K = spending public key)
stealthAddress = last20(keccak256(S_uncompressed[1..]))
viewTag = first byte of s
```

`ArcyPay.payByUsernameWithPermit` then performs the EIP-2612 permit and the USDC `transferFrom`
to `stealthAddress` in one transaction, and forwards the announcement to `ArcyAnnouncer`.

### 3. Scan and claim

The recipient reads the version byte from their registered meta-address, signs the matching derivation
message, fetches `Announcement` logs in 2,000-block chunks (most recent 10,000 blocks, or full history
on request), and for each log:

1. Computes `s = keccak256(viewingPrivKey·R)` and compares the first byte with `viewTag`.
2. Rebuilds `S = K + s·G` and checks that it maps to the announced `stealthAddress`.
3. Derives the claim key `k_stealth = spendingPrivKey + s mod n`.

Malformed announcements are skipped: the scanner validates the compressed prefix and wraps each check in
`try/catch`, so one bad payload cannot break a scan.

The claim key is copied as a hex private key and imported into any wallet to sweep the USDC.

A full sequence diagram and trust model live in [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Privacy model

| Data | Visibility |
|---|---|
| Username → stealth meta-address | Public (pseudonymous, no wallet link) |
| Username owner address | Public via `ArcyRegistry.getOwner`, but never used in payments |
| Payment sender | Public (`msg.sender` in `Announcement`) |
| Payment recipient | Hidden — only a one-time stealth address is announced |
| Amount | Public (`PaymentSent` event and ERC-20 transfer) |
| Recipient wallet | Never appears in the payment path |

`ArcyAnnouncer` records no username. The optional `announceWithRecipient` helper exists but is not used
by the app, since it would publish the recipient link.

Limit to keep in mind: stealth addresses hide the link between recipient and payment, not the
existence or amount of the payment. Timing analysis and offchain metadata can still correlate activity.

## Repository layout

```
contracts/
  ArcyRegistry.sol          username -> stealth meta-address registry
  ArcyAnnouncer.sol         ERC-5564 style announcement emitter
  ArcyPay.sol               atomic permit + USDC transfer + announcement
  script/                   Foundry deployment scripts
  test/                     Foundry unit tests
docs/
  ARCHITECTURE.md           components, math, data flow, threat model
  DEPLOYMENT.md             testnet and mainnet deployment runbook
  SECURITY_AUDIT.md         internal security review and findings
scripts/check.sh            lint + typecheck runner
src/
  App.tsx                   routing and app shell
  components/               Pay, Register, Scan, Account views
  contracts.ts              addresses, chain config, ABIs from src/abi
  stealth.ts                ERC-5564 secp256k1 implementation
  abi/                      committed contract ABIs
  config.ts                 wagmi client
  onchain-facts.ts          chain and token metadata
  onchain-money.ts          amount parsing and formatting
  tracing.ts                dev-only RPC trace bridge
  console-capture.ts        dev-only console log bridge
```

## Requirements

- [Bun](https://bun.sh) 1.2+
- [Foundry](https://book.getfoundry.sh) (contracts only)

## Getting started

```bash
bun install
bun run dev
```

The app targets Arc Testnet by default. Copy `.env.example` to `.env` only when you need mainnet
addresses or a custom RPC proxy.

| Variable | Purpose |
|---|---|
| `VITE_NETWORK` | `testnet` (default) or `mainnet` |
| `VITE_REGISTRY_MAINNET` | ArcyRegistry address on Arc Mainnet |
| `VITE_ANNOUNCER_MAINNET` | ArcyAnnouncer address on Arc Mainnet |
| `VITE_PAY_MAINNET` | ArcyPay address on Arc Mainnet |
| `RPC_PROXY_BASE_URL` | Optional Arc Studio RPC proxy base URL |
| `RPC_PROXY_TOKEN` | Optional RPC proxy token |
| `RPC_PROXY_CHAINS` | Optional comma-separated proxied chain keys |

## Commands

| Command | Description |
|---|---|
| `bun run dev` | Start the Vite dev server |
| `bun run build` | Production build into `dist/` |
| `bun run preview` | Serve the production build |
| `bun run check` | Lint and typecheck with per-step timeouts |
| `bun run lint` | oxlint with type-aware rules |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run contracts:build` | `forge build` |
| `bun run contracts:test` | `forge test` |
| `bun run test` | Alias for `forge test` |

## Security

See [docs/SECURITY_AUDIT.md](docs/SECURITY_AUDIT.md) for the internal review of the contracts and the
client-side stealth-key flows. All actionable findings have been remediated in the working tree;
the onchain fixes require redeploying the contracts (see the audit's remediation status).

## Testing

```bash
bun run contracts:test
bun run check
```

Contract tests cover registry validation, registration, release, key rotation, two-step transfers,
announcer payload validation, and both payment paths (allowance-based and permit-based), including
permit front-running and failure cases. 47 tests run with `bun run contracts:test`.

## Deployment

Testnet is already deployed. For a fresh testnet or mainnet deployment, follow
[docs/DEPLOYMENT.md](docs/DEPLOYMENT.md). After deploying, update the addresses in `src/contracts.ts`
and regenerate `src/abi/*.json` from `contracts/out/` if the contract interfaces changed.

Mainnet builds must set `VITE_NETWORK=mainnet` plus all three `VITE_*_MAINNET` addresses. If any address
is missing or malformed, the app renders a configuration error instead of the UI. Arc uses chain ID
`5042` on mainnet and `5042002` on testnet; both are USDC-denominated with `0x3600...0000` as the ERC-20
USDC address. The Studio trace/console bridges load only in development builds.

## License

MIT. See [LICENSE](LICENSE). Contract sources also carry an MIT SPDX header.
