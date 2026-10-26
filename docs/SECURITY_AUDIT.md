# Security Audit — arcy.me Contracts

**Date:** 2026-10-27
**Scope:** `contracts/ArcyRegistry.sol`, `contracts/ArcyAnnouncer.sol`, `contracts/ArcyPay.sol`, their deployment on Arc Testnet, and the client-side stealth-key flows that depend on them
**Network:** Arc Testnet (chain ID 5042002)
**Auditor:** Internal review (AI-assisted, manual analysis)
**Commit reviewed:** working tree at the time of the report (`src/abi` regenerated, comments stripped, Foundry tests added)

> This is an internal review, not a substitute for an independent professional audit before mainnet.

## 1. Scope and deployments

| Contract | Address | Deployed bytecode |
|---|---|---|
| ArcyRegistry | `0x833a3ab80a27dd7fa60942cbfe2df55ce0e3e316` | 3,298 bytes |
| ArcyAnnouncer | `0xc077eab453e1028ca231ed0d232e4ff1309ae60d` | 913 bytes |
| ArcyPay | `0x0b7288b4a05ee06a4489ebf98522ca988b5fbece` | 2,404 bytes |

Out of scope: the hosting provider, wallet software, Circle/Arc infrastructure, and the `tracing.ts` /
`console-capture.ts` development instrumentation.

## 2. Methodology

1. Manual line-by-line review of all three contracts and their deploy script.
2. Threat modeling for the three actors: sender, recipient, and arbitrary third party.
3. `forge lint` static analysis and the Foundry unit tests in `contracts/test/` (47 at the time of remediation).
4. Onchain verification against Arc Testnet:
   - `cast chain-id` returned `5042002`.
   - `cast codesize` is non-zero for all three addresses.
   - `ArcyPay.registry()` returns the documented ArcyRegistry and `ArcyPay.announcer()` returns the
     documented ArcyAnnouncer.
   - Deployed runtime bytecode matches the compiled artifacts: ArcyRegistry and ArcyAnnouncer are
     identical apart from the IPFS metadata hash; ArcyPay differs only in the five embedded immutable
     slots that hold the registry/announcer addresses. The logic is byte-for-byte identical.
   - USDC `name()` = `USDC`, `version()` = `2`, `decimals()` = `6`, and the onchain `DOMAIN_SEPARATOR()`
     equals the EIP-712 domain computed from `USDC_PERMIT_NAME`/`USDC_PERMIT_VERSION` in
     `src/contracts.ts`.
5. Client-side review of `src/stealth.ts`, `PayView.tsx`, `RegisterView.tsx`, and `ScanView.tsx` for
   issues that the contracts cannot prevent.

## 3. Severity definitions

| Severity | Meaning |
|---|---|
| High | Loss of funds or permanent compromise with realistic preconditions |
| Medium | Loss of funds with unlikely preconditions, denial of service, or privacy break |
| Low | Griefing, operational failure, or a risk that needs user error or an additional bug |
| Informational | Hardening, specification, or design note |

## 4. Findings summary

| ID | Severity | Title | Status |
|---|---|---|---|
| H-01 | High | Stealth keys derive from a static, replayable wallet signature | Mitigated |
| M-01 | Medium | A single malformed announcement breaks the recipient's scan | Fixed |
| M-02 | Medium | Payment target is never verified against the registry meta-address | Fixed (UI) |
| L-01 | Low | Permit front-running can grief `payByUsernameWithPermit` | Fixed (contract) |
| L-02 | Low | Anyone can announce, enabling spam and scanner cost amplification | Accepted |
| L-03 | Low | `announceWithRecipient` is a privacy footgun for integrators | Fixed (contract) |
| L-04 | Low | Meta-address is 132 bytes instead of 66, padding is unvalidated | Fixed (contract) |
| L-05 | Low | No curve-point validation for meta-addresses or ephemeral keys | Partially fixed |
| L-06 | Low | Hardcoded USDC address and 6-decimal assumption | Accepted |
| L-07 | Low | Registration is permanent and not transferable | Fixed (contract) |
| I-01 | Info | No reentrancy guard around external calls | Accepted |
| I-02 | Info | Scan window is limited to the most recent 10,000 blocks | Fixed |
| I-03 | Info | Permit signatures are not normalized | Fixed |
| I-04 | Info | Username edge cases and squatting | Partially fixed |
| I-05 | Info | Contracts are immutable, with no admin or upgrade path | Accepted |
| I-06 | Info | `forge lint` gas notes on `keccak256(bytes(...))` | Accepted |

### Remediation status (2026-10-27)

