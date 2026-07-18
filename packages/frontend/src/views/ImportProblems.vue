<script setup lang="ts">
import { ref } from 'vue';
import api from '../api/client';
import { pointDifficultyOptions, pointDifficultyShortLabel } from '../utils/pointDifficulty';

// 导入状态
const importing = ref(false);
const importResult = ref<any>(null);
const error = ref('');

// 手动输入题目
const manualProblem = ref({
  title: '',
  description: '',
  difficulty: 'POINT_1',
  timeLimit: 1000,
  memoryLimit: 256,
  tags: '',
});
const qojRemoteId = ref('1');
const qojPage = ref(1);
const qojPageSize = ref(20);

const difficulties = pointDifficultyOptions;

// P1000-P1010 洛谷题目数据
const luoguSeedData = [
  {
    title: 'P1000 超级玛丽游戏',
    difficulty: 'POINT_1',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['模拟', '字符串', '入门'],
    description: `## 题目描述\n超级玛丽是一个非常经典的游戏。请你用字符画的形式输出超级玛丽中的一个场景。\n\n## 输入格式\n无。\n\n## 输出格式\n如描述所示。\n\n## 输入输出样例\n### 输入\n\`\`\`\n（无）\n\`\`\`\n\n### 输出\n\`\`\`\n                ********\n               ************\n               ####....#.\n             #..###.....##....\n             ###.......######              ###            ###\n                ...........               #...#          #...#\n               ##*##*##*##               #.#.#          #.#.#\n            #####*******######\n           ##***##*******##***##\n           ##***##*******##***##\n           ##***##*******##***##\n            #####*******######\n               ##*##*##*##\n               ##########\n            ###############\n\`\`\``,
    testCases: [{ input: '', expectedOutput: '' }],
  },
  {
    title: 'P1001 A+B Problem',
    difficulty: 'POINT_0',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['模拟', '入门', '数学'],
    description: `## 题目描述\n输入两个整数 $a, b$，输出它们的和（$|a|,|b| \\le {10}^9$）。\n\n## 输入格式\n两个整数，以空格分开。\n\n## 输出格式\n一个整数。\n\n## 输入输出样例\n### 输入 #1\n\`\`\`\n20 30\n\`\`\`\n\n### 输出 #1\n\`\`\`\n50\n\`\`\`\n\n## 说明/提示\n注意数据范围！`,
    testCases: [
      { input: '1 2\n', expectedOutput: '3\n' },
      { input: '20 30\n', expectedOutput: '50\n' },
      { input: '-5 8\n', expectedOutput: '3\n' },
      { input: '1000000000 1000000000\n', expectedOutput: '2000000000\n' },
      { input: '0 0\n', expectedOutput: '0\n' },
    ],
  },
  {
    title: 'P1002 [NOIP2002 普及组] 过河卒',
    difficulty: 'POINT_1',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['动态规划', '递推', 'NOIP'],
    description: `## 题目描述\n棋盘上 $A$ 点有一个过河卒，需要走到目标 $B$ 点。卒行走的规则：可以向下、或者向右。同时在棋盘上 $C$ 点有一个对方的马，该马所在的点和所有跳跃一步可达的点称为对方马的控制点。因此称之为"马拦过河卒"。\n\n棋盘用坐标表示，$A$ 点 $(0, 0)$、$B$ 点 $(n, m)$，同样马的位置坐标是需要给出的。\n\n现在要求你计算出卒从 $A$ 点能够到达 $B$ 点的路径的条数，假设马的位置是固定不动的，并不是卒走一步马走一步。\n\n## 输入格式\n一行四个正整数，分别表示 $B$ 点坐标和马 $C$ 的坐标。\n\n## 输出格式\n一个整数，表示所有的路径条数。\n\n## 输入输出样例\n### 输入 #1\n\`\`\`\n6 6 3 3\n\`\`\`\n\n### 输出 #1\n\`\`\`\n6\n\`\`\`\n\n## 说明/提示\n对于 $100 \\%$ 的数据，$1 \\le n, m \\le 20$，$0 \\le$ 马的坐标 $\\le 20$。`,
    testCases: [
      { input: '6 6 3 3\n', expectedOutput: '6\n' },
      { input: '8 6 0 4\n', expectedOutput: '1617\n' },
      { input: '1 1 0 0\n', expectedOutput: '0\n' },
    ],
  },
  {
    title: 'P1003 [NOIP2011 提高组] 铺地毯',
    difficulty: 'POINT_1',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['模拟', '枚举', 'NOIP'],
    description: `## 题目描述\n为了准备一个独特的颁奖典礼，组织者在会场的一片矩形区域铺上一些矩形地毯。一共有 $n$ 张地毯，编号从 $1$ 到 $n$。现在将这些地毯按照编号从小到大的顺序平行于坐标轴先后铺设，后铺的地毯覆盖在前面已经铺好的地毯之上。\n\n地毯铺设完成后，组织者想知道覆盖地面某个点的最上面的那张地毯的编号。\n\n## 输入格式\n第一行，一个整数 $n$，表示总共有 $n$ 张地毯。\n\n接下来的 $n$ 行中，第 $i$ 行有四个整数 $a, b, g, k$，表示第 $i$ 张地毯左下角的坐标 $(a, b)$ 以及地毯在 $x$ 轴和 $y$ 轴方向的长度。\n\n第 $n + 2$ 行包含两个整数 $x$ 和 $y$，表示所求的地面的点的坐标 $(x, y)$。\n\n## 输出格式\n输出共 $1$ 行，一个整数，表示所求的地毯的编号；若此处没有被地毯覆盖则输出 \`-1\`。\n\n## 输入输出样例\n### 输入 #1\n\`\`\`\n3\n1 0 2 3\n0 2 3 3\n2 1 3 3\n2 2\n\`\`\`\n\n### 输出 #1\n\`\`\`\n3\n\`\`\``,
    testCases: [
      { input: '3\n1 0 2 3\n0 2 3 3\n2 1 3 3\n2 2\n', expectedOutput: '3\n' },
      { input: '3\n1 0 2 3\n0 2 3 3\n2 1 3 3\n4 5\n', expectedOutput: '-1\n' },
    ],
  },
  {
    title: 'P1004 [NOIP2000 提高组] 方格取数',
    difficulty: 'POINT_2',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['动态规划', '多维DP', 'NOIP'],
    description: `## 题目描述\n设有 $N \\times N$ 的方格图 $(N \\le 9)$，我们将其中的某些方格中填入正整数，而其他的方格中则放入数字 $0$。\n\n某人从图的左上角的 $A$ 点出发，可以向下行走，也可以向右走，直到到达右下角的 $B$ 点。在走过的路上，他可以取走方格中的数（取走后的方格中将变为数字 $0$）。\n此人从 $A$ 点到 $B$ 点共走两次，试找出 $2$ 条这样的路径，使得取得的数之和为最大。\n\n## 输入格式\n输入的第一行为一个整数 $N$（表示 $N \\times N$ 的方格图），接下来的每行有三个整数，前两个表示位置，第三个数为该位置上所放的数。一行单独的 $0$ 表示输入结束。\n\n## 输出格式\n只需输出一个整数，表示 $2$ 条路径上取得的最大的和。\n\n## 输入输出样例\n### 输入 #1\n\`\`\`\n8\n2 3 13\n2 6 6\n3 5 7\n4 4 14\n5 2 21\n5 6 4\n6 3 15\n7 2 14\n0 0 0\n\`\`\`\n\n### 输出 #1\n\`\`\`\n67\n\`\`\``,
    testCases: [{ input: '8\n2 3 13\n2 6 6\n3 5 7\n4 4 14\n5 2 21\n5 6 4\n6 3 15\n7 2 14\n0 0 0\n', expectedOutput: '67\n' }],
  },
  {
    title: 'P1005 [NOIP2007 提高组] 矩阵取数游戏',
    difficulty: 'POINT_2',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['动态规划', '区间DP', '高精度', 'NOIP'],
    description: `## 题目描述\n帅帅经常跟同学玩一个矩阵取数游戏：对于一个给定的 $n \\times m$ 的矩阵，矩阵中的每个元素 $a_{i,j}$ 均为非负整数。游戏规则如下：\n\n1. 每次取数时须从每行各取走一个元素，共 $n$ 个。经过 $m$ 次后取完矩阵内所有元素；\n2. 每次取走的各个元素只能是该元素所在行的行首或行尾；\n3. 每次取数都有一个得分值，为每行取数的得分之和，每行取数的得分 = 被取走的元素值 $\\times 2^i$，其中 $i$ 表示第 $i$ 次取数（从 $1$ 开始编号）；\n4. 游戏结束总得分为 $m$ 次取数得分之和。\n\n帅帅想请你帮忙写一个程序，对于任意矩阵，可以求出取数后的最大得分。\n\n## 输入格式\n第一行两个整数 $n, m$。\n接下来 $n$ 行每行 $m$ 个非负整数。\n\n## 输出格式\n一个整数，为最大得分。\n\n## 输入输出样例\n### 输入 #1\n\`\`\`\n2 3\n1 2 3\n3 4 2\n\`\`\`\n\n### 输出 #1\n\`\`\`\n82\n\`\`\``,
    testCases: [{ input: '2 3\n1 2 3\n3 4 2\n', expectedOutput: '82\n' }],
  },
  {
    title: 'P1006 [NOIP2008 提高组] 传纸条',
    difficulty: 'POINT_2',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['动态规划', '多维DP', 'NOIP'],
    description: `## 题目描述\n小渊和小轩是好朋友也是同班同学，他们在一起总有谈不完的话题。在一次活动课上，班上同学安排成一个 $m$ 行 $n$ 列的矩阵。坐在矩阵对角线的两端。\n\n班干部手上拿着一张纸条，纸条需要通过传纸条的方式传给对方。传纸条需要许多同学帮忙，每位同学可以帮助他们传递，但只会帮他们一次。\n\n每个同学愿意帮忙的好感度有高有低（注意：小渊和小轩的好心程度没有定义），可以用一个 $[0,100]$ 内的自然数来表示。请找出一条从小渊传到小轩的路径，和一条从小轩传回小渊的路径，使得这两条路径上同学的好心程度之和最大。\n\n## 输入格式\n第一行有 $2$ 个用空格隔开的整数 $m$ 和 $n$。\n接下来的 $m$ 行是一个 $m \\times n$ 的矩阵。\n\n## 输出格式\n一个整数，表示两条路径上同学的好心程度之和的最大值。\n\n## 输入输出样例\n### 输入 #1\n\`\`\`\n3 3\n0 3 9\n2 8 5\n5 7 0\n\`\`\`\n\n### 输出 #1\n\`\`\`\n34\n\`\`\``,
    testCases: [{ input: '3 3\n0 3 9\n2 8 5\n5 7 0\n', expectedOutput: '34\n' }],
  },
  {
    title: 'P1007 独木桥',
    difficulty: 'POINT_1',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['思维', '模拟', '贪心'],
    description: `## 题目描述\n战争已经进入到紧要关头。你是一支小分队的队长，带领你的部队通过敌军的一座独木桥。桥太窄了，一次只能容一个人通过。而天又下着大雨，所以桥上很滑。\n\n突然，你收到情报，敌军已经向独木桥的另一端派出了炸弹小队！你必须尽快让你的部队通过独木桥。\n\n已知桥的长度为 $L$，士兵们初始坐标互不相同且均为整数点。每个士兵速度为 $1$ 单位/秒。士兵相遇时会同时转身向相反方向走。请问所有士兵离开独木桥的最短时间和最长时间。\n\n## 输入格式\n第一行一个整数 $L$，表示独木桥的长度。\n第二行一个整数 $N$，表示士兵数目。\n第三行共 $N$ 个整数 $a_i$，表示每个士兵的初始坐标。\n\n## 输出格式\n两个整数，分别表示所有士兵离开独木桥的最短时间和最长时间。\n\n## 输入输出样例\n### 输入 #1\n\`\`\`\n10\n3\n2 6 7\n\`\`\`\n\n### 输出 #1\n\`\`\`\n4 8\n\`\`\``,
    testCases: [{ input: '10\n3\n2 6 7\n', expectedOutput: '4 8\n' }],
  },
  {
    title: 'P1008 [NOIP1998 普及组] 三连击',
    difficulty: 'POINT_1',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['枚举', '暴力', 'DFS', 'NOIP'],
    description: `## 题目描述\n将 $1, 2, \\ldots , 9$ 共 $9$ 个数分成 $3$ 组，分别组成 $3$ 个三位数，且使这 $3$ 个三位数构成 $1 : 2 : 3$ 的比例，试求出所有满足条件的 $3$ 个三位数。\n\n## 输入格式\n无。\n\n## 输出格式\n若干行，每行 $3$ 个数字。按照每行第 $1$ 个数字升序排列。\n\n## 输入输出样例\n### 输入 #1\n\`\`\`\n（无）\n\`\`\`\n\n### 输出 #1\n\`\`\`\n192 384 576\n219 438 657\n273 546 819\n327 654 981\n\`\`\``,
    testCases: [{ input: '', expectedOutput: '192 384 576\n219 438 657\n273 546 819\n327 654 981\n' }],
  },
  {
    title: 'P1009 [NOIP1998 普及组] 阶乘之和',
    difficulty: 'POINT_1',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['高精度', '数学', 'NOIP'],
    description: `## 题目描述\n用高精度计算出 $S = 1! + 2! + 3! + \\cdots + n!$（$n \\le 50$）。\n\n其中 \`!\` 表示阶乘，例如：$5! = 5 \\times 4 \\times 3 \\times 2 \\times 1$。\n\n## 输入格式\n一个正整数 $n$。\n\n## 输出格式\n一个正整数 $S$，表示计算结果。\n\n## 输入输出样例\n### 输入 #1\n\`\`\`\n3\n\`\`\`\n\n### 输出 #1\n\`\`\`\n9\n\`\`\`\n\n## 说明/提示\n对于 $100\\%$ 的数据，$1 \\le n \\le 50$。`,
    testCases: [
      { input: '3\n', expectedOutput: '9\n' },
      { input: '10\n', expectedOutput: '4037913\n' },
    ],
  },
  {
    title: 'P1010 [NOIP1998 普及组] 幂次方',
    difficulty: 'POINT_1',
    timeLimit: 1000,
    memoryLimit: 125,
    tags: ['递归', '模拟', '分治', 'NOIP'],
    description: `## 题目描述\n任何一个正整数都可以用 $2$ 的幂次方表示。例如 $137 = 2^7 + 2^3 + 2^0$。\n\n同时约定次方用括号来表示，即 $a^b$ 可表示为 $a(b)$。\n\n由此可知，$137$ 可表示为 $2(7) + 2(3) + 2(0)$。\n\n进一步：$7 = 2^2 + 2 + 2^0$（$2^1$ 用 $2$ 表示），并且 $3 = 2 + 2^0$。\n\n所以最后 $137$ 可表示为 $2(2(2) + 2 + 2(0)) + 2(2 + 2(0)) + 2(0)$。\n\n## 输入格式\n一行一个正整数 $n$。\n\n## 输出格式\n符合约定的 $n$ 的 $0, 2$ 表示（不能有空格）。\n\n## 输入输出样例\n### 输入 #1\n\`\`\`\n1315\n\`\`\`\n\n### 输出 #1\n\`\`\`\n2(2(2+2(0))+2)+2(2(2+2(0)))+2(2(2)+2(0))+2+2(0)\n\`\`\``,
    testCases: [
      { input: '1315\n', expectedOutput: '2(2(2+2(0))+2)+2(2(2+2(0)))+2(2(2)+2(0))+2+2(0)\n' },
      { input: '2\n', expectedOutput: '2\n' },
    ],
  },
];

