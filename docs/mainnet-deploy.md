# arcy.me — Mainnet Deployment Checklist

Arc Studio does not deploy to mainnet. You run every step below from your own machine with your own wallet.

---

## Pre-deploy

- [ ] Obtain an independent professional audit of all three contracts
- [ ] Test the full flow on Arc Testnet (register → pay → scan → claim) with real users
- [ ] Confirm Arc Mainnet USDC permit details (name/version) match what is in `src/contracts.ts`
- [ ] Decide on a deployer wallet (hardware wallet recommended)
- [ ] Fund deployer wallet with enough Arc Mainnet USDC for gas

---

## 1. Install Foundry (if not already installed)

```bash
curl -L https://foundry.paradigm.xyz | bash
foundryup
```

---

## 2. Build contracts

```bash
cd contracts
forge build
```

---

## 3. Set environment variables

```bash
export PRIVATE_KEY=0x<your_deployer_private_key>
```

Never commit your private key. Use a `.env` file with `source .env` or a hardware wallet signer.

---

## 4. Deploy to Arc Mainnet

Arc Mainnet RPC: `https://rpc.mainnet.arc.io`

```bash
forge script contracts/script/DeployArcy.s.sol \
  --rpc-url https://rpc.mainnet.arc.io \
  --broadcast \
  --private-key $PRIVATE_KEY \
  -vvvv
```

Note the three deployed addresses from the output summary.

---

## 5. Update `.env` with mainnet contract addresses

```bash
VITE_NETWORK=mainnet
VITE_REGISTRY_MAINNET=0x<ArcyRegistry address>
VITE_ANNOUNCER_MAINNET=0x<ArcyAnnouncer address>
VITE_PAY_MAINNET=0x<ArcyPay address>
```

---

## 6. Verify contracts on Arc Explorer (optional but recommended)

```bash
forge verify-contract <address> contracts/ArcyRegistry.sol:ArcyRegistry \
  --rpc-url https://rpc.mainnet.arc.io \
  --verifier blockscout \
  --verifier-url https://explorer.arc.io/api
```

Repeat for ArcyAnnouncer and ArcyPay (include constructor args for ArcyPay).

---

## 7. Update `src/contracts.ts`

The `VITE_*_MAINNET` env vars are read automatically at build time. No code changes needed.

---

## 8. Build and deploy frontend

```bash
bun run build
```

Then deploy `dist/` to your hosting provider with `VITE_NETWORK=mainnet` set in the environment.

---

## 9. Post-deploy checks

- [ ] Visit `https://arcy.me/` — confirm "Arc Mainnet" badge in footer
- [ ] Register a test username on mainnet
- [ ] Send a small payment to the test username
- [ ] Scan and verify the payment appears
- [ ] Claim the payment and confirm funds arrive in wallet
- [ ] Check that `arcy.me/<username>` loads the pay page correctly

---

## Contract addresses (fill in after deploy)

| Contract       | Mainnet Address |
|---------------|-----------------|
| ArcyRegistry  | `—`             |
| ArcyAnnouncer | `—`             |
| ArcyPay       | `—`             |

Update `AGENTS.md` with these addresses after deploy.