All actionable findings were fixed in the working tree. The ArcyRegistry, ArcyAnnouncer, and ArcyPay
sources changed, so **the onchain fixes only take effect after the three contracts are redeployed**
(see `docs/DEPLOYMENT.md`). The client-side fixes (M-01, M-02, H-01 warnings, I-02, I-03) are live
against the existing testnet deployment. New registry features (`getPendingOwner`,
`transferUsername`, `acceptUsername`, `cancelUsernameTransfer`) revert on the old deployment and the
Account view detects that and asks for a redeploy.

| Finding | Remediation |
|---|---|
| H-01 | New v2 derivation message with app domain, chain id, and purpose. Version byte in the meta-address selects v1 or v2. UI warns that a signature is a spending key. Account view offers an upgrade path through `updateStealthMetaAddress`. |
| M-01 | `ScanView` wraps each announcement check in `try/catch`, skips keys whose compressed prefix is not `0x02`/`0x03`, and `ArcyAnnouncer` rejects bad prefixes. |
| M-02 | `PayView` generates the stealth address first and shows it on a review card with a cancel action before any signing. |
| L-01 | `payByUsernameWithPermit` wraps `permit` in `try/catch` and falls back to an existing allowance (`PermitFailed` only when the allowance is insufficient). |
| L-03 | `announceWithRecipient` and its event were removed. |
| L-04 | Registry requires 132 bytes with zero padding at `66..130` and a supported version byte at `131`. |
| L-05 | Registry validates compressed prefixes for both public keys; announcer validates the ephemeral key prefix. Full point validation is still impossible in the EVM. |
| L-07 | Two-step `transferUsername` / `acceptUsername` with `cancelUsernameTransfer`, plus `getPendingOwner`. |
| I-02 | Scan view has a "full history" option starting at block 0. |
| I-03 | Permit signatures tolerate EIP-2098 compact form and normalize `v` to 27/28. |
| I-04 | Leading and trailing hyphens are rejected by the contract and the UI. Squatting remains permissionless by design. |

The contracts themselves contain no access-control, arithmetic, or fund-custody vulnerability. The
highest risks are in what the system deliberately does not verify onchain (H-01, M-01, M-02).

## 5. Detailed findings

### H-01 — Stealth keys derive from a static, replayable wallet signature

**Location:** `src/stealth.ts` (`STEALTH_KEY_DERIVATION_MESSAGE`, `deriveStealthKeysFromSignature`)
**Severity:** High (off-chain, affects all stealth funds)
**Status:** Mitigated (v2 domain-separated derivation + upgrade path, residual signature/phishing risk)

**Description.** Spending and viewing private keys are derived deterministically from the first 32
bytes of a `personal_sign` signature over a fixed, public message. The same message is used forever,
for every user, on every chain. The signature is a complete key: anyone holding it can derive both
private keys, recompute every stealth address derived for that user, and sweep the funds.

**Impact.** A single leak of that signature — a compromised frontend, a malicious site that requests
the same literal string, a wallet activity log or backup, an XSS, or a malicious browser extension —
gives permanent, retroactive access to all current and future stealth payments for that wallet. The
attacker does not need the wallet's private key.

**Proof of concept.** The message is public, so any site can request it:

```js
await window.ethereum.request({
  method: 'personal_sign',
  params: [STEALTH_KEY_DERIVATION_MESSAGE, victimAddress],
})
```

That signature is enough to reproduce `deriveStealthKeysFromSignature` offline and to compute
`spendingKey + keccak(viewingKey · R) mod n` for every announcement.

**Recommendation.**

1. Add a per-wallet, versioned, human-readable domain to the message that includes the app name and
   the chain, and warn in the UI that the signature controls funds. This reduces accidental replay but
   does not stop a phishing site that copies the string.
2. Preferred: derive keys from a signing operation with domain separation that cannot be replayed
   across applications, or from a wallet-held secret that is not a bare signature (for example a
   `wallet_getEncryptionPublicKey`/passkey/WebAuthn-derived secret), and store only the public
   meta-address onchain.
3. Add an explicit warning that signing this message is equivalent to exporting the spending key, and
   never reuse the same derivation across chains or app versions.

Because the scheme is already deployed and registered meta-addresses are immutable, mitigation 2 needs
a key-rotation flow (`updateStealthMetaAddress`) plus a migration UI.

### M-01 — A single malformed announcement breaks the recipient's scan

**Location:** `src/components/ScanView.tsx` (scan loop), `contracts/ArcyAnnouncer.sol` (`announce`)
**Severity:** Medium (denial of service, no fund loss)
**Status:** Fixed

