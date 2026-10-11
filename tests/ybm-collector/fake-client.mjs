import {EventEmitter} from 'node:events';

export class FakeClient {
  isInitialised = true;
  isOpen = true;
  events = new EventEmitter();
  calls = [];
  sent = [];
  async rpc(type, value) { this.calls.push({type, value}); return {}; }
  async sendMessage(value) { this.sent.push(value); }
  addEventListener(type, listener) { this.events.on(type, listener); }
  removeEventListener(type, listener) { this.events.off(type, listener); }
  emit(type, data) { this.events.emit(type, {data}); }
  disconnect() { this.isOpen = false; this.emit('connection-terminated', {}); }
}
