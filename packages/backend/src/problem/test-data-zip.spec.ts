import { BadRequestException } from '@nestjs/common';
import AdmZip from 'adm-zip';
import { deflateRawSync } from 'node:zlib';
import { readTestDataEntry, streamTestDataEntry } from './test-data-zip';
import { StringDecoder } from 'node:string_decoder';

function entry(content: Buffer, method = 8): AdmZip.IZipEntry {
  const zip = new AdmZip();
  zip.addFile('1.in', content);
  zip.getEntry('1.in')!.header.method = method;
  return new AdmZip(zip.toBuffer()).getEntries()[0];
}

describe('bounded ZIP entry decoder', () => {
  async function streamed(e: AdmZip.IZipEntry, maxBytes = 1000000) {
    const decoder = new StringDecoder('utf8'); let text = '';
    for await (const chunk of streamTestDataEntry(e, maxBytes)) text += decoder.write(chunk);
    return text + decoder.end();
  }
  it.each([0, 8])('streams method %i preserving UTF-8 at chunk boundaries', async method => {
    const text = 'a'.repeat(16383) + '测试🙂'.repeat(10000);
    expect(await streamed(entry(Buffer.from(text), method))).toBe(text);
  });
  it.each(['crc', 'size', 'truncated', 'encrypted', 'method'])('rejects malformed streamed entry: %s', async kind => {
    const e = entry(Buffer.from('123456789'));
    if (kind === 'crc') e.header.crc = 0;
    if (kind === 'size') e.header.size = 0;
    if (kind === 'encrypted') e.header.flags |= 1;
    if (kind === 'method') e.header.method = 99;
    if (kind === 'truncated') {
      const compressed = e.getCompressedData();
      jest.spyOn(e, 'getCompressedData').mockReturnValue(compressed.subarray(0, -1));
    }
    await expect(streamed(e)).rejects.toThrow(BadRequestException);
  });
  it.each([0, 8])('supports ZIP method %i with known CRC-32 test vector', method => {
    const e = entry(Buffer.from('123456789'), method);
    expect(e.header.crc).toBe(0xcbf43926);
    expect(readTestDataEntry(e, 10)).toEqual(Buffer.from('123456789'));
  });

  it('allows an empty deflated stream without an unbounded decoder', () => {
    const e = entry(Buffer.alloc(0));
    const compressed = deflateRawSync(Buffer.alloc(0));
    e.header.method = 8;
    e.header.compressedSize = compressed.length;
    jest.spyOn(e, 'getCompressedData').mockReturnValue(compressed);
    expect(readTestDataEntry(e, 10)).toEqual(Buffer.alloc(0));
  });

  it('enforces the absolute size limit before touching compressed data', () => {
    const e = entry(Buffer.from('123456789'));
    const spy = jest.spyOn(e, 'getCompressedData');
    expect(() => readTestDataEntry(e, 8)).toThrow(BadRequestException);
    expect(spy).not.toHaveBeenCalled();
  });

  it.each([0, 8])('rejects declared/actual length mismatch for method %i', method => {
    const e = entry(Buffer.from('123456789'), method);
    e.header.size = 2;
    expect(() => readTestDataEntry(e, 10)).toThrow(BadRequestException);
  });

  it('rejects a larger declared size instead of adding padding', () => {
    const e = entry(Buffer.from('abc'));
    e.header.size = 10;
    expect(() => readTestDataEntry(e, 10)).toThrow('长度或校验值');
  });

  it('rejects encryption and unsupported methods before extraction', () => {
    for (const mutate of [(e: AdmZip.IZipEntry) => { e.header.flags |= 1; }, (e: AdmZip.IZipEntry) => { e.header.method = 99; }]) {
      const e = entry(Buffer.from('abc'));
      mutate(e);
      const spy = jest.spyOn(e, 'getCompressedData');
      expect(() => readTestDataEntry(e, 10)).toThrow(BadRequestException);
      expect(spy).not.toHaveBeenCalled();
    }
  });

  it('rejects truncated compressed data', () => {
    const e = entry(Buffer.from('123456789'));
    const compressed = e.getCompressedData();
    jest.spyOn(e, 'getCompressedData').mockReturnValue(compressed.subarray(0, -1));
    expect(() => readTestDataEntry(e, 10)).toThrow(BadRequestException);
  });
});
