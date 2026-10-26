import {
  secp256k1,
} from '@noble/curves/secp256k1'
import { keccak256, type Address, bytesToHex, hexToBytes, getAddress } from 'viem'

const COMPRESSED_PUB_BYTES = 33
const META_BYTES = 132
const VERSION_INDEX = 131

export const META_VERSION_LEGACY = 0
export const META_VERSION_V2 = 2
export const CURRENT_META_VERSION = META_VERSION_V2

export function encodeStealthMetaAddress(
  spendingPubKey: Uint8Array,
  viewingPubKey: Uint8Array,
  version: number = CURRENT_META_VERSION,
): `0x${string}` {
  if (spendingPubKey.length !== COMPRESSED_PUB_BYTES || viewingPubKey.length !== COMPRESSED_PUB_BYTES) {
    throw new Error('Public keys must be 33 bytes (compressed secp256k1)')
  }
  if (version !== META_VERSION_LEGACY && version !== META_VERSION_V2) {
    throw new Error('Unsupported stealth meta-address version')
  }
  const buf = new Uint8Array(META_BYTES)
  buf.set(spendingPubKey, 0)
  buf.set(viewingPubKey, 33)
  buf[VERSION_INDEX] = version
  return bytesToHex(buf)
}

export function decodeStealthMetaAddress(hex: `0x${string}`): {
  spendingPubKey: Uint8Array
  viewingPubKey: Uint8Array
  version: number
} {
  const buf = hexToBytes(hex)
  if (buf.length !== META_BYTES) throw new Error('Invalid stealth meta-address length')
  const version = buf[VERSION_INDEX]
  if (version !== META_VERSION_LEGACY && version !== META_VERSION_V2) {
    throw new Error('Unsupported stealth meta-address version')
  }
  return {
    spendingPubKey: buf.slice(0, 33),
    viewingPubKey: buf.slice(33, 66),
    version,
  }
}

export function stealthMetaVersion(hex: `0x${string}`): number {
  try {
    return decodeStealthMetaAddress(hex).version
  } catch {
    return CURRENT_META_VERSION
  }
}

export function hasValidCompressedPrefix(hex: `0x${string}`): boolean {
  if (hex.length !== 68) return false
  const prefix = hex.slice(2, 4).toLowerCase()
  return prefix === '02' || prefix === '03'
}

export function generateStealthAddress(stealthMetaAddressHex: `0x${string}`): {
  stealthAddress: Address
  ephemeralPubKey: Uint8Array
  viewTag: Uint8Array
} {
  const { spendingPubKey, viewingPubKey } = decodeStealthMetaAddress(stealthMetaAddressHex)

  const ephemeralPrivKey = secp256k1.utils.randomPrivateKey()
  const ephemeralPubKey = secp256k1.getPublicKey(ephemeralPrivKey, true)

  const sharedPoint = secp256k1.ProjectivePoint.fromHex(
    bytesToHex(viewingPubKey).slice(2),
  ).multiply(BigInt('0x' + bytesToHex(ephemeralPrivKey).slice(2)))

  const sharedSecret = keccak256(sharedPoint.toRawBytes(true))

  const viewTag = hexToBytes(sharedSecret).slice(0, 1)

  const s = BigInt(sharedSecret) % secp256k1.CURVE.n

  const sG = secp256k1.ProjectivePoint.BASE.multiply(s)
  const spendingPoint = secp256k1.ProjectivePoint.fromHex(
    bytesToHex(spendingPubKey).slice(2),
  ).add(sG)

  const uncompressedPub = spendingPoint.toRawBytes(false)
  const pubKeyHash = keccak256(uncompressedPub.slice(1))
  const stealthAddress = getAddress('0x' + pubKeyHash.slice(26))

  return { stealthAddress, ephemeralPubKey, viewTag }
}

