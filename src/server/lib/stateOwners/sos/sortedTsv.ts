/** Binary search over a TSV sorted (LC_ALL=C) by its first column. No index in memory. */
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';

const fds = new Map<string, { fd: number; size: number }>();

function open(path: string) {
  let h = fds.get(path);
  if (!h) {
    const fd = openSync(path, 'r');
    h = { fd, size: fstatSync(fd).size };
    fds.set(path, h);
  }
  return h;
}

function lineAt(fd: number, pos: number, size: number): { start: number; line: string } {
  const buf = Buffer.alloc(4096);
  let start = pos;
  // back up to line start
  while (start > 0) {
    const from = Math.max(0, start - 4096);
    const n = readSync(fd, buf, 0, start - from, from);
    const idx = buf.subarray(0, n).lastIndexOf(10);
    if (idx >= 0) { start = from + idx + 1; break; }
    start = from;
  }
  let out = Buffer.alloc(0);
  let p = start;
  while (p < size) {
    const n = readSync(fd, buf, 0, 4096, p);
    if (!n) break;
    const idx = buf.subarray(0, n).indexOf(10);
    if (idx >= 0) { out = Buffer.concat([out, buf.subarray(0, idx)]); break; }
    out = Buffer.concat([out, buf.subarray(0, n)]);
    p += n;
  }
  return { start, line: out.toString('latin1') };
}

/** All rows whose first column equals key (max 25). */
export function sortedTsvLookup(path: string, key: string): string[][] {
  if (!key) return [];
  let h;
  try { h = open(path); } catch { return []; }
  let lo = 0;
  let hi = h.size;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const { start, line } = lineAt(h.fd, mid, h.size);
    const k = line.split('\t', 1)[0];
    if (k < key) lo = start + Buffer.byteLength(line, 'latin1') + 1;
    else hi = start;
    if (hi <= lo) break;
  }
  const out: string[][] = [];
  let pos = lo;
  while (pos < h.size && out.length < 25) {
    const { start, line } = lineAt(h.fd, pos, h.size);
    const cols = line.split('\t');
    if (cols[0] !== key) break;
    out.push(cols);
    pos = start + Buffer.byteLength(line, 'latin1') + 1;
  }
  return out;
}

export function closeSortedTsv(): void {
  for (const h of fds.values()) closeSync(h.fd);
  fds.clear();
}
