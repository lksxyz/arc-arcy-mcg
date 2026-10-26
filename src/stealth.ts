/**
 * ERC-5564 SECP256k1 stealth address utilities.
 *
 * Stealth meta-address format (132 bytes total):
 *   bytes 0–32:   compressed spending public key (33 bytes)
 *   bytes 33–65:  compressed viewing public key  (33 bytes)
 *   (total: 66 bytes if only spending key, 132 if both)
 *
 * Wait — the contract validates stealthMetaAddress.length == 132.
 * ERC-5564 uses 33-byte compressed SECP256k1 keys.
 * So meta-address = spendingPubKey (33 bytes) + viewingPubKey (33 bytes) = 66 bytes.
 *
 * BUT the contract was written to require 132 bytes. We'll store
 * spendPubKey (33 bytes) + viewPubKey (33 bytes) padded to 132 bytes (66 real bytes + 66 zero bytes).
 * The frontend encodes/decodes accordingly.
 *
 * Stealth address generation (sender side):
 *   1. Generate random ephemeral key pair (r, R = r·G)
 *   2. Compute shared secret: s = keccak256(r · viewPubKey)
 *   3. Compute stealth pub: S = spendPubKey + s·G
 *   4. Stealth address = address(S)
 *
 * Scanning (recipient side):
 *   For each announcement (stealthAddress, ephemeralPubKey, viewTag):
 *   1. Compute shared secret: s = keccak256(viewPrivKey · ephemeralPubKey)
 *   2. viewTag check: first byte of s == announcement viewTag
 *   3. If match: compute s·G, add to spendPubKey → S
 *   4. If address(S) == stealthAddress → it's yours
 *   5. Stealth private key = spendPrivKey + s (mod n)
 */

import {
  secp256k1,
} from '@noble/curves/secp256k1'
import { keccak256, type Address, bytesToHex, hexToBytes, getAddress } from 'viem'

/** Number of bytes in one compressed secp256k1 public key */
const COMPRESSED_PUB_BYTES = 33

/**
 * Encode a pair of public keys (spending + viewing) into the 132-byte
 * stealth meta-address the contract expects.
 * We pad to 132 bytes: 33 + 33 = 66 real bytes, then 66 zero bytes.
 */
export function encodeStealthMetaAddress(
  spendingPubKey: Uint8Array,
  viewingPubKey: Uint8Array,
): `0x${string}` {
  if (spendingPubKey.length !== COMPRESSED_PUB_BYTES || viewingPubKey.length !== COMPRESSED_PUB_BYTES) {
    throw new Error('Public keys must be 33 bytes (compressed secp256k1)')
  }
  const buf = new Uint8Array(132)
  buf.set(spendingPubKey, 0)
  buf.set(viewingPubKey, 33)
  // bytes 66–131 are zero padding
  return bytesToHex(buf)
}

/**
 * Decode a 132-byte stealth meta-address back into spending + viewing public keys.
 */
export function decodeStealthMetaAddress(hex: `0x${string}`): {
  spendingPubKey: Uint8Array
  viewingPubKey: Uint8Array
} {
  const buf = hexToBytes(hex)
  if (buf.length !== 132) throw new Error('Invalid stealth meta-address length')
  return {
    spendingPubKey: buf.slice(0, 33),
    viewingPubKey: buf.slice(33, 66),
  }
}

/**
 * Derive stealth address + ephemeral key + viewTag from a stealth meta-address.
 * Called by the SENDER before paying.
 *
 * Returns:
 *  stealthAddress  — the one-time address to send USDC to
 *  ephemeralPubKey — 33-byte compressed pubkey, posted onchain
 *  viewTag         — 1-byte hint for fast scanning
 *  ephemeralPrivKey— ONLY needed if you want to double-check; don't expose
 */