export function checkStealthAddress({
  stealthAddress,
  ephemeralPubKeyHex,
  viewTagByte,
  viewingPrivKey,
  spendingPubKey,
}: {
  stealthAddress: Address
  ephemeralPubKeyHex: `0x${string}`
  viewTagByte: `0x${string}`
  viewingPrivKey: bigint
  spendingPubKey: Uint8Array
}): boolean {
  const ephemeralPubKeyBytes = hexToBytes(ephemeralPubKeyHex)

  const sharedPoint = secp256k1.ProjectivePoint.fromHex(
    bytesToHex(ephemeralPubKeyBytes).slice(2),
  ).multiply(viewingPrivKey)

  const sharedSecret = keccak256(sharedPoint.toRawBytes(true))

  const computedViewTag = hexToBytes(sharedSecret)[0]
  const announcedViewTag = hexToBytes(viewTagByte)[0]
  if (computedViewTag !== announcedViewTag) return false

  const s = BigInt(sharedSecret) % secp256k1.CURVE.n

  const sG = secp256k1.ProjectivePoint.BASE.multiply(s)
  const expectedPoint = secp256k1.ProjectivePoint.fromHex(
    bytesToHex(spendingPubKey).slice(2),
  ).add(sG)

  const uncompressedPub = expectedPoint.toRawBytes(false)
  const pubKeyHash = keccak256(uncompressedPub.slice(1))
  const expectedAddress = getAddress('0x' + pubKeyHash.slice(26))

  return expectedAddress.toLowerCase() === stealthAddress.toLowerCase()
}

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

export function getKeyPair(privKeyHex: `0x${string}`): {
  privKey: bigint
  pubKey: Uint8Array
} {
  const privKey = BigInt(privKeyHex)
  const pubKey = secp256k1.getPublicKey(hexToBytes(privKeyHex), true)
  return { privKey, pubKey }
}

export function padPrivKey(n: bigint): `0x${string}` {
  return ('0x' + n.toString(16).padStart(64, '0')) as `0x${string}`
}

export const STEALTH_KEY_DERIVATION_MESSAGE_V1 =
  'arcy.me stealth keys v1\n\nSigning this message derives your private stealth keys.\nNever share this signature with anyone.'

export function stealthKeyDerivationMessage(version: number, chainId: number): string {
  if (version === META_VERSION_LEGACY) return STEALTH_KEY_DERIVATION_MESSAGE_V1

  return [
    'arcy.me stealth keys v2',
    '',
    'domain: arcy.me',
    `chain: ${chainId}`,
    'purpose: private USDC payments',
    '',
    'Signing this message derives the keys that control your stealth payments.',
    'Anyone who obtains this signature can spend them. Only sign this on arcy.me.',
  ].join('\n')
}

export function deriveStealthKeysFromSignature(
  signature: `0x${string}`,
  options: { version?: number; chainId: number },
): {
  spendingPrivKey: `0x${string}`
  viewingPrivKey: `0x${string}`
  spendingPubKey: Uint8Array
  viewingPubKey: Uint8Array
  stealthMetaAddress: `0x${string}`
  version: number
} {
  const version = options.version ?? CURRENT_META_VERSION
  const sigBytes = hexToBytes(signature)

  const entropy = version === META_VERSION_V2
    ? hexToBytes(keccak256(
        new Uint8Array([
          ...sigBytes,
          ...new TextEncoder().encode(`arcy.me/stealth-key/v2/${options.chainId}`),
        ]),
      ))
    : sigBytes.slice(0, 32)

  const spendInput = new Uint8Array(37)
  spendInput.set(new TextEncoder().encode('spend'), 0)
  spendInput.set(entropy, 5)

  const viewInput = new Uint8Array(36)
  viewInput.set(new TextEncoder().encode('view'), 0)
  viewInput.set(entropy, 4)

  const spendHash = hexToBytes(keccak256(spendInput))
  const viewHash  = hexToBytes(keccak256(viewInput))

  const n = secp256k1.CURVE.n
  const spendScalar = (BigInt(bytesToHex(spendHash)) % (n - 1n)) + 1n
  const viewScalar  = (BigInt(bytesToHex(viewHash))  % (n - 1n)) + 1n

  const spendingPrivKey = padPrivKey(spendScalar)
  const viewingPrivKey  = padPrivKey(viewScalar)

  const spendingPubKey = secp256k1.getPublicKey(hexToBytes(spendingPrivKey), true)
  const viewingPubKey  = secp256k1.getPublicKey(hexToBytes(viewingPrivKey),  true)

  const stealthMetaAddress = encodeStealthMetaAddress(spendingPubKey, viewingPubKey, version)

  return { spendingPrivKey, viewingPrivKey, spendingPubKey, viewingPubKey, stealthMetaAddress, version }
}
