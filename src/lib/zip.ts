// A zip file built in the browser, for the data export (account.ts). Files are stored, not compressed: recordings
// are compressed already and the JSON is small. No ZIP64, so each file and the whole archive must stay under 4 GB
// and 65,535 files, far beyond any export. Names are UTF-8 (general purpose flag bit 11), so accents survive.
// No imports on purpose: scripts/test-zip.mjs runs this file as it is and checks the result with a real unzip.

const TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (IEEE), as zip wants it. */
export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/** Zip keeps local time in two 16-bit words, to the even second, from 1980. */
function dos(d: Date) {
  const year = Math.max(1980, d.getFullYear());
  return {
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
  };
}

export type ZipFile = { name: string; data: Blob | string; modified?: Date };

const UTF8 = 0x0800;

/** One archive from the files, in order. `onFile` hears each one as it is added (for a progress line). */
export async function makeZip(files: ZipFile[], onFile?: (done: number, total: number) => void): Promise<Blob> {
  const enc = new TextEncoder();
  const parts: BlobPart[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (let i = 0; i < files.length; i++) {
    const f = files[i];
    const blob = typeof f.data === "string" ? new Blob([enc.encode(f.data)]) : f.data;
    // Read once for the checksum; the archive keeps the Blob itself, so no second copy of the bytes stays in memory.
    const crc = crc32(new Uint8Array(await blob.arrayBuffer()));
    const size = blob.size;
    const name = enc.encode(f.name);
    const { time, date } = dos(f.modified || new Date());

    const local = new Uint8Array(30 + name.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, UTF8, true);
    lv.setUint16(8, 0, true);
    lv.setUint16(10, time, true);
    lv.setUint16(12, date, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, size, true);
    lv.setUint32(22, size, true);
    lv.setUint16(26, name.length, true);
    lv.setUint16(28, 0, true);
    local.set(name, 30);

    const entry = new Uint8Array(46 + name.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, UTF8, true);
    cv.setUint16(10, 0, true);
    cv.setUint16(12, time, true);
    cv.setUint16(14, date, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, size, true);
    cv.setUint32(24, size, true);
    cv.setUint16(28, name.length, true);
    // extra, comment, disk, internal and external attributes: all zero
    cv.setUint32(42, offset, true);
    entry.set(name, 46);

    parts.push(local as BlobPart, blob);
    central.push(entry);
    offset += local.length + size;
    onFile?.(i + 1, files.length);
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  return new Blob([...parts, ...(central as BlobPart[]), end as BlobPart], { type: "application/zip" });
}
