export function sourceSizeError(source: string): string {
  return new TextEncoder().encode(source).byteLength > 4 * 1024 * 1024
    ? '源代码超过 4 MiB 上限（按 UTF-8 字节计算，与运行内存限制无关）' : '';
}
