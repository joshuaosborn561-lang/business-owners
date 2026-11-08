/**
 * Streaming helpers for large public files: read one entry of a ZIP on disk as a stream (no whole-file buffer)
 * and parse CSV records across line breaks inside quotes. No dependencies.
 */
import { createReadStream, openSync, readSync, closeSync, fstatSync } from 'node:fs';
import { createInflateRaw } from 'node:zlib';
import { createInterface } from 'node:readline';
import type { Readable } from 'node:stream';

interface CdEntry {
  name: string;
  method: number;
  compSize: number;
  localOffset: number;
}

function readAt(fd: number, pos: number, len: number): Buffer {
  const buf = Buffer.alloc(len);
  let got = 0;
  while (got < len) {
    const n = readSync(fd, buf, got, len - got, pos + got);
    if (n <= 0) break;
    got += n;
  }
  return buf.subarray(0, got);
}

/** List entries from the central directory. Supports archives under 4 GB (no ZIP64), which covers the DOL files. */
export function zipEntries(path: string): CdEntry[] {
  const fd = openSync(path, 'r');
  try {
    const size = fstatSync(fd).size;
    const tailLen = Math.min(size, 22 + 0xffff);
    const tail = readAt(fd, size - tailLen, tailLen);
    let eocd = -1;
    for (let i = tail.length - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === 0x06054b50) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error('not a zip file (no end of central directory)');
    const count = tail.readUInt16LE(eocd + 10);
    const cdSize = tail.readUInt32LE(eocd + 12);
    const cdOffset = tail.readUInt32LE(eocd + 16);
    if (cdOffset === 0xffffffff) throw new Error('ZIP64 archives are not supported');
    const cd = readAt(fd, cdOffset, cdSize);
    const out: CdEntry[] = [];
    let p = 0;
    for (let i = 0; i < count && p + 46 <= cd.length; i++) {
      if (cd.readUInt32LE(p) !== 0x02014b50) break;
      const method = cd.readUInt16LE(p + 10);
      const compSize = cd.readUInt32LE(p + 20);
      const nameLen = cd.readUInt16LE(p + 28);
      const extraLen = cd.readUInt16LE(p + 30);
      const commentLen = cd.readUInt16LE(p + 32);
      const localOffset = cd.readUInt32LE(p + 42);
      const name = cd.subarray(p + 46, p + 46 + nameLen).toString('utf8');
      out.push({ name, method, compSize, localOffset });
      p += 46 + nameLen + extraLen + commentLen;
    }
    return out;
  } finally {
    closeSync(fd);
  }
}

/** Stream one entry's uncompressed bytes. */
export function zipEntryStream(path: string, match: (name: string) => boolean): Readable {
  const entry = zipEntries(path).find((e) => match(e.name));
  if (!entry) throw new Error('zip entry not found');
  const fd = openSync(path, 'r');
  let start: number;
  try {
    const lh = readAt(fd, entry.localOffset, 30);
    if (lh.readUInt32LE(0) !== 0x04034b50) throw new Error('bad local header');
    start = entry.localOffset + 30 + lh.readUInt16LE(26) + lh.readUInt16LE(28);
  } finally {
    closeSync(fd);
  }
  const raw = createReadStream(path, { start, end: start + entry.compSize - 1 });
  if (entry.method === 0) return raw;
  if (entry.method !== 8) throw new Error(`unsupported zip method ${entry.method}`);
  return raw.pipe(createInflateRaw());
}

/** Split one CSV record (RFC 4180 quoting). */
export function splitCsvRecord(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') q = false;
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else cur += ch;
  }
  out.push(cur);
  return out;
}

function quotesOpen(s: string): boolean {
  let n = 0;
  for (let i = 0; i < s.length; i++) if (s.charCodeAt(i) === 34) n++;
  return n % 2 === 1;
}

/** Yield header-keyed records from a CSV byte stream. Joins physical lines while a quote is open. */
export async function* csvRecords(stream: Readable, encoding: BufferEncoding = 'latin1'): AsyncGenerator<Record<string, string>> {
  stream.setEncoding(encoding);
  const rl = createInterface({ input: stream, crlfDelay: Infinity });
  let header: string[] | null = null;
  let pending = '';
  for await (const line of rl) {
    const rec = pending ? `${pending}\n${line}` : line;
    if (quotesOpen(rec)) {
      pending = rec;
      continue;
    }
    pending = '';
    if (!header) {
      header = splitCsvRecord(rec.replace(/^﻿/, '')).map((h) => h.trim());
      continue;
    }
    if (!rec) continue;
    const cells = splitCsvRecord(rec);
    const row: Record<string, string> = {};
    for (let i = 0; i < header.length; i++) row[header[i]] = cells[i] ?? '';
    yield row;
  }
}
