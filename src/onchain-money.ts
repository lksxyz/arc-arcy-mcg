import { getUsdc, requireChain, USDC_DECIMALS } from '@/onchain-facts';

export type AmountErrorCode =
  | 'INVALID_DECIMALS'
  | 'INVALID_NUMBER'
  | 'TOO_MANY_FRACTION_DIGITS'
  | 'DECIMALS_MISMATCH'
  | 'PRECISION_LOSS'
  | 'DIVIDE_BY_ZERO'
  | 'EMPTY_SUM'
  | 'NO_USDC'
  | 'GAS_TOKEN_IS_NOT_USDC';

export class AmountError extends Error {
  readonly code: AmountErrorCode;

  constructor(code: AmountErrorCode, message: string) {
    super(message);
    this.name = 'AmountError';
    this.code = code;
  }
}

export type RescaleMode = 'exact' | 'trunc';

const NUMERIC_PATTERN = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

const MAX_DECIMALS = 36;

function assertValidDecimals(decimals: number): void {
  if (!Number.isSafeInteger(decimals) || decimals < 0 || decimals > MAX_DECIMALS) {
    throw new AmountError(
      'INVALID_DECIMALS',
      `Decimal count must be an integer in 0..${MAX_DECIMALS}, got ${decimals}`,
    );
  }
}

function pow10(exponent: number): bigint {
  return 10n ** BigInt(exponent);
}

function absBigInt(value: bigint): bigint {
  return value < 0n ? -value : value;
}

function trimTrailingZeros(digits: string): string {
  let end = digits.length;

  while (end > 0 && digits[end - 1] === '0') {
    end -= 1;
  }

  return digits.slice(0, end);
}

export function parseUnitsExact(value: string, decimals: number): bigint {
  assertValidDecimals(decimals);

  const trimmed = value.trim();

  if (!NUMERIC_PATTERN.test(trimmed)) {
    throw new AmountError('INVALID_NUMBER', `'${value}' is not a plain decimal number`);
  }

  const isNegative = trimmed.startsWith('-');
  const unsigned = isNegative ? trimmed.slice(1) : trimmed;
  const dotIndex = unsigned.indexOf('.');
  const whole = dotIndex === -1 ? unsigned : unsigned.slice(0, dotIndex);
  const fraction = dotIndex === -1 ? '' : unsigned.slice(dotIndex + 1);

  if (fraction.length > decimals) {
    throw new AmountError(
      'TOO_MANY_FRACTION_DIGITS',
      `'${value}' has ${fraction.length} fraction digits but this token has ${decimals}`,
    );
  }

  const digits = `${whole === '' ? '0' : whole}${fraction.padEnd(decimals, '0')}`;
  const magnitude = BigInt(digits);

  return isNegative ? -magnitude : magnitude;
}

export function formatUnitsExact(raw: bigint, decimals: number): string {
  assertValidDecimals(decimals);

  if (decimals === 0) {
    return raw.toString();
  }

  const sign = raw < 0n ? '-' : '';
  const digits = absBigInt(raw)
    .toString()
    .padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = trimTrailingZeros(digits.slice(digits.length - decimals));

  return fraction === '' ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}

export function formatUnitsFixed(raw: bigint, decimals: number, fractionDigits: number): string {
  assertValidDecimals(decimals);
  assertValidDecimals(fractionDigits);

  const sign = raw < 0n ? '-' : '';
  const digits = absBigInt(raw)
    .toString()
    .padStart(decimals + 1, '0');
  const whole = digits.slice(0, digits.length - decimals);
  const fraction = decimals === 0 ? '' : digits.slice(digits.length - decimals);

  if (fractionDigits === 0) {
    return `${sign}${whole}`;
  }

  return `${sign}${whole}.${fraction.slice(0, fractionDigits).padEnd(fractionDigits, '0')}`;
}

export function parseUsdc(value: string): bigint {
  return parseUnitsExact(value, USDC_DECIMALS);
}

export function formatUsdc(raw: bigint): string {
  return formatUnitsExact(raw, USDC_DECIMALS);
}

export class Amount {
  readonly raw: bigint;
  readonly decimals: number;

  private constructor(raw: bigint, decimals: number) {
    assertValidDecimals(decimals);
    this.raw = raw;
    this.decimals = decimals;
    Object.freeze(this);
  }

  static fromRaw(raw: bigint, decimals: number): Amount {
    return new Amount(raw, decimals);
  }

  static parse(value: string, decimals: number): Amount {
    return new Amount(parseUnitsExact(value, decimals), decimals);
  }

  static zero(decimals: number): Amount {
    return new Amount(0n, decimals);
  }

  static sum(amounts: readonly Amount[], decimals?: number): Amount {
    if (amounts.length === 0) {
      if (decimals === undefined) {
        throw new AmountError('EMPTY_SUM', 'Cannot sum an empty list without a decimal count to return zero in');
      }

      return Amount.zero(decimals);
    }

    return amounts.reduce((total, amount) => total.add(amount));
  }

  add(other: Amount): Amount {
    this.guardSameDecimals(other, 'add');

    return new Amount(this.raw + other.raw, this.decimals);
  }

  sub(other: Amount): Amount {
    this.guardSameDecimals(other, 'subtract');

    return new Amount(this.raw - other.raw, this.decimals);
  }

  mul(factor: bigint): Amount {
    return new Amount(this.raw * factor, this.decimals);
  }

