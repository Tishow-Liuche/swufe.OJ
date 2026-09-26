export function authoringRequestOptions(kind: 'save' | 'upload') {
  return { timeout: kind === 'upload' ? 15 * 60 * 1000 : 60 * 1000 };
}

export function authoringError(error: any, stage: string): string {
  if (['ECONNABORTED', 'ETIMEDOUT'].includes(error?.code)) {
    return `${stage}超时。服务器可能仍在处理，请先核对题目和测试点状态，不要连续重复保存。`;
  }
  if (error?.response?.status === 413) return `${stage}失败：请求超过服务器大小限制。`;
  const message = error?.response?.data?.message;
  if (message) return `${stage}失败：${Array.isArray(message) ? message.join('；') : message}`;
  return `${stage}失败：${error?.response ? `服务器返回 HTTP ${error.response.status}` : '网络连接中断或服务器无法访问'}。请保留当前编辑内容后重试。`;
}
