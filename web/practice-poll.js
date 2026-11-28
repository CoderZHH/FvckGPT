export class PracticePollingSignal extends EventTarget {
  readyState = WebSocket.CONNECTING;
  #id;
  #busy = false;
  #messages = [];
  #timer;
  #failures = 0;

  constructor(hello) {
    super();
    void this.#poll(hello);
  }

  send(message) {
    this.#messages.push(message);
    void this.#poll();
  }

  close(code = 1000) {
    if (this.readyState === WebSocket.CLOSED) return;
    this.readyState = WebSocket.CLOSED;
    clearTimeout(this.#timer);
    this.#messages.length = 0;
    if (this.#id) {
      void fetch('/practice-mailbox', { method: 'POST', keepalive: true,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'close', id: this.#id }),
      }).catch(() => {});
    }
    this.dispatchEvent(new CloseEvent('close', { code }));
  }

  async #poll(hello) {
    if (this.#busy || this.readyState === WebSocket.CLOSED) return;
    this.#busy = true;
    clearTimeout(this.#timer);
    const operation = hello ? { type: 'open', hello }
      : { type: 'exchange', id: this.#id, message: this.#messages.shift() };
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 7000);
    try {
      const response = await fetch('/practice-mailbox', { method: 'POST', signal: controller.signal,
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(operation) });
      if (response.status === 410) {
        this.close(1006);
        return;
      }
      if (!response.ok) throw new Error('pairing unavailable');
      const packet = await response.json();
      if (this.readyState === WebSocket.CLOSED) {
        if (hello && packet.id) void fetch('/practice-mailbox', { method: 'POST', keepalive: true,
          headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'close', id: packet.id }) }).catch(() => {});
        return;
      }
      this.#failures = 0;
      if (hello) this.#id = packet.id;
      if (packet.closeCode) {
        this.close(packet.closeCode);
        return;
      }
      if (hello) {
        this.readyState = WebSocket.OPEN;
        this.dispatchEvent(new Event('open'));
      }
      for (const message of packet.messages) this.dispatchEvent(new MessageEvent('message', { data: message }));
    } catch {
      // Idle polls are safe to request again after a brief tunnel interruption.
      if (!operation.message && ++this.#failures <= 2 && this.readyState !== WebSocket.CLOSED) {
        this.#timer = setTimeout(() => void this.#poll(hello), 750 * this.#failures);
      } else {
        this.close(1006);
      }
    } finally {
      clearTimeout(timeout);
      this.#busy = false;
      if (this.readyState === WebSocket.OPEN && !this.#failures) {
        this.#timer = setTimeout(() => void this.#poll(), this.#messages.length ? 0 : 450);
      }
    }
  }
}
