'use strict';
class History {
  constructor(entries = [], clock = Date.now) { this.entries = entries.slice(-300); this.clock = clock; }
  add(message, details = {}) {
    const entry = { at: this.clock(), message: String(message).slice(0, 1000), ...details };
    this.entries.push(entry); this.entries = this.entries.slice(-300); return entry;
  }
}
module.exports = History;