async function importLuogu() {
  importing.value = true;
  error.value = '';
  importResult.value = null;

  try {
    const { data } = await api.post('/api/problems/import', {
      problems: luoguSeedData,
    });
    importResult.value = data;
  } catch (e: any) {
    error.value = e.response?.data?.message || '导入失败';
  } finally {
    importing.value = false;
  }
}

async function importSingle() {
  importing.value = true;
  error.value = '';
  importResult.value = null;

  try {
    const { data } = await api.post('/api/problems/import', {
      problems: [{
        ...manualProblem.value,
        tags: manualProblem.value.tags.split(',').map((t: string) => t.trim()).filter(Boolean),
      }],
    });
    importResult.value = data;
    if (data.imported > 0) {
      manualProblem.value = {
        title: '',
        description: '',
        difficulty: 'POINT_1',
        timeLimit: 1000,
        memoryLimit: 256,
        tags: '',
      };
    }
  } catch (e: any) {
    error.value = e.response?.data?.message || '导入失败';
  } finally {
    importing.value = false;
  }
}

async function syncQojSingle() {
  importing.value = true;
  error.value = '';
  importResult.value = null;

  try {
    const { data } = await api.post('/api/sync/problem', {
      platform: 'QOJ',
      remoteId: qojRemoteId.value,
    });
    importResult.value = {
      imported: data.synced ? 1 : 0,
      skipped: data.synced ? 0 : 1,
      total: data.synced ? 1 : 0,
      detail: data,
    };
  } catch (e: any) {
    error.value = e.response?.data?.message || e.response?.data?.error || 'QOJ 同步失败';
  } finally {
    importing.value = false;
  }
}

