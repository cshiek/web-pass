/* password.js - cryptographically secure password generator.
 * Attaches to window.WP.password */
(function () {
  'use strict';

  const UPPERCASE = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';
  const DIGITS = '0123456789';
  // Symbols safe for URLs/shells (no quotes, backslash, braces, or slashes).
  const SYMBOLS = '!@#$%^&*+=?';
  // Visually ambiguous characters removed when excludeAmbiguous is set.
  const AMBIGUOUS = '0Oo1Il9';

  function defaults() {
    return {
      length: 16,
      upper: true,
      lower: true,
      digits: true,
      symbols: false,
      excludeAmbiguous: true,
    };
  }

  // Uniform integer in [0, max) using rejection sampling on a CSPRNG uint32.
  // A single byte only covers max <= 256; passwords can be longer, so draw a
  // full 32-bit word (covers the 4096 max length) before rejecting.
  function randomInt(max) {
    const bound = 4294967296 - (4294967296 % max);
    const buf = new Uint8Array(4);
    let value;
    do {
      crypto.getRandomValues(buf);
      value = (buf[0] | (buf[1] << 8) | (buf[2] << 16) | (buf[3] << 24)) >>> 0;
    } while (value >= bound);
    return value % max;
  }

  function filterAmbiguous(str) {
    if (!AMBIGUOUS) return str;
    return str.split('').filter(function (c) { return AMBIGUOUS.indexOf(c) === -1; }).join('');
  }

  function generate(opts) {
    const o = Object.assign({}, defaults(), opts || {});
    o.length = Math.min(4096, Math.max(1, parseInt(o.length, 10) || 16));

    const sets = [];
    if (o.upper) sets.push(UPPERCASE);
    if (o.lower) sets.push(LOWERCASE);
    if (o.digits) sets.push(DIGITS);
    if (o.symbols) sets.push(SYMBOLS);
    if (sets.length === 0) { throw new Error('Select at least one character set.'); }

    // Only strip ambiguous characters when the caller asks for it.
    const filter = o.excludeAmbiguous ? filterAmbiguous : function (s) { return s; };
    const alphabet = filter(sets.join(''));
    if (!alphabet) { throw new Error('No valid characters for the selected options.'); }

    // Guarantee at least one character from each selected set.
    const required = sets.map(function (set) {
      const filtered = filter(set);
      return filtered ? filtered[randomInt(filtered.length)] : null;
    });

    const chars = new Array(o.length);
    for (let i = 0; i < o.length; i++) {
      chars[i] = (i < required.length && required[i]) ? required[i] : alphabet[randomInt(alphabet.length)];
    }

    // Shuffle so guaranteed characters are not always at the front.
    for (let i = chars.length - 1; i > 0; i--) {
      const j = randomInt(i + 1);
      const tmp = chars[i];
      chars[i] = chars[j];
      chars[j] = tmp;
    }
    return chars.join('');
  }

  WP.password = { generate, defaults };
})();
