// Buffer do navegador (pacote "buffer") com o encoding base64url, que a API usa
// nos tokens e o pacote não implementa.
import { Buffer } from 'buffer';

const toString = Buffer.prototype.toString;
Buffer.prototype.toString = function (enc, ...rest) {
  if (enc === 'base64url') return toString.call(this, 'base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return toString.call(this, enc, ...rest);
};

const from = Buffer.from;
Buffer.from = function (value, enc, ...rest) {
  if (enc === 'base64url' && typeof value === 'string') {
    let s = value.replace(/-/g, '+').replace(/_/g, '/');
    while (s.length % 4) s += '=';
    return from.call(Buffer, s, 'base64');
  }
  return from.call(Buffer, value, enc, ...rest);
};

globalThis.Buffer = Buffer;
export { Buffer };