export function generateStealthAddress(stealthMetaAddressHex: `0x${string}`): {
  stealthAddress: Address
  ephemeralPubKey: Uint8Array
  viewTag: Uint8Array // 1 byte
} {
  const { spendingPubKey, viewingPubKey } = decodeStealthMetaAddress(stealthMetaAddressHex)

  // 1. Generate ephemeral key pair
  const ephemeralPrivKey = secp256k1.utils.randomPrivateKey()
  const ephemeralPubKey = secp256k1.getPublicKey(ephemeralPrivKey, true) // compressed

  // 2. ECDH: multiply ephemeral privkey by recipient's viewing public key
  //    shared = ephemeralPrivKey * viewingPubKey (point on curve)
  const sharedPoint = secp256k1.ProjectivePoint.fromHex(
    bytesToHex(viewingPubKey).slice(2),
  ).multiply(BigInt('0x' + bytesToHex(ephemeralPrivKey).slice(2)))

  // 3. Hash the x-coordinate of the shared point
  const sharedSecret = keccak256(sharedPoint.toRawBytes(true)) // 32 bytes

  // 4. View tag = first byte of sharedSecret
  const viewTag = hexToBytes(sharedSecret).slice(0, 1)

  // 5. s = sharedSecret as scalar
  const s = BigInt(sharedSecret) % secp256k1.CURVE.n

  // 6. S = spendingPubKey + s*G
  const sG = secp256k1.ProjectivePoint.BASE.multiply(s)
  const spendingPoint = secp256k1.ProjectivePoint.fromHex(
    bytesToHex(spendingPubKey).slice(2),
  ).add(sG)

  // 7. Stealth address = keccak256(uncompressed public key)[12:]
  const uncompressedPub = spendingPoint.toRawBytes(false) // 65 bytes, uncompressed
  // Drop the 0x04 prefix (first byte), hash the remaining 64 bytes
  const pubKeyHash = keccak256(uncompressedPub.slice(1))
  const stealthAddress = getAddress('0x' + pubKeyHash.slice(26)) // last 20 bytes

  return { stealthAddress, ephemeralPubKey, viewTag }
}

/**
 * Check if an announcement belongs to this recipient.
 * Called by the RECIPIENT during scanning.
 */
export function checkStealthAddress({
  stealthAddress,
  ephemeralPubKeyHex,
  viewTagByte,
  viewingPrivKey,
  spendingPubKey,
}: {
  stealthAddress: Address
  ephemeralPubKeyHex: `0x${string}`
  viewTagByte: `0x${string}` // 1 byte, e.g. "0x1a"
  viewingPrivKey: bigint
  spendingPubKey: Uint8Array
}): boolean {
  const ephemeralPubKeyBytes = hexToBytes(ephemeralPubKeyHex)

  // 1. ECDH: viewingPrivKey * ephemeralPubKey
  const sharedPoint = secp256k1.ProjectivePoint.fromHex(
    bytesToHex(ephemeralPubKeyBytes).slice(2),
  ).multiply(viewingPrivKey)

  // 2. Hash x-coordinate
  const sharedSecret = keccak256(sharedPoint.toRawBytes(true))

  // 3. Fast view-tag check
  const computedViewTag = hexToBytes(sharedSecret)[0]
  const announcedViewTag = hexToBytes(viewTagByte)[0]
  if (computedViewTag !== announcedViewTag) return false

  // 4. s = sharedSecret scalar
  const s = BigInt(sharedSecret) % secp256k1.CURVE.n

  // 5. Compute expected stealth pub: spendPub + s*G
  const sG = secp256k1.ProjectivePoint.BASE.multiply(s)
  const expectedPoint = secp256k1.ProjectivePoint.fromHex(
    bytesToHex(spendingPubKey).slice(2),
  ).add(sG)

  // 6. Derive expected stealth address
  const uncompressedPub = expectedPoint.toRawBytes(false)
  const pubKeyHash = keccak256(uncompressedPub.slice(1))
  const expectedAddress = getAddress('0x' + pubKeyHash.slice(26))

  return expectedAddress.toLowerCase() === stealthAddress.toLowerCase()
}

/**
 * Compute the stealth private key so the recipient can sweep funds.
 */