**Description.** `ArcyAnnouncer.announce` only checks that `ephemeralPubKey.length == 33`. Any account
can emit an announcement with a 33-byte payload that is not a valid compressed secp256k1 point. The
scanner calls `checkStealthAddress`, which invokes `secp256k1.ProjectivePoint.fromHex(...)` inside a
try block that covers only the whole scan, not the individual log. The throw aborts the entire scan.

**Impact.** An attacker can block payment discovery for all users whose scan range includes the bad
announcement, with one cheap transaction. Funds are not lost, but recipients cannot detect new payments
until the announcement leaves the 10,000-block window, and they cannot distinguish a DoS from "no
payments".

**Proof of concept.** Emit an announcement with a non-point:

```solidity
announcer.announce(1, address(0xBEEF), hex"020000000000000000000000000000000000000000000000000000000000000000", 0x00);
```

Locally verified: noble throws `Point is not on curve` for that payload, and `ScanView` surfaces only
`Scan failed. Please try again.`

**Recommendation.**

```ts
for (const log of logs) {
  try {
    const isMine = checkStealthAddress({ ... })
    if (!isMine) continue
    ...
  } catch {
    continue
  }
}
```

Also validate the compressed-point prefix (`0x02`/`0x03`) in `ArcyAnnouncer` to reject the cheapest
class of junk, and keep the view-tag filter before any balance lookup.

### M-02 — Payment target is never verified against the registry meta-address

**Location:** `contracts/ArcyPay.sol` (`payByUsername`, `payByUsernameWithPermit`)
**Severity:** Medium (design; requires a malicious or buggy client)
**Status:** Fixed (UI review step; derivation still not verifiable onchain)

**Description.** Both payment functions call `registry.getStealthMetaAddress(username)` purely as an
existence check and discard the returned value. The caller supplies `stealthAddress` and
`ephemeralPubKey`, and the contract cannot verify that they were derived from the registered
meta-address. A compromised frontend, a malicious wallet plugin, or a user error can therefore pay an
attacker-controlled address while the UI still shows the requested username. The recipient will never
see the payment, and there is no recovery path.

**Impact.** Loss of a single payment in the presence of a compromised client. A recipient whose keys
were rotated keeps old funds, but a sender can be silently misdirected.

**Recommendation.** Full onchain verification of the derivation is impractical on EVM (no secp256k1
point arithmetic precompile). Practical mitigations:

1. In the UI, display the derived stealth address and require explicit confirmation before signing
   (currently the address is never shown).
2. Consider passing the meta-address to `ArcyPay` and checking
   `keccak256(meta) == keccak256(registry.getStealthMetaAddress(username))` so the payment is tied to
   the current registered value. This does not prove the derivation but rejects stale or arbitrary
   meta-addresses.
3. Document that the contract is a payment router, not a derivation verifier.

### L-01 — Permit front-running can grief `payByUsernameWithPermit`

**Location:** `contracts/ArcyPay.sol` (`payByUsernameWithPermit`)
**Severity:** Low
**Status:** Fixed

**Description.** The contract calls `USDC.permit(...)` with the payer's signature. An observer can
extract that signature from the mempool and submit the `permit` call first, consuming the nonce and
allowance. The victim's transaction then reverts. No funds can be stolen, because the spender is
always `address(this)` and the allowance can only be used by ArcyPay, but the payer pays gas and must
re-sign.

**Recommendation.** Tolerate an already-consumed permit:

```solidity
try IERC20Permit(USDC).permit(msg.sender, address(this), amount, deadline, v, r, s) {}
catch {
    require(IERC20(USDC).allowance(msg.sender, address(this)) >= amount, TransferFailed());
}
```

### L-02 — Anyone can announce, enabling spam and scanner cost amplification

**Location:** `contracts/ArcyAnnouncer.sol`
**Severity:** Low
**Status:** Accepted (inherent to permissionless announcements)

**Description.** Announcements are permissionless and unauthenticated. Every announcement forces
recipients to perform a secp256k1 scalar multiplication during scanning, so a cheap spam campaign
inflates scan time for everyone. This is inherent to the announcement model; ERC-5564 has the same
property.

**Recommendation.** Keep cryptographic verification, add per-log exception handling (M-01), consider a
small announce fee or batching in a future registry, and document scanning cost.

### L-03 — `announceWithRecipient` is a privacy footgun for integrators

**Location:** `contracts/ArcyAnnouncer.sol` (`announceWithRecipient`)
**Severity:** Low
**Status:** Fixed

