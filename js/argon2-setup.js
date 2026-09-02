/* argon2-setup.js - wire argon2-browser into kdbxweb's Argon2id KDF.
 * Must run AFTER both window.kdbxweb and window.argon2 are loaded, and BEFORE any
 * .kdbx is loaded. KDBX4 uses Argon2id v1.3, which argon2-browser implements by default. */
(function () {
  'use strict';

  const kdbxweb = window.kdbxweb;
  const argon2 = window.argon2;
  if (!kdbxweb || !kdbxweb.CryptoEngine || !argon2) {
    console.error('argon2-setup: kdbxweb or argon2 not loaded; KDBX4 files will fail to unlock.');
    return;
  }

  kdbxweb.CryptoEngine.setArgon2Impl(function (password, salt, memory, iterations, length, parallelism, type) {
    // kdbxweb passes: password/salt as ArrayBuffer, memory in KiB, length in bytes, type 0=Argon2d/2=Argon2id.
    return argon2.hash({
      pass: new Uint8Array(password),
      salt: new Uint8Array(salt),
      time: iterations,
      mem: memory,
      hashLen: length,
      parallelism: parallelism,
      type: type,
    }).then(function (res) {
      const bytes = res.hash; // Uint8Array
      return bytes.buffer.slice(0, length);
    });
  });
})();
