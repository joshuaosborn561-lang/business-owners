/**
 * Minimal ZIP reader: returns the first entry of an archive as a Buffer.
 * Enough for single-file public exports (CA ABC DailyExport-CSV.zip) without a dependency.
 * Supports stored (0) and deflate (8); uses the central directory so data descriptors are fine.
 */
import { inflateRawSync } from 'node:zlib';

export function firstZipEntry(buf: Buffer): Buffer | null {
  // End of central directory: signature 0x06054b50, search backwards (comment up to 64 KB).
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (cdOffset + 46 > buf.length || buf.readUInt32LE(cdOffset) !== 0x02014b50) return null;
  const method = buf.readUInt16LE(cdOffset + 10);
  const compSize = buf.readUInt32LE(cdOffset + 20);
  const localOffset = buf.readUInt32LE(cdOffset + 42);
  if (buf.readUInt32LE(localOffset) !== 0x04034b50) return null;
  const nameLen = buf.readUInt16LE(localOffset + 26);
  const extraLen = buf.readUInt16LE(localOffset + 28);
  const start = localOffset + 30 + nameLen + extraLen;
  const data = buf.subarray(start, start + compSize);
  if (method === 0) return Buffer.from(data);
  if (method === 8) return inflateRawSync(data);
  return null;
}
