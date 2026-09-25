/**
 * MikroTik API client — pure Node.js (no npm dependencies).
 * Implements the binary API protocol used by RouterOS 6.x on port 8728.
 * Compatible with RouterOS 6.43+ direct-password authentication.
 */

const net = require('net');

// ── Length encoding (MikroTik variable-length format) ────────────────────────

function encodeLength(len) {
  if (len < 0x80) return Buffer.from([len]);
  if (len < 0x4000) return Buffer.from([(len >> 8) | 0x80, len & 0xff]);
  if (len < 0x200000) return Buffer.from([(len >> 16) | 0xc0, (len >> 8) & 0xff, len & 0xff]);
  return Buffer.from([(len >> 24) | 0xe0, (len >> 16) & 0xff, (len >> 8) & 0xff, len & 0xff]);
}

function decodeLength(buf, offset) {
  if (offset >= buf.length) return null;
  const b = buf[offset];
  if ((b & 0x80) === 0) return { len: b, size: 1 };
  if ((b & 0xc0) === 0x80) {
    if (offset + 1 >= buf.length) return null;
    return { len: ((b & 0x3f) << 8) | buf[offset + 1], size: 2 };
  }
  if ((b & 0xe0) === 0xc0) {
    if (offset + 2 >= buf.length) return null;
    return { len: ((b & 0x1f) << 16) | (buf[offset + 1] << 8) | buf[offset + 2], size: 3 };
  }
  if (offset + 3 >= buf.length) return null;
  return {
    len: ((b & 0x0f) << 24) | (buf[offset + 1] << 16) | (buf[offset + 2] << 8) | buf[offset + 3],
    size: 4,
  };
}

// Build a sentence (array of strings → binary buffer ending with 0x00)
function buildSentence(words) {
  const parts = words.map(w => {
    const wb = Buffer.from(w, 'utf8');
    return Buffer.concat([encodeLength(wb.length), wb]);
  });
  parts.push(Buffer.from([0])); // end-of-sentence
  return Buffer.concat(parts);
}

// Parse =key=value words into a plain object
function parseAttrs(words) {
  const obj = {};
  for (const w of words) {
    if (w.startsWith('=')) {
      const idx = w.indexOf('=', 1);
      if (idx > 0) obj[w.slice(1, idx)] = w.slice(idx + 1);
    }
  }
  return obj;
}

// ── MikrotikConn ─────────────────────────────────────────────────────────────

class MikrotikConn {
  constructor({ host, port = 8728, timeout = 10000 }) {
    this.host = host;
    this.port = port;
    this.timeout = timeout;
    this.socket = null;
    this.recvBuf = Buffer.alloc(0);
    this.pendingWords = [];   // words being collected for the current sentence
    this.pendingReplies = []; // !re rows for the current command
    this.queue = [];          // { resolve, reject } for each in-flight command
  }

  // Connect and authenticate (RouterOS 6.43+ plain-password login)
  connect(user, password) {
    return new Promise((resolve, reject) => {
      const sock = new net.Socket();
      sock.setTimeout(this.timeout);
      this.socket = sock;

      const fail = (err) => {
        sock.destroy();
        reject(err);
      };

      sock.on('error', fail);
      sock.on('timeout', () => fail(new Error('Connection timed out')));
      sock.on('data', chunk => {
        this.recvBuf = Buffer.concat([this.recvBuf, chunk]);
        this._drain();
      });

      sock.connect(this.port, this.host, () => {
        // Replace the connect-time error handler with a runtime one
        sock.removeListener('error', fail);
        sock.on('error', err => {
          if (this.queue.length) {
            this.queue[0].reject(err);
            this.queue.shift();
          }
        });

        // RouterOS 6.43+ accepts plain password in the initial login sentence
        this._sendRaw(['/login', `=name=${user}`, `=password=${password}`])
          .then(() => resolve())
          .catch(reject);
      });
    });
  }

  // ── Public commands ─────────────────────────────────────────────────────────

  // Add a new record to a menu (e.g. /ppp/secret/add)
  add(menuPath, attrs) {
    const words = [`${menuPath}/add`];
    for (const [k, v] of Object.entries(attrs)) {
      words.push(`=${k}=${v}`);
    }
    return this._sendRaw(words);
  }

  // Fetch all records from a menu (e.g. /system/resource/print)
  get(menuPath) {
    return this._sendRaw([`${menuPath}/print`]);
  }

  // Update an existing record by .id
  set(menuPath, id, attrs) {
    const words = [`${menuPath}/set`, `=.id=${id}`];
    for (const [k, v] of Object.entries(attrs)) {
      words.push(`=${k}=${v}`);
    }
    return this._sendRaw(words);
  }

  // Remove a record by .id
  remove(menuPath, id) {
    return this._sendRaw([`${menuPath}/remove`, `=.id=${id}`]);
  }

  close() {
    this.socket?.destroy();
    this.socket = null;
  }

  // ── Internal ────────────────────────────────────────────────────────────────

  _sendRaw(words) {
    return new Promise((resolve, reject) => {
      this.queue.push({ resolve, reject });
      this.socket.write(buildSentence(words));
    });
  }

  // Parse incoming bytes into sentences and dispatch
  _drain() {
    let pos = 0;

    while (pos < this.recvBuf.length) {
      const ld = decodeLength(this.recvBuf, pos);
      if (!ld) break;               // need more bytes for the length header

      pos += ld.size;

      if (ld.len === 0) {
        // Empty word = end of sentence
        this._onSentence(this.pendingWords);
        this.pendingWords = [];
        continue;
      }

      if (pos + ld.len > this.recvBuf.length) {
        pos -= ld.size;             // back up — word body not fully received yet
        break;
      }

      this.pendingWords.push(this.recvBuf.slice(pos, pos + ld.len).toString('utf8'));
      pos += ld.len;
    }

    this.recvBuf = this.recvBuf.slice(pos);
  }

  _onSentence(words) {
    const type = words[0];          // '!re', '!done', '!trap', '!fatal'
    const attrs = parseAttrs(words.slice(1));

    if (type === '!re') {
      // Row of data — accumulate for the current command
      this.pendingReplies.push(attrs);
    } else if (type === '!done') {
      const pending = this.queue.shift();
      if (pending) pending.resolve([...this.pendingReplies]);
      this.pendingReplies = [];
    } else if (type === '!trap' || type === '!fatal') {
      const pending = this.queue.shift();
      if (pending) pending.reject(new Error(attrs.message || type));
      this.pendingReplies = [];
    }
  }
}

module.exports = { MikrotikConn };