**Description.** This helper publishes `recipientUsername` in an event, contradicting the privacy model.
The app never calls it, but an integrator can use it and permanently link a payment to a username.

**Recommendation.** Remove it, or rename/document it as privacy-reducing. The app should continue to
use only `announce`.

### L-04 — Meta-address is 132 bytes instead of 66, padding is unvalidated

**Location:** `contracts/ArcyRegistry.sol` (`_validateStealthMetaAddress`), `src/stealth.ts`
**Severity:** Low
**Status:** Fixed

**Description.** ERC-5564 defines a 66-byte meta-address (`spendingKey || viewingKey`). The contract
requires 132 bytes and the client appends 66 zero bytes. Nothing enforces that the padding is zero, so
registrants can store arbitrary data and the extra 66 bytes cost gas on every registration and update.
Different implementations will not interoperate.

**Recommendation.** Moving to 66 bytes is a breaking change and needs a migration. If 132 bytes is
kept, require the trailing 66 bytes to be zero:

```solidity
for (uint256 i = 66; i < 132; i++) {
    if (stealthMetaAddress[i] != 0) revert InvalidStealthMetaAddress();
}
```

Document the deviation clearly (already noted in `docs/ARCHITECTURE.md`).

### L-05 — No curve-point validation for meta-addresses or ephemeral keys

**Location:** `contracts/ArcyRegistry.sol`, `contracts/ArcyAnnouncer.sol`
**Severity:** Low
**Status:** Partially fixed (prefix checks only)

**Description.** Length is the only validation. A registrant can publish an invalid spending or viewing
key; senders then fail at `ProjectivePoint.fromHex` and cannot pay that username. Because only the
username owner can set the meta-address, this is self-harm or griefing of the name they own. For
ephemeral keys it becomes M-01.

**Recommendation.** Validate the compressed prefix and enforce zero padding (L-04); full point
validation is not feasible in Solidity without precompiles. Mirror the check in `ArcyAnnouncer` and keep
client-side exception handling.

### L-06 — Hardcoded USDC address and 6-decimal assumption

**Location:** `contracts/ArcyPay.sol` (`USDC` constant), `src/onchain-facts.ts`
**Severity:** Low
**Status:** Accepted

**Description.** `USDC` is a compile-time constant, so a different token or a changed Arc deployment
requires redeploying and updating the frontend. The frontend hardcodes 6 decimals. Verified onchain:
`decimals()` returns 6 and the permit domain matches, so this is correct today but silently fragile.

**Recommendation.** Keep as-is for the hackathon deployment. For production, pass the token address to
the constructor and read `decimals()` dynamically.

### L-07 — Registration is permanent and not transferable

**Location:** `contracts/ArcyRegistry.sol`
**Severity:** Low
**Status:** Fixed

**Description.** A username is bound to the registering address. There is no transfer, no recovery, and
no way to rotate ownership. If the wallet is lost, the username is permanently stuck even though
`updateStealthMetaAddress` still requires the same address. Releasing a username makes it immediately
available to anyone, so a released name can be sniped.

**Recommendation.** Add `transferUsername(address newOwner)` with an explicit two-step accept, or move
ownership to an ERC-721-style token. At minimum document the irreversibility and the release race.

### I-01 — No reentrancy guard around external calls

**Location:** `contracts/ArcyPay.sol`
**Severity:** Informational
**Status:** Accepted

**Description.** `payByUsername` calls USDC, then the announcer, then emits. There is no state to corrupt
and USDC is a trusted, non-hook token; the announcer is stateless. The ordering only affects event
ordering under a hypothetical malicious token. No exploit was found.

**Recommendation.** If the token address ever becomes configurable, add `nonReentrant` or follow
checks-effects-interactions.

### I-02 — Scan window is limited to the most recent 10,000 blocks

**Location:** `src/components/ScanView.tsx`
**Severity:** Informational
**Status:** Fixed

**Description.** Payments announced more than 10,000 blocks ago are not found by the UI. Funds remain
claimable with the correct announcement data, but the app cannot discover them.

**Recommendation.** Add a "full history" scan, a block explorer link, or a small indexer.

### I-03 — Permit signatures are not normalized

**Location:** `src/components/PayView.tsx`
**Severity:** Informational
**Status:** Fixed

**Description.** `v` is parsed from the last signature byte and passed through. Wallets returning
`v = 0/1` instead of `27/28`, or EIP-2098 compact 64-byte signatures, would produce a revert.

**Recommendation.** Normalize `v` (`v < 27 ? v + 27 : v`) and support 64-byte signatures.

### I-04 — Username edge cases and squatting

