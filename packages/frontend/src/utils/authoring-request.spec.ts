import { expect, it } from 'vitest';
import { authoringRequestOptions, authoringError } from './authoring-request';

it('allows large uploads and version saves without changing ordinary API timeouts', () => {
  expect(authoringRequestOptions('upload').timeout).toBe(15 * 60 * 1000);
  expect(authoringRequestOptions('save').timeout).toBe(60 * 1000);
});
it('identifies the failed stage and warns that timeout is not a rollback', () => {
  expect(authoringError({ code: 'ECONNABORTED' }, '上传测试数据')).toContain('上传测试数据超时');
  expect(authoringError({ code: 'ECONNABORTED' }, '保存题目信息')).toContain('核对');
  expect(authoringError({ response: { status: 413 } }, '上传测试数据')).toContain('大小限制');
  expect(authoringError({ response: { data: { message: '缺少输出文件' } } }, '上传测试数据')).toContain('缺少输出文件');
  expect(authoringError({}, '保存题目信息')).toContain('网络');
});
