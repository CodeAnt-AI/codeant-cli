import { Command } from 'commander';
import { describe, expect, it } from 'vitest';
import { intOption } from '../src/utils/intOption.js';

function parse(parser, defaultValue, argv) {
  const cmd = new Command().exitOverride().configureOutput({ writeErr: () => {} });
  cmd.option('--limit <n>', 'limit', parser, defaultValue);
  cmd.parse(argv, { from: 'user' });
  return cmd.opts().limit;
}

describe('intOption', () => {
  it('parses base 10 even though commander passes the default as the second argument', () => {
    expect(parse(intOption({ min: 1 }), 20, ['--limit', '30'])).toBe(30);
    expect(parse(intOption({ min: 1 }), 20, [])).toBe(20);
  });

  it.each([['0'], ['-1'], ['abc'], ['12abc'], ['1.5'], ['101']])('rejects %s', (value) => {
    expect(() => parse(intOption({ min: 1, max: 100 }), 20, ['--limit', value])).toThrow(/Must be an integer/);
  });

  it('accepts zero for offsets', () => {
    expect(parse(intOption(), 0, ['--limit', '0'])).toBe(0);
  });
});