export function computeStealthKey({
  ephemeralPubKeyHex,
  viewingPrivKey,
  spendingPrivKey,
}: {
  ephemeralPubKeyHex: `0x${string}`
  viewingPrivKey: bigint
  spendingPrivKey: bigint
}): bigint {
  const ephemeralPubKeyBytes = hexToBytes(ephemeralPubKeyHex)

  const sharedPoint = secp256k1.ProjectivePoint.fromHex(
    bytesToHex(ephemeralPubKeyBytes).slice(2),
  ).multiply(viewingPrivKey)

  const sharedSecret = keccak256(sharedPoint.toRawBytes(true))
  const s = BigInt(sharedSecret) % secp256k1.CURVE.n

  return (spendingPrivKey + s) % secp256k1.CURVE.n
}

/**
 * Derive the key pair from a private key.
 */
export function getKeyPair(privKeyHex: `0x${string}`): {
  privKey: bigint
  pubKey: Uint8Array
} {
  const privKey = BigInt(privKeyHex)
  const pubKey = secp256k1.getPublicKey(hexToBytes(privKeyHex), true)
  return { privKey, pubKey }
}

/**
 * Format a hex private key as a padded 32-byte hex string.
 */
export function padPrivKey(n: bigint): `0x${string}` {
  return ('0x' + n.toString(16).padStart(64, '0')) as `0x${string}`
}

/**
 * The message the wallet signs to derive stealth keys deterministically.
 * Fixed string — changing this invalidates all existing registrations.
 */
export const STEALTH_KEY_DERIVATION_MESSAGE =
  'arcy.me stealth keys v1\n\nSigning this message derives your private stealth keys.\nNever share this signature with anyone.'

/**
 * Derive spending + viewing private keys deterministically from a wallet signature.
 *
 * The signature (65 bytes) is split into two 32-byte halves:
 *   spendingPrivKey = keccak256("spend" || sig[0..32])
 *   viewingPrivKey  = keccak256("view"  || sig[0..32])
 *
 * Using keccak256 ensures the output is a valid scalar regardless of the raw sig bytes,
 * and the domain separation ("spend" vs "view") guarantees the two keys are independent.
 */
export function deriveStealthKeysFromSignature(signature: `0x${string}`): {
  spendingPrivKey: `0x${string}`
  viewingPrivKey: `0x${string}`
  spendingPubKey: Uint8Array
  viewingPubKey: Uint8Array
  stealthMetaAddress: `0x${string}`
} {
  const sigBytes = hexToBytes(signature)

  // Use first 32 bytes of signature as entropy (deterministic per wallet+message)
  const entropy = sigBytes.slice(0, 32)

  // Domain-separated derivation
  const spendInput = new Uint8Array(37) // "spend" (5) + 32
  spendInput.set(new TextEncoder().encode('spend'), 0)
  spendInput.set(entropy, 5)

  const viewInput = new Uint8Array(36) // "view" (4) + 32
  viewInput.set(new TextEncoder().encode('view'), 0)
  viewInput.set(entropy, 4)

  const spendHash = hexToBytes(keccak256(spendInput))
  const viewHash  = hexToBytes(keccak256(viewInput))

  // Clamp to valid secp256k1 scalar range (1 <= k < n)
  const n = secp256k1.CURVE.n
  const spendScalar = (BigInt(bytesToHex(spendHash)) % (n - 1n)) + 1n
  const viewScalar  = (BigInt(bytesToHex(viewHash))  % (n - 1n)) + 1n

  const spendingPrivKey = padPrivKey(spendScalar)
  const viewingPrivKey  = padPrivKey(viewScalar)

  const spendingPubKey = secp256k1.getPublicKey(hexToBytes(spendingPrivKey), true)
  const viewingPubKey  = secp256k1.getPublicKey(hexToBytes(viewingPrivKey),  true)

  const stealthMetaAddress = encodeStealthMetaAddress(spendingPubKey, viewingPubKey)

  return { spendingPrivKey, viewingPrivKey, spendingPubKey, viewingPubKey, stealthMetaAddress }
}