  div(divisor: bigint): Amount {
    if (divisor === 0n) {
      throw new AmountError('DIVIDE_BY_ZERO', 'Cannot divide an amount by zero');
    }

    return new Amount(this.raw / divisor, this.decimals);
  }

  divmod(divisor: bigint): { quotient: Amount; remainder: Amount } {
    return { quotient: this.div(divisor), remainder: new Amount(this.raw % divisor, this.decimals) };
  }

  neg(): Amount {
    return new Amount(-this.raw, this.decimals);
  }

  abs(): Amount {
    return new Amount(absBigInt(this.raw), this.decimals);
  }

  toDecimals(decimals: number, mode: RescaleMode = 'exact'): Amount {
    assertValidDecimals(decimals);

    if (decimals === this.decimals) {
      return this;
    }

    if (decimals > this.decimals) {
      return new Amount(this.raw * pow10(decimals - this.decimals), decimals);
    }

    const divisor = pow10(this.decimals - decimals);
    const remainder = this.raw % divisor;

    if (remainder !== 0n && mode === 'exact') {
      throw new AmountError(
        'PRECISION_LOSS',
        `Rescaling ${this.toString()} from ${this.decimals} to ${decimals} decimals would drop ` +
          `${formatUnitsExact(remainder, this.decimals)} — pass 'trunc' to allow it`,
      );
    }

    return new Amount(this.raw / divisor, decimals);
  }

  compare(other: Amount): -1 | 0 | 1 {
    this.guardSameDecimals(other, 'compare');

    if (this.raw < other.raw) {
      return -1;
    }

    return this.raw > other.raw ? 1 : 0;
  }

  eq(other: Amount): boolean {
    return this.compare(other) === 0;
  }

  lt(other: Amount): boolean {
    return this.compare(other) < 0;
  }

  lte(other: Amount): boolean {
    return this.compare(other) <= 0;
  }

  gt(other: Amount): boolean {
    return this.compare(other) > 0;
  }

  gte(other: Amount): boolean {
    return this.compare(other) >= 0;
  }

  isZero(): boolean {
    return this.raw === 0n;
  }

  isNegative(): boolean {
    return this.raw < 0n;
  }

  isPositive(): boolean {
    return this.raw > 0n;
  }

  toString(): string {
    return formatUnitsExact(this.raw, this.decimals);
  }

  toFixed(fractionDigits: number): string {
    return formatUnitsFixed(this.raw, this.decimals, fractionDigits);
  }

  toJSON(): { raw: string; decimals: number } {
    return { raw: this.raw.toString(), decimals: this.decimals };
  }

  private guardSameDecimals(other: Amount, operation: string): void {
    if (other.decimals !== this.decimals) {
      throw new AmountError(
        'DECIMALS_MISMATCH',
        `Cannot ${operation} a ${other.decimals}-decimal amount and a ${this.decimals}-decimal amount — ` +
          'rescale one with toDecimals() first',
      );
    }
  }
}

export function usdcDecimalsFor(chainId: number): number {
  const usdc = getUsdc(chainId);

  if (!usdc) {
    throw new AmountError('NO_USDC', `Chain ${chainId} has no USDC contract in Arc Studio's onchain facts`);
  }

  return usdc.decimals;
}

export function gasTokenDecimalsFor(chainId: number): number {
  return requireChain(chainId).nativeCurrency.decimals;
}

export function parseAmount(chainId: number, value: string): Amount {
  return Amount.parse(value, usdcDecimalsFor(chainId));
}

export function formatAmount(chainId: number, amount: Amount): string {
  requireDecimals(amount, usdcDecimalsFor(chainId), 'ERC-20 USDC');

  return amount.toString();
}

export function parseGasAmount(chainId: number, value: string): Amount {
  return Amount.parse(value, gasTokenDecimalsFor(chainId));
}

export function formatGasAmount(chainId: number, amount: Amount): string {
  requireDecimals(amount, gasTokenDecimalsFor(chainId), 'gas token');

  return amount.toString();
}

export function isGasTokenUsdc(chainId: number): boolean {
  return requireChain(chainId).nativeCurrency.isUsdc;
}

export function usdcToGasToken(chainId: number, amount: Amount): Amount {
  requireGasTokenIsUsdc(chainId);
  requireDecimals(amount, usdcDecimalsFor(chainId), 'ERC-20 USDC');

  return amount.toDecimals(gasTokenDecimalsFor(chainId));
}

export function gasTokenToUsdc(chainId: number, amount: Amount, mode: RescaleMode = 'trunc'): Amount {
  requireGasTokenIsUsdc(chainId);
  requireDecimals(amount, gasTokenDecimalsFor(chainId), 'gas token');

  return amount.toDecimals(usdcDecimalsFor(chainId), mode);
}

function requireGasTokenIsUsdc(chainId: number): void {
  if (!isGasTokenUsdc(chainId)) {
    const chain = requireChain(chainId);

    throw new AmountError(
      'GAS_TOKEN_IS_NOT_USDC',
      `The gas token on ${chain.name} is ${chain.nativeCurrency.symbol}, not USDC — converting between it and ` +
        'USDC needs a price, not a rescale',
    );
  }
}

function requireDecimals(amount: Amount, expected: number, view: string): void {
  if (amount.decimals !== expected) {
    throw new AmountError(
      'DECIMALS_MISMATCH',
      `Expected a ${expected}-decimal ${view} amount but got a ${amount.decimals}-decimal one`,
    );
  }
}
