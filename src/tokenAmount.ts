import Decimal from "decimal.js-light";
import JSBI from "jsbi";
import invariant from "tiny-invariant";
import { MAX_U256, MAX_U64, Rounding, ZERO } from "./constants";
import { Big, Fraction, NumberFormat } from "./fraction";
import { Percent } from "./percent";
import { Token } from "./token";
import { BigintIsh, makeDecimalMultiplier, parseBigintIsh } from "./utils";

export function validateU64(value: JSBI): void {
  invariant(
    JSBI.greaterThanOrEqual(value, ZERO),
    `${value.toString()} must be greater than zero`
  );
  invariant(
    JSBI.lessThanOrEqual(value, MAX_U64),
    `${value.toString()} overflows u64`
  );
}

export function validateU256(value: JSBI): void {
  invariant(
    JSBI.greaterThanOrEqual(value, ZERO),
    `${value.toString()} must be greater than zero`
  );
  invariant(
    JSBI.lessThanOrEqual(value, MAX_U256),
    `${value.toString()} overflows u64`
  );
}

export interface IFormatUint {
  /**
   * If specified, format this according to `toLocaleString`
   */
  numberFormatOptions?: Intl.NumberFormatOptions;
  /**
   * Locale of the number
   */
  locale?: string;
}

const stripTrailingZeroes = (num: string): string => {
  const [head, tail, ...rest] = num.split(".");
  if (rest.length > 0 || !head) {
    console.warn(`Invalid number passed to stripTrailingZeroes: ${num}`);
    return num;
  }
  if (!tail) {
    return num;
  }
  return `${head}.${tail.replace(/\.0+$/, "")}`;
};

export class TokenAmount<T extends Token<T>> extends Fraction {
  public readonly token: T;

  // amount _must_ be raw, i.e. in the native representation
  public constructor(
    token: T,
    amount: BigintIsh,
    validate?: (value: JSBI) => void
  ) {
    const parsedAmount = parseBigintIsh(amount);
    validate?.(parsedAmount);

    super(parsedAmount, makeDecimalMultiplier(token.decimals));
    this.token = token;
  }

  /**
   * Parses a token amount from a decimal representation.
   * @param token
   * @param uiAmount
   * @returns
   */
  public static parse<Tk extends Token<Tk>>(
    token: Tk,
    uiAmount: string
  ): TokenAmount<Tk> {
    return new TokenAmount<Tk>(
      token,
      JSBI.BigInt(
        new Decimal(uiAmount)
          .times(new Decimal(10).pow(token.decimals))
          .toFixed(0)
      )
    );
  }

  public get raw(): JSBI {
    return this.numerator;
  }

  public toSignificant(
    significantDigits = 6,
    format?: NumberFormat,
    rounding: Rounding = Rounding.ROUND_DOWN
  ): string {
    return super.toSignificant(significantDigits, format, rounding);
  }

  public toFixed(
    decimalPlaces: number = this.token.decimals,
    format?: NumberFormat,
    rounding: Rounding = Rounding.ROUND_DOWN
  ): string {
    invariant(decimalPlaces <= this.token.decimals, "DECIMALS");
    return super.toFixed(decimalPlaces, format, rounding);
  }

  public toExact(format: NumberFormat = { groupSeparator: "" }): string {
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    Big.DP = this.token.decimals;
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return,@typescript-eslint/no-unsafe-call,@typescript-eslint/no-unsafe-member-access
    return new Big(this.numerator)
      .div(this.denominator.toString())
      .toFormat(format);
  }

  public add(other: TokenAmount<T>): TokenAmount<T> {
    invariant(this.token.equals(other.token), "TOKEN");
    return new TokenAmount(this.token, JSBI.add(this.raw, other.raw));
  }

  public subtract(other: TokenAmount<T>): TokenAmount<T> {
    invariant(this.token.equals(other.token), "TOKEN");
    return new TokenAmount(this.token, JSBI.subtract(this.raw, other.raw));
  }

  /**
   * Gets this TokenAmount as a percentage of the other TokenAmount.
   * @param other
   * @returns
   */
  public divideByAmount(other: TokenAmount<T>): Percent {
    invariant(this.token.equals(other.token), "TOKEN");
    const frac = this.divide(other);
    return new Percent(frac.numerator, frac.denominator);
  }

  /**
   * Gets this TokenAmount as a percentage of the other TokenAmount.
   * @param other
   * @returns
   */
  public divideBy(other: Fraction): Percent {
    const frac = this.divide(other);
    return new Percent(frac.numerator, frac.denominator);
  }

  /**
   * Multiplies this token amount by a percent.
   * WARNING: this loses precision
   * @param percent
   * @returns
   */
  public multiplyBy(percent: Percent): TokenAmount<T> {
    return new TokenAmount(
      this.token,
      percent.asFraction.multiply(this.raw).toFixed(0)
    );
  }

  /**
   * Reduces this token amount by a percent.
   * WARNING: this loses precision
   * @param percent
   * @returns
   */
  public reduceBy(percent: Percent): TokenAmount<T> {
    return this.multiplyBy(new Percent(1, 1).subtract(percent));
  }

  /**
   * Formats this number using Intl.NumberFormatOptions
   * @param param0
   * @returns
   */
  public format({ numberFormatOptions, locale }: IFormatUint = {}): string {
    const asExactString = this.toFixed(this.token.decimals);
    const asNumber = parseFloat(asExactString);
    return `${
      numberFormatOptions !== undefined
        ? asNumber.toLocaleString(locale, numberFormatOptions)
        : stripTrailingZeroes(asExactString)
    }`;
  }
}