# 📜 Attributions & Acknowledgments

WebPass is built on top of open-source software, cryptographic specifications, and open standards. We gratefully acknowledge the creators and contributors of the following open-source projects, libraries, and specifications that made WebPass possible.

---

## 🛠️ Open-Source Libraries

### 1. `kdbxweb`
- **Description**: JavaScript library for reading, editing, creating, and saving KeePass `.kdbx` files directly in web browsers.
- **Author**: Antelle (Creator of [KeeWeb](https://keeweb.org))
- **Repository**: [https://github.com/keeweb/kdbxweb](https://github.com/keeweb/kdbxweb)
- **License**: [MIT License](https://github.com/keeweb/kdbxweb/blob/master/LICENSE)

---

### 2. `argon2-browser` (WebAssembly Bundle)
- **Description**: High-performance WebAssembly implementation of the Argon2 key derivation function (Argon2id / Argon2i / Argon2d) compiled for browser execution.
- **Authors**: Antelle and the Argon2 Reference C Implementation Contributors ([P-H-C/phc-winner-argon2](https://github.com/P-H-C/phc-winner-argon2))
- **Repository**: [https://github.com/antelle/argon2-browser](https://github.com/antelle/argon2-browser)
- **License**: [MIT License / Apache 2.0](https://github.com/antelle/argon2-browser/blob/master/LICENSE)

---

## 💡 Architectural & Format References

### 1. KeeWeb
- **Description**: The pioneering open-source web-based password manager that inspired WebPass's offline browser persistence architecture (IndexedDB session cache + Blob download exports).
- **Author**: Antelle
- **Website**: [https://keeweb.org](https://keeweb.org)
- **License**: [MIT License](https://github.com/keeweb/keeweb/blob/master/LICENSE)

---

### 2. KeePass Password Safe
- **Description**: The original open-source password manager created by Dominik Reichl. KeePass established the `.kdbx` container file format, XML database schema, standard entry fields, and security architecture.
- **Author**: Dominik Reichl
- **Website**: [https://keepass.info](https://keepass.info)
- **License**: [GNU General Public License (GPL) v2+](https://keepass.info/help/v2/license.html)

---

## ⚖️ Open-Source License Summaries

### The MIT License
> Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
>
> The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
>
> THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
