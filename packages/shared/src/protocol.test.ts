import { describe, expect, it } from 'vitest';
import { parseClientMessage, parseServerMessage } from './protocol';

describe('parseClientMessage / parseServerMessage', () => {
  it('parses a well-formed typed message', () => {
    expect(parseClientMessage('{"type":"ping"}')).toEqual({ type: 'ping' });
    expect(parseServerMessage('{"type":"pong"}')).toEqual({ type: 'pong' });
  });

  it('rejects malformed JSON', () => {
    expect(parseClientMessage('{nope')).toBeNull();
    expect(parseClientMessage('')).toBeNull();
  });

  it('rejects JSON without a string type discriminant', () => {
    expect(parseClientMessage('{"foo":1}')).toBeNull();
    expect(parseClientMessage('{"type":42}')).toBeNull();
    expect(parseClientMessage('"just a string"')).toBeNull();
    expect(parseClientMessage('null')).toBeNull();
    expect(parseClientMessage('[1,2]')).toBeNull();
  });
});
