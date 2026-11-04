// Browser adapter for the preview core's synchronous UTF-8 SHA-256 contract.
import {sha256, toUtf8Bytes} from 'ethers';

export function createHash(algorithm) {
  if (algorithm !== 'sha256') throw Error('PREVIEW_HASH_ALGORITHM');
  return {
    update(text) {
      return {
        digest(encoding) {
          if (encoding !== 'hex') throw Error('PREVIEW_HASH_ENCODING');
          return sha256(toUtf8Bytes(text)).slice(2);
        },
      };
    },
  };
}