**Location:** `contracts/ArcyRegistry.sol` (`_isValidUsername`)
**Severity:** Informational
**Status:** Partially fixed (hyphen rule added)

**Description.** `-`, `--`, `1`, and `-abc` are valid. There are no reserved names, fees, or rate limits,
so short names can be squatted cheaply. The app's regex matches the contract.

**Recommendation.** Optional: reject leading/trailing hyphens, require at least one letter, reserve
short names, or add a registration fee.

### I-05 — Contracts are immutable, with no admin or upgrade path

**Severity:** Informational
**Status:** Accepted

**Description.** All three contracts are non-upgradeable and have no owner. This removes rug vectors and
admin key risk, at the cost of requiring a redeploy (and a frontend/address migration) for any fix.

**Recommendation.** Keep it. Document the redeploy procedure, which is already in `docs/DEPLOYMENT.md`.

### I-06 — `forge lint` gas notes on `keccak256(bytes(...))`

**Severity:** Informational
**Status:** Accepted

**Description.** `forge lint` emits `asm-keccak256` notes for hashing calldata strings. The compiler
optimizes acceptably and the calls are not in a hot loop over state.

**Recommendation.** No action.

## 6. Verified properties

- No privileged roles, no owner, no pause, no upgrade proxy, no self-destruct, no delegatecall.
- ArcyPay never holds funds: USDC moves directly from payer to stealth address.
- `ArcyPay` rejects zero amount, zero stealth address, and zero constructor arguments.
- Unregistered usernames cannot receive payments (`UsernameNotFound` bubbles up).
- Announcements carry no username and no recipient wallet.
- Registry state is keyed by `keccak256(username)`; one username per address; release clears all three
  mappings.
- Deployed bytecode matches the reviewed source (see section 2).
- USDC permit domain on Arc Testnet matches the frontend constants.
- 47 Foundry tests pass, including failure paths for both payment functions, permit front-running, key rotation, and username transfers.

## 7. Recommendations, ordered

- [x] Fix M-01 (per-log `try/catch` plus prefix validation in the scanner and announcer).
- [x] Add a confirmation screen showing the derived stealth address before signing (M-02).
- [x] Harden H-01: v2 derivation message with domain separation, UI warning, and an upgrade path.
- [x] Tolerate consumed permits in `payByUsernameWithPermit` (L-01).
- [x] Remove `announceWithRecipient` (L-03).
- [x] Keep 132 bytes but validate padding and the version byte (L-04).
- [x] Add a two-step username transfer path (L-07).
- [x] Add a full-history scan option (I-02) and normalize permit signatures (I-03).
- [ ] Redeploy ArcyRegistry, ArcyAnnouncer, and ArcyPay so the onchain fixes take effect.
- [ ] Obtain an independent professional audit before mainnet.
- [ ] Re-run this review after the redeploy and confirm bytecode parity again.

## 8. Pre-mainnet readiness addendum

Issues found while preparing the mainnet deployment and fixed in the working tree:

| ID | Severity | Finding | Fix |
|---|---|---|---|
| C-01 | Critical | Arc Mainnet chain ID was configured as `5042001`; the live network reports `5042` (verified with `cast chain-id`). The wrong value would break wallet chain switching, the USDC permit domain, explorer links, and v2 key derivation. The deployment docs repeated the wrong ID. | Constants and docs corrected to `5042`. USDC `name`, `version`, `decimals`, and `DOMAIN_SEPARATOR` on mainnet were verified against chain `5042`. |
| M-03 | Medium | Mainnet builds registered only Arc Testnet in the wagmi config, so the app could not switch to or read Arc Mainnet. | `src/config.ts` now selects `arc` (id `5042`) for mainnet builds and `arcTestnet` (id `5042002`) for testnet builds. |
| M-04 | Medium | A mainnet build with missing `VITE_*_MAINNET` variables silently used empty addresses. | Build-time validation; the app renders a configuration error screen listing the missing variables instead of the UI. |
| L-08 | Low | The Arc Studio trace bridge and console capture were bundled and active in production builds, patching `fetch`, `window.ethereum.request`, and `console`. | Loaded only under `import.meta.env.DEV`; the static import in `src/config.ts` was removed. |
| L-09 | Low | No user-facing risk disclosure. | Landing page now states that the software is experimental and unaudited. |

Mainnet deployment remains blocked on the contract redeploy in section 7 and on an independent
professional audit.

## 9. Disclaimer

This review was performed against a working tree and a live testnet deployment on 2026-10-27. It
covers the code in scope only and is not a guarantee of security. Obtain an independent professional
audit before deploying to Arc Mainnet or handling funds at scale.
