import { BadRequestException } from '@nestjs/common';
import type AdmZip from 'adm-zip';
import { inflateRawSync, createInflateRaw } from 'node:zlib';
import { Readable } from 'node:stream';

/** Streaming equivalent of readTestDataEntry, with the same size and CRC checks. */
export async function* streamTestDataEntry(entry: AdmZip.IZipEntry, maxBytes: number): AsyncGenerator<Buffer> {
  const { size, compressedSize, method, flags, crc } = entry.header;
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes || flags & 1 || ![0, 8].includes(method)) {
    throw new BadRequestException('测试数据 ZIP 条目大小、压缩方式或加密标记无效');
  }
  const compressed = entry.getCompressedData();
  if (compressed.length !== compressedSize) throw new BadRequestException('测试数据 ZIP 条目被截断');
  const source = Readable.from((function* () {
    for (let i = 0; i < compressed.length; i += 65536) yield compressed.subarray(i, i + 65536);
  })());
  const stream = method === 8 ? source.pipe(createInflateRaw()) : source;
  let length = 0, checksum = 0xffffffff;
  try {
    for await (const value of stream) {
      const data = Buffer.from(value);
      length += data.length;
      if (length > size || length > maxBytes) throw new Error('expansion limit');
      for (const byte of data) checksum = (checksum >>> 8) ^ crcTable[(checksum ^ byte) & 0xff];
      yield data;
    }
    if (length !== size || ((checksum ^ 0xffffffff) >>> 0) !== (crc >>> 0)) throw new Error('CRC/size mismatch');
  } catch {
    throw new BadRequestException(`测试文件 ${entry.entryName.slice(0, 120)} 损坏或实际大小超过限制`);
  } finally { source.destroy(); stream.destroy(); }
}

// ZIP uses the standard reflected CRC-32 polynomial (also works on Node 20).
const crcTable = Uint32Array.from({ length: 256 }, (_, index) => {
  let value = index;
  for (let bit = 0; bit < 8; bit++) value = (value >>> 1) ^ ((value & 1) ? 0xedb88320 : 0);
  return value >>> 0;
});

function crc32(data: Buffer): number {
  let crc = 0xffffffff;
  for (const byte of data) crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff];
  return (crc ^ 0xffffffff) >>> 0;
}

/** Never trust the advertised expansion ratio or permit unbounded zero-size inflation. */
export function readTestDataEntry(entry: AdmZip.IZipEntry, maxBytes: number): Buffer {
  const { size, compressedSize, method, flags, crc } = entry.header;
  const name = entry.entryName.slice(0, 120);
  if (!Number.isSafeInteger(size) || size < 0 || size > maxBytes) {
    throw new BadRequestException(`测试文件 ${name} 解压后大小超过限制`);
  }
  if (flags & 1) throw new BadRequestException('测试数据 ZIP 不支持加密，请移除密码后上传');
  if (method !== 0 && method !== 8) throw new BadRequestException('测试数据 ZIP 仅支持标准压缩或不压缩，请重新打包');

  let data: Buffer;
  try {
    const compressed = entry.getCompressedData();
    if (compressed.length !== compressedSize) throw new Error('Truncated entry');
    if (method === 0) {
      if (compressed.length !== size) throw new Error('Stored size mismatch');
      data = compressed;
    } else {
      // maxOutputLength=0 means unbounded in some implementations. A genuine empty
      // deflated stream must produce zero bytes; a forged zero-size bomb stops at 1.
      data = inflateRawSync(compressed, { maxOutputLength: Math.max(1, size) });
    }
  } catch {
    throw new BadRequestException(`测试文件 ${name} 损坏或实际解压大小超过限制，请重新打包`);
  }
  if (data.length !== size || crc32(data) !== (crc >>> 0)) {
    throw new BadRequestException(`测试文件 ${name} 长度或校验值不匹配，请重新打包`);
  }
  return data;
}