async function syncQojBatch() {
  importing.value = true;
  error.value = '';
  importResult.value = null;

  try {
    const { data } = await api.post('/api/sync/batch', {
      platform: 'QOJ',
      page: qojPage.value,
      pageSize: qojPageSize.value,
    });
    const results = data.results || [];
    importResult.value = {
      imported: results.filter((r: any) => r.problemId).length,
      skipped: results.filter((r: any) => !r.problemId && r.status !== 'error').length,
      total: results.length,
      errors: results.filter((r: any) => r.status === 'error').length,
      detail: data,
    };
  } catch (e: any) {
    error.value = e.response?.data?.message || e.response?.data?.error || 'QOJ 批量同步失败';
  } finally {
    importing.value = false;
  }
}
</script>

<template>
  <div class="import-page">
    <div class="page-header">
      <h2>导入题目</h2>
      <button class="btn-back" @click="$router.push('/problems')">← 返回题库</button>
    </div>

    <!-- 洛谷一键导入 -->
    <div class="card">
      <h3>📥 洛谷 P1000-P1010 一键导入</h3>
      <p class="card-desc">包含 11 道经典题目，涵盖入门级到提高组，来自洛谷官方题库。</p>
      <div class="quick-scan">
        <div v-for="p in luoguSeedData" :key="p.title" class="problem-preview">
          <span class="preview-title">{{ p.title }}</span>
          <span class="preview-meta">{{ pointDifficultyShortLabel(p.difficulty) }} · {{ p.timeLimit }}ms · {{ p.tags.join(', ') }}</span>
        </div>
      </div>
      <button class="btn-primary" @click="importLuogu" :disabled="importing">
        {{ importing ? '导入中...' : '一键导入 11 道题目' }}
      </button>
    </div>

    <div class="card">
      <h3>QOJ 题库同步</h3>
      <p class="card-desc">从 qoj.ac 拉取题目和题面。第一阶段支持题库展示，不启用自动提交。</p>
      <div class="form-grid">
        <div class="form-group">
          <label>QOJ 题号</label>
          <input v-model="qojRemoteId" placeholder="例如: 1" />
        </div>
        <div class="form-group">
          <label>单题同步</label>
          <button class="btn-secondary" @click="syncQojSingle" :disabled="importing || !qojRemoteId">
            {{ importing ? '同步中...' : '同步该 QOJ 题目' }}
          </button>
        </div>
        <div class="form-group">
          <label>列表页码</label>
          <input v-model.number="qojPage" type="number" min="1" />
        </div>
        <div class="form-group">
          <label>同步数量</label>
          <input v-model.number="qojPageSize" type="number" min="1" max="100" />
        </div>
        <div class="form-group full">
          <button class="btn-primary" @click="syncQojBatch" :disabled="importing">
            {{ importing ? '同步中...' : '批量同步 QOJ 当前页' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 手动输入 -->
    <div class="card">
      <h3>✍️ 手动添加题目</h3>
      <div class="form-grid">
        <div class="form-group full">
          <label>题目标题</label>
          <input v-model="manualProblem.title" placeholder="例如: P1001 A+B Problem" />
        </div>
        <div class="form-group full">
          <label>题目描述（支持 Markdown）</label>
          <textarea v-model="manualProblem.description" rows="10" placeholder="## 题目描述&#10;...&#10;&#10;## 输入格式&#10;...&#10;&#10;## 输出格式&#10;..."></textarea>
        </div>
        <div class="form-group">
          <label>难度</label>
          <select v-model="manualProblem.difficulty">
            <option v-for="d in difficulties" :key="d.value" :value="d.value">{{ d.label }}</option>
          </select>
        </div>
        <div class="form-group">
          <label>标签（逗号分隔）</label>
          <input v-model="manualProblem.tags" placeholder="动态规划, DP, NOIP" />
        </div>
        <div class="form-group">
          <label>时间限制 (ms)</label>
          <input v-model.number="manualProblem.timeLimit" type="number" />
        </div>
        <div class="form-group">
          <label>内存限制 (MB)</label>
          <input v-model.number="manualProblem.memoryLimit" type="number" />
        </div>
        <div class="form-group full">
          <button class="btn-secondary" @click="importSingle" :disabled="importing || !manualProblem.title">
            {{ importing ? '导入中...' : '添加题目' }}
          </button>
        </div>
      </div>
    </div>

    <!-- 结果 -->
    <div v-if="importResult" class="card result-card">
      <h3>✅ 导入完成</h3>
      <p>新增 {{ importResult.imported }} 道，跳过 {{ importResult.skipped }} 道（已存在），题库共 {{ importResult.total }} 题。</p>
    </div>

    <div v-if="error" class="card error-card">
      <p>❌ {{ error }}</p>
    </div>
  </div>
</template>

<style scoped>
.import-page { max-width: 800px; margin: 0 auto; }

.page-header {
  display: flex; justify-content: space-between; align-items: center;
  margin-bottom: 20px;
}
.page-header h2 { margin: 0; }
.btn-back {
  padding: 6px 16px; background: #f5f5f5;
  border: none; border-radius: 4px; cursor: pointer;
  color: #666; font-size: 14px;
}

.card {
  background: #fff; border-radius: 8px;
  padding: 24px; margin-bottom: 20px;
  box-shadow: 0 1px 3px rgba(0,0,0,0.1);
}
.card h3 { margin: 0 0 8px; }
.card-desc { color: #666; font-size: 14px; margin-bottom: 16px; }

.quick-scan {
  max-height: 300px; overflow-y: auto;
  margin-bottom: 16px;
  border: 1px solid #eee; border-radius: 4px;
}
.problem-preview {
  display: flex; justify-content: space-between;
  align-items: center; padding: 8px 12px;
  border-bottom: 1px solid #f5f5f5;
  font-size: 13px;
}
.problem-preview:last-child { border-bottom: none; }
.preview-title { font-weight: 500; }
.preview-meta { color: #999; font-size: 12px; }

.btn-primary {
  width: 100%; padding: 12px;
  background: #4fc3f7; color: #1a1a2e;
  border: none; border-radius: 4px;
  font-size: 16px; font-weight: bold; cursor: pointer;
}
.btn-primary:hover { background: #29b6f6; }
.btn-primary:disabled { opacity: 0.5; cursor: default; }

.btn-secondary {
  padding: 10px 24px;
  background: #27ae60; color: #fff;
  border: none; border-radius: 4px; cursor: pointer;
  font-size: 14px; font-weight: 600;
}
.btn-secondary:hover { background: #219a52; }
.btn-secondary:disabled { opacity: 0.5; cursor: default; }

.form-grid {
  display: grid; grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.form-group.full { grid-column: 1 / -1; }
.form-group label {
  display: block; margin-bottom: 4px;
  font-size: 13px; color: #666; font-weight: 500;
}
.form-group input, .form-group select, .form-group textarea {
  width: 100%; padding: 8px 12px;
  border: 1px solid #ddd; border-radius: 4px;
  font-size: 14px; box-sizing: border-box;
}
.form-group textarea { font-family: 'Courier New', monospace; resize: vertical; }

.result-card { background: #e8f5e9; border: 1px solid #a5d6a7; }
.error-card { background: #fce4ec; border: 1px solid #ef9a9a; }
.result-card h3, .error-card h3 { color: #2e7d32; }
</style>
