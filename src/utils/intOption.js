import { InvalidArgumentError } from 'commander';

/**
 * Commander parser for an integer option within [min, max]. Commander passes the
 * option's default as the parser's second argument, so a bare `parseInt` would
 * use it as the radix (`--limit 30` with default 20 → 60).
 */
export function intOption({ min = 0, max = Infinity } = {}) {
  return (value) => {
    const n = Number(value);
    if (!Number.isInteger(n) || n < min || n > max) {
      throw new InvalidArgumentError(
        max === Infinity ? `Must be an integer of at least ${min}.` : `Must be an integer from ${min} to ${max}.`
      );
    }
    return n;
  };
}
