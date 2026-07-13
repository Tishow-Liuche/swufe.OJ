/**
 * OJ Helper Content Script — 注入到第三方 OJ 页面
 * 此文件在所有配置的 OJ 域名下自动加载
 * 提供页面信息提取能力
 */

// 暴露当前页面信息给 background script
(function() {
  if (window.__ojHelperInjected) return;
  window.__ojHelperInjected = true;

  // 检测当前 OJ 平台
  function detectPlatform() {
    const host = location.hostname;
    if (host.includes('codeforces.com')) return 'CODEFORCES';
    if (host.includes('luogu.com.cn')) return 'LUOGU';
    if (host.includes('nowcoder.com')) return 'NOWCODER';
    if (host.includes('qoj.ac')) return 'QOJ';
    return 'UNKNOWN';
  }

  // 检测登录用户名
  function detectLoginUser(platform) {
    switch (platform) {
      case 'CODEFORCES':
        const headerLink = document.querySelector('a[href*="/profile/"] span');
        return headerLink ? headerLink.textContent.trim() : null;
      case 'LUOGU':
        const userBtn = document.querySelector('.user-nav .nav-user');
        return userBtn ? userBtn.textContent.trim() : null;
      default:
        return null;
    }
  }

  // 暴露给 background 调用
  window.__ojHelper = {
    platform: detectPlatform(),
    loginUser: detectLoginUser(detectPlatform()),
  };
})();
