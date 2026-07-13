/**
 * Codeforces 适配器 — 在用户浏览器 CF 页面上执行提交
 */
const CF_ADAPTER = {
  platform: 'CODEFORCES',

  /** 检测当前 CF 登录账号 */
  detectLogin: () => {
    const profileLink = document.querySelector('a[href*="/profile/"]');
    if (!profileLink) return { loggedIn: false, handle: null };
    const handle = profileLink.textContent.trim();
    return { loggedIn: true, handle };
  },

  /** 提交代码 */
  submit: async (task) => {
    const { contestId, problemIndex, language, sourceCode } = task;

    // CF 语言映射
    const langMap = { cpp: '73', c: '61', python: '70', java: '60' };
    const programTypeId = langMap[language] || '73';

    // 获取提交页面的 CSRF token
    const submitUrl = `https://codeforces.com/problemset/submit/${contestId}/${problemIndex}`;

    return new Promise((resolve, reject) => {
      // 在 CF 域名下用 XMLHttpRequest
      const xhr = new XMLHttpRequest();

      // 第一步：获取提交页面
      const getSubmitPage = () => {
        xhr.open('GET', submitUrl, true);
        xhr.onload = () => {
          const html = xhr.responseText;
          const csrfMatch = html.match(/<meta name="X-Csrf-Token" content="([^"]+)"/);
          if (!csrfMatch) return reject('无法获取 CSRF token');

          const csrf = csrfMatch[1];
          const ftaa = Array.from({ length: 18 }, () =>
            Math.floor(Math.random() * 16).toString(16).join('');

          // 第二步：提交
          const formData = new URLSearchParams({
            csrf_token: csrf,
            ftaa,
            bfaa: 'f1b3f18c715565b589b7823cda7448ce',
            action: 'submitSolutionFormSubmitted',
            submittedProblemIndex: problemIndex,
            programTypeId,
            source: sourceCode,
            tabSize: '4',
            sourceFile: '',
            _tta: '594',
          });

          xhr.open('POST', `${submitUrl}?csrf_token=${encodeURIComponent(csrf)}`, true);
          xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
          xhr.onload = () => {
            // 从重定向 URL 提取 submission ID
            const finalUrl = xhr.responseURL || '';
            const match = finalUrl.match(/\/problemset\/status\/(\d+)\/my/);
            if (match) {
              resolve({ submissionId: parseInt(match[1]), submittedAt: new Date().toISOString() });
            } else {
              // 尝试从页面内容提取
              const bodyMatch = (xhr.responseText || '').match(/submission[Ii]d[=:]?\s*(\d+)/);
              if (bodyMatch) {
                resolve({ submissionId: parseInt(bodyMatch[1]), submittedAt: new Date().toISOString() });
              } else {
                reject('无法获取 Submission ID');
              }
            }
          };
          xhr.onerror = () => reject('CF 提交请求失败');
          xhr.send(formData.toString());
        };
        xhr.onerror = () => reject('无法获取 CF 提交页面');
        xhr.send();
      };

      getSubmitPage();
    });
  },

  /** 查询评测结果 */
  queryResult: async (submissionId) => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('GET', `https://codeforces.com/api/user.status?handle=__CURRENT__&from=1&count=10`, true);
      xhr.onload = () => {
        try {
          const data = JSON.parse(xhr.responseText);
          if (data.status !== 'OK') return reject('CF API 返回错误');
          const match = data.result.find((s) => s.id === submissionId);
          resolve(match || null);
        } catch (e) { reject('CF API 解析失败'); }
      };
      xhr.onerror = () => reject('CF 网络错误');
      xhr.send();
    });
  },
};
