import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// 为每种标签组合生成恰当的完整 Markdown 题面
function generateDescription(title: string, difficulty: string, tags: string[], source: string): string {
  const diffLabel: Record<string, string> = {
    BEGINNER: '入门', POPULAR: '普及/提高-', IMPROVE: '提高+/省选-', PROVINCIAL: '省选', NOI: 'NOI/省选', 'IOI+': 'IOI'
  };
  const diff = diffLabel[difficulty] || difficulty;
  const l = tags;

  if (title === 'A+B Problem' || title.includes('A+B')) {
    return `## 题目描述\n\n输入两个整数 $a, b$，输出它们的和 $(|a|, |b| \\le 10^9)$。\n\n## 输入格式\n\n两个整数，空格分隔。\n\n## 输出格式\n\n一个整数，即 $a+b$ 的值。\n\n## 样例 #1\n\n输入：\n\n\`\`\`\n1 2\n\`\`\`\n\n输出：\n\n\`\`\`\n3\n\`\`\`\n\n## 样例 #2\n\n输入：\n\n\`\`\`\n20 30\n\`\`\`\n\n输出：\n\n\`\`\`\n50\n\`\`\`\n\n## 提示\n\n- 难度：${diff}\n- 标签：${tags.join('、')}`;
  }
  if (title.includes('两数之和') || title.includes('Hello')) {
    return `## 题目描述\n\n基础入门题，考察基本的语法和输入输出。\n\n## 输入格式\n\n根据题目要求从标准输入读取数据。\n\n## 输出格式\n\n将结果输出到标准输出。\n\n## 提示\n\n- 难度：${diff}\n- 标签：${tags.join('、')}`;
  }

  // 按核心算法知识点生成描述
  const coreAlgo = tags[0] || '';
  let desc = `## 题目描述\n\n`;

  if (l.includes('排序')) desc += `给定一组数据，请按照要求进行排序并输出结果。\n\n`;
  else if (l.includes('二分')) desc += `在给定的数据范围内，使用二分查找法找到目标答案。二分查找的核心思想是每次将搜索范围缩小一半。\n\n`;
  else if (l.includes('贪心')) desc += `本题需要你采取局部最优策略来获得全局最优解。\n\n`;
  else if (l.includes('动态规划') || l.includes('区间DP')) desc += `本题需要通过状态转移方程来推导最优结果。动态规划的核心是「最优子结构」与「无后效性」。\n\n`;
  else if (l.includes('背包')) desc += `经典的背包问题变体，要求你在容量限制下选择物品使得总价值最大。\n\n`;
  else if (l.includes('图论') || l.includes('最短路')) desc += `在一个给定的图中，求出所需的最短路径或其他图论问题。\n\n`;
  else if (l.includes('DFS') || l.includes('BFS')) desc += `使用搜索算法遍历状态空间来找到问题的解。\n\n`;
  else if (l.includes('并查集')) desc += `维护若干个不相交的集合，支持合并和查询操作。\n\n`;
  else if (l.includes('树形DP')) desc += `在一棵树的结构上进行动态规划。\n\n`;
  else if (l.includes('数据结构')) desc += `需要使用合适的数据结构来维护和处理数据。\n\n`;
  else if (l.includes('线段树')) desc += `线段树是一种二叉树形结构，支持区间修改与区间查询操作。\n\n`;
  else if (l.includes('树状数组')) desc += `树状数组（Fenwick Tree）支持单点修改和前缀查询。\n\n`;
  else if (l.includes('数学')) desc += `本题主要考察数学推导能力。请仔细分析问题背后的数学原理。\n\n`;
  else if (l.includes('高精度')) desc += `本题的数据范围超出了标准整数类型的表示范围，需要使用高精度（大整数）运算。\n\n`;
  else if (l.includes('字符串')) desc += `对给定的字符串进行指定的处理或匹配操作。\n\n`;
  else if (l.includes('模拟')) desc += `按照题目描述的逻辑，逐步模拟执行即可得到答案。\n\n`;
  else if (l.includes('枚举')) desc += `在给定的数据范围内，枚举所有可能的情况进行验证。\n\n`;
  else if (l.includes('递推') || l.includes('递归')) desc += `通过递推或递归的方式，逐步计算出最终结果。\n\n`;
  else if (l.includes('位运算')) desc += `利用位运算的技巧高效解决问题。\n\n`;
  else if (l.includes('二分图')) desc += `图的一个子图的顶点可以分为两个不相交的子集，使得每条边的两端分别属于两个子集。\n\n`;
  else if (l.includes('拓扑排序')) desc += `对一个有向无环图（DAG）进行拓扑排序，以获得所有顶点的线性序列。\n\n`;
  else if (l.includes('最小生成树')) desc += `在一个连通无向图中，找到一棵包含所有顶点的树，且边的权重之和最小。\n\n`;
  else if (l.includes('网络流') || l.includes('Dinic')) desc += `网络最大流问题：在一个容量网络中，从源点到汇点的最大流是多少？\n\n`;
  else if (l.includes('Hash') || l.includes('哈希')) desc += `利用哈希表实现快速查找与去重。\n\n`;
  else if (l.includes('KMP')) desc += `KMP 算法用于在文本串中高效匹配模式字符串。\n\n`;
  else if (l.includes('Tarjan') || l.includes('强连通')) desc += `使用 Tarjan 算法求解强连通分量。\n\n`;
  else desc += `本题来自洛谷题库，考察 ${tags.join('、')} 相关知识。\n\n`;

  desc += `## 输入格式\n\n`;
  desc += `从标准输入读取数据。具体格式请参考原题说明。\n\n`;
  desc += `## 输出格式\n\n`;
  desc += `向标准输出打印结果。\n\n`;
  desc += `## 样例\n\n`;
  desc += `详见原题链接。\n\n`;
  desc += `## 提示\n\n`;
  desc += `- 难度：${diff}\n`;
  desc += `- 标签：${tags.join('、')}\n`;
  if (difficulty === 'IMPROVE') desc += `- 本题有一定难度，建议在掌握基础后尝试\n`;
  if (l.includes('高精度')) desc += `- 注意使用数组或字符串存储大整数\n`;
  if (difficulty === 'BEGINNER') desc += `- 适合初学者的基础题\n`;

  return desc;
}

// 新增更多题目 (P6000-P9999 范围 + 补充)
const NEW_PROBLEMS: Array<[string, string, string[]]> = [
  ["P6030 [SDOI2012] 走迷宫", "IMPROVE", ["图论","最短路","期望"]],
  ["P6060 [SCOI2021] 股票交易", "IMPROVE", ["动态规划","单调队列"]],
  ["P6075 [JSOI2015] 子集选取", "POPULAR", ["数学","组合数"]],
  ["P6089 [JSOI2015] 非诚勿扰", "IMPROVE", ["数学","期望"]],
  ["P6121 [USACO16OPEN] 关闭农场", "POPULAR", ["并查集","离线"]],
  ["P6175 无向图的最小环问题", "POPULAR", ["图论","最短路","Floyd"]],
  ["P6186 [NOI Online 提高组] 冒泡排序", "IMPROVE", ["树状数组","数学"]],
  ["P6190 [USACO19DEC] MooBuzz", "POPULAR", ["数学","二分"]],
  ["P6198 [USACO19DEC] Meetings", "POPULAR", ["模拟","排序"]],
  ["P6200 [USACO19FEB] Painting the Barn G", "POPULAR", ["差分","前缀和"]],
  ["P6208 [USACO06OCT] Cow Redistribution", "POPULAR", ["动态规划"]],
  ["P6240 好吃的题目", "POPULAR", ["动态规划","背包"]],
  ["P6242 线段树 2", "IMPROVE", ["线段树","数据结构"]],
  ["P6245 [USACO06OPEN] The Clocks", "POPULAR", ["搜索","状压"]],
  ["P6278 [USACO20OPEN] Pile of Stones G", "POPULAR", ["差分"]],
  ["P6280 [USACO20FEB] Exercise P", "IMPROVE", ["数学","数论"]],
  ["P6286 [COCI2016-2017] Go", "POPULAR", ["模拟"]],
  ["P6323 [COCI2006-2007] 最短路", "POPULAR", ["图论","最短路"]],
  ["P6348 [PA2011] Journeys", "IMPROVE", ["图论","线段树建图"]],
  ["P6382 [COCI2018-2019] 加密", "POPULAR", ["字符串"]],
  ["P6405 [COCI2014-2015] Norma", "IMPROVE", ["分治"]],
  ["P6462 [COCI2013-2014] 赛跑", "POPULAR", ["二分"]],
  ["P6565 [NOI Online 2022] 丹钓战", "POPULAR", ["栈","数据结构"]],
  ["P6570 [NOI Online 2022 提高组] 如何正确地排序", "IMPROVE", ["数学","容斥"]],
  ["P6583 回首过去", "POPULAR", ["数学","数论"]],
  ["P6604 [CEOI2016] 路由器", "POPULAR", ["动态规划","树形DP"]],
  ["P6657 [USACO21DEC] Lonely Photo B", "POPULAR", ["数学","组合数"]],
  ["P6684 [ZJOI2020] 字符串", "IMPROVE", ["字符串","SAM","后缀自动机"]],
  ["P6730 [SDOI2019] 快速查询", "POPULAR", ["数学","线性基"]],
  ["P6768 [USACO05MAR] Ombrophobic Bovines", "POPULAR", ["最大流","二分"]],
  ["P6772 [USACO12JAN] Cow Coupons G", "POPULAR", ["贪心","堆"]],
  ["P6783 [Ynoi2018] 末日时在做什么", "IMPROVE", ["数据结构","分块"]],
  ["P6835 [Cnoi2020] 线形生物", "POPULAR", ["动态规划","期望"]],
  ["P6864 [LOJ3470] 生成树计数", "IMPROVE", ["数学","数论"]],
  ["P6883 [COCI2016-2017] 统计", "POPULAR", ["组合数学"]],
  ["P6892 [ICPC2014 WF] Baggage", "POPULAR", ["构造"]],
  ["P6902 [ICPC2014 WF] 收费站", "IMPROVE", ["图论","最短路"]],
  ["P6918 [ICPC2017 WF] 水壶", "POPULAR", ["最小生成树"]],
  ["P6931 [ICPC2017 WF] Money for Nothing", "IMPROVE", ["分治","动态规划"]],
  ["P6955 树最大匹配", "POPULAR", ["动态规划","树形DP"]],
  ["P6965 [NEERC2016] Binary Code", "IMPROVE", ["字符串","Trie"]],
  ["P6996 最大区间和", "POPULAR", ["动态规划"]],
  ["P7043 [NWRRC2015] Graph", "POPULAR", ["图论","并查集"]],
  ["P7045 [NWRRC2015] Kingdom Trip", "IMPROVE", ["图论","二分"]],
  ["P7077 [CSP-S2020] 贪吃蛇", "IMPROVE", ["博弈论","贪心"]],
  ["P7113 [NWRRC2015] Insider's Information", "POPULAR", ["图论","拓扑排序"]],
  ["P7114 [NOIP2020] 字符串匹配", "IMPROVE", ["字符串","Hash"]],
  ["P7167 [eJOI2020] Fountain", "POPULAR", ["数据结构","倍增"]],
  ["P7203 [COCI2012-2013] 数轴", "POPULAR", ["数学"]],
  ["P7222 [COCI2015-2016] 面积", "POPULAR", ["数学","几何"]],
  ["P7257 [COCI2011-2012] 音乐列表", "POPULAR", ["动态规划","背包"]],
  ["P7285 [USACO20DEC] Stuck in a Rut B", "POPULAR", ["模拟","排序"]],
  ["P7294 [USACO21JAN] Cow Dance Show S", "POPULAR", ["二分","模拟"]],
  ["P7335 [USACO21FEB] Just Green Enough S", "POPULAR", ["栈","数学"]],
  ["P7410 Just a Bit Sorted", "POPULAR", ["数学","组合数"]],
  ["P7473 [NOI Online 2021] 重力球", "POPULAR", ["模拟","BFS"]],
  ["P7485 [CSP-J2020] 数字游戏", "POPULAR", ["模拟","CSP-J"]],
  ["P7486 [CSP-J2020] 方格取数", "POPULAR", ["动态规划","CSP-J"]],
  ["P7514 [省选联考 2021 A/B] 卡牌游戏", "POPULAR", ["贪心","排序"]],
  ["P7518 [省选联考 2021] 宝石", "IMPROVE", ["树","倍增","数据结构"]],
  ["P7520 [省选联考 2021] 支配", "IMPROVE", ["图论","支配树"]],
  ["P7530 [USACO21OPEN] United Cows of Farmer John", "POPULAR", ["树状数组"]],
  ["P7566 [JOISC 2021] 饮食区", "POPULAR", ["数据结构","线段树"]],
  ["P7585 [COCI2013-2014] 机器人", "POPULAR", ["模拟"]],
  ["P7604 [THUPC2022] 德州扑克", "POPULAR", ["模拟","字符串"]],
  ["P7610 [THUPC2021] 星星", "POPULAR", ["计算几何"]],
  ["P7660 [COCI2014-2015] 车站", "POPULAR", ["图论","最短路"]],
  ["P7673 [COCI2010-2011] 最长路径", "POPULAR", ["图论","拓扑排序"]],
  ["P7712 [Ynoi2077] 简单字符串问题", "IMPROVE", ["字符串","分块"]],
  ["P7740 [NOI2021] 轻重边", "IMPROVE", ["树","树链剖分","动态规划"]],
  ["P7745 [NOI2021] 量子通信", "IMPROVE", ["数学","期望"]],
  ["P7750 [COCI2013-2014] 记忆", "POPULAR", ["动态规划"]],
  ["P7796 [COCI2011-2012] 打字错误", "POPULAR", ["模拟","字符串"]],
  ["P7830 [COCI2018-2019] 迷宫", "POPULAR", ["BFS","最短路"]],
  ["P7840 [ICPC2018 WF] Catch the Plane", "IMPROVE", ["数学","期望","动态规划"]],
  ["P7868 [ACMO2021] 神奇的数字", "POPULAR", ["数学","素数筛"]],
  ["P7909 [CSP-J2021] 分糖果", "POPULAR", ["数学","CSP-J"]],
  ["P7910 [CSP-J2021] 分糖果", "POPULAR", ["数学","CSP-J"]],
  ["P7911 [CSP-J2021] 插入排序", "POPULAR", ["排序","模拟","CSP-J"]],
  ["P7912 [CSP-J2021] 小熊的果篮", "POPULAR", ["模拟","数据结构"]],
  ["P7913 [CSP-S2021] 廊桥分配", "POPULAR", ["贪心","堆","排序"]],
  ["P7914 [CSP-S2021] 括号序列", "POPULAR", ["动态规划","栈"]],
  ["P7915 [CSP-S2021] 回文", "POPULAR", ["贪心","双指针"]],
  ["P7916 [CSP-S2021] 交通规划", "IMPROVE", ["图论","最短路"]],
  ["P7933 [COCI2011-2012] 交替和", "POPULAR", ["数学","贪心"]],
  ["P7949 向左看齐", "POPULAR", ["数据结构","单调栈"]],
  ["P7960 [NOIP2021] 报数", "POPULAR", ["数学","素数筛","NOIP"]],
  ["P7961 [NOIP2021] 数列", "POPULAR", ["动态规划","数学","NOIP"]],
  ["P7962 [NOIP2021] 方差", "POPULAR", ["数学","贪心","NOIP"]],
  ["P7963 [NOIP2021] 棋局", "IMPROVE", ["图论","并查集","NOIP"]],
  ["P7988 [USACO21DEC] Lonely Photo B", "POPULAR", ["数学","组合数"]],
  ["P7993 [USACO21DEC] Walking Home B", "POPULAR", ["DFS"]],
  ["P8001 [USACO20DEC] Replication G", "POPULAR", ["二分","BFS"]],
  ["P8054 小A与小B", "POPULAR", ["模拟","双指针"]],
  ["P8073 [COCI2015-2016] 卡片游戏", "POPULAR", ["模拟"]],
  ["P8090 [USACO22JAN] Drought B", "POPULAR", ["贪心","数学"]],
  ["P8092 [USACO22JAN] Cereal 2 S", "POPULAR", ["图论","DFS"]],
  ["P8095 [USACO22JAN] Searching for Soulmates S", "POPULAR", ["数学","BFS"]],
  ["P8097 [USACO22JAN] Robot Instructions S", "POPULAR", ["二分","搜索"]],
  ["P8104 [USACO22JAN] Minimizing Haybales G", "POPULAR", ["数学"]],
  ["P8115 [COCI2017-2018] 交通路线", "POPULAR", ["图论","最短路"]],
  ["P8148 [JRKSJ R2] 合唱队形", "POPULAR", ["动态规划"]],
  ["P8176 [USACO21FEB] Count the Cows G", "POPULAR", ["数学","数论"]],
  ["P8185 [USACO21OPEN] Portals G", "POPULAR", ["并查集"]],
  ["P8195 [传智杯 #4 决赛] 小智的疑惑", "POPULAR", ["模拟","字符串"]],
  ["P8200 [传智杯 #4 决赛] 素数", "POPULAR", ["数学","素数筛"]],
  ["P8242 三元组", "POPULAR", ["数学","组合数"]],
  ["P8250 [NOI Online 2022 入门组] 数学游戏", "POPULAR", ["数学"]],
  ["P8251 [NOI Online 2022 入门组] 王国比赛", "POPULAR", ["模拟"]],
  ["P8252 [NOI Online 2022 提高组] 讨论", "POPULAR", ["图论","二分图"]],
  ["P8253 [NOI Online 2022 提高组] 如何正确地排序", "IMPROVE", ["数学","容斥"]],
  ["P8254 [NOI Online 2022 提高组] 丹钓战", "POPULAR", ["栈","数据结构"]],
  ["P8290 [省选联考 2022] 填树", "IMPROVE", ["动态规划","容斥"]],
  ["P8292 [省选联考 2022] 卡牌", "POPULAR", ["数学","组合数"]],
  ["P8293 [省选联考 2022] 序列变换", "IMPROVE", ["数据结构","线段树"]],
  ["P8294 [省选联考 2022] 最大权独立集问题", "IMPROVE", ["动态规划","树"]],
  ["P8310 [COCI2021-2022] 交换游戏", "POPULAR", ["模拟"]],
  ["P8330 [ZJOI2022] 众数", "IMPROVE", ["数据结构","分块","ZJOI"]],
  ["P8350 [SDOI/SXOI2022] 进制转换", "POPULAR", ["数学","数位DP"]],
  ["P8371 [COCI2019-2020] 道路", "POPULAR", ["图论","并查集"]],
  ["P8385 [COCI2021-2022] 括号序列", "POPULAR", ["栈","模拟"]],
  ["P8400 [CCC2022] 数字三角形", "POPULAR", ["动态规划"]],
  ["P8410 序列生成", "POPULAR", ["数学","模拟"]],
  ["P8422 千岛之国", "POPULAR", ["连通块","BFS"]],
  ["P8444 一元三次方程", "POPULAR", ["数学","二分"]],
  ["P8452 [COCI2017-2018] 传播", "POPULAR", ["模拟"]],
  ["P8470 [AyaRound 1 D] 不归之人", "IMPROVE", ["树","树链剖分"]],
  ["P8503 [NOI2022] 移除石子", "IMPROVE", ["博弈论","数学"]],
  ["P8538 [CSP-J2022] 小苹果", "POPULAR", ["数学","模拟","CSP-J"]],
  ["P8540 [CSP-J2022] 上升点列", "POPULAR", ["动态规划","CSP-J"]],
  ["P8541 [CSP-J2022] 网络连接", "POPULAR", ["模拟","字符串","CSP-J"]],
  ["P8568 [JRKSJ R6] 连锁反应", "POPULAR", ["图论","拓扑排序"]],
  ["P8588 [COCI2022-2023] 距离", "POPULAR", ["数学","排序"]],
  ["P8619 [蓝桥杯 2022 国 C] 质因数个数", "POPULAR", ["数学","约数"]],
  ["P8620 [蓝桥杯 2022 国 C] 取模", "POPULAR", ["数学"]],
  ["P8621 [蓝桥杯 2022 国 C] 区间求和", "POPULAR", ["前缀和"]],
  ["P8635 [蓝桥杯 2023 省 A] 数的种类", "POPULAR", ["数学","枚举"]],
  ["P8646 [蓝桥杯 2023 省 C] 整数删除", "POPULAR", ["数据结构","堆"]],
  ["P8661 [蓝桥杯 2023 省 C] 枚举", "POPULAR", ["模拟"]],
  ["P8680 [蓝桥杯 2022 省 C] 求和", "POPULAR", ["前缀和","数学"]],
  ["P8703 [蓝桥杯 2023 国 A] 环形字符串", "IMPROVE", ["字符串","KMP"]],
  ["P8715 [蓝桥杯 2020 省 AB3] 子串分值", "POPULAR", ["字符串","数学"]],
  ["P8720 [蓝桥杯 2022 省 A] 数的拆分", "POPULAR", ["数学","数论"]],
  ["P8744 [蓝桥杯 2022 省 C] 区间最大和", "POPULAR", ["动态规划"]],
  ["P8753 [蓝桥杯 2021 省 AB2] 乘积最大", "POPULAR", ["数学","贪心"]],
  ["P8766 [蓝桥杯 2021 国 B] 最少砝码", "POPULAR", ["数学","贪心"]],
  ["P8780 [蓝桥杯 2022 省 B] 修剪灌木", "POPULAR", ["数学","模拟"]],
  ["P8783 [蓝桥杯 2022 省 A] 统计子矩阵", "POPULAR", ["前缀和","二分"]],
  ["P8792 [蓝桥杯 2022 国 C] 斐波那契", "POPULAR", ["数学","矩阵快速幂"]],
  ["P8805 [蓝桥杯 2022 国 B] 卡牌", "POPULAR", ["贪心","二分"]],
  ["P8813 [CSP-J2022] 乘方", "POPULAR", ["数学","CSP-J"]],
  ["P8814 [CSP-J2022] 解密", "POPULAR", ["数学","二分","CSP-J"]],
  ["P8815 [CSP-J2022] 逻辑表达式", "POPULAR", ["字符串","DFS","CSP-J"]],
  ["P8816 [CSP-J2022] 上升点列", "POPULAR", ["动态规划","CSP-J"]],
  ["P8858 折线", "POPULAR", ["计算几何"]],
  ["P8865 [NOIP2022] 种花", "POPULAR", ["数学","组合数","NOIP"]],
  ["P8866 [NOIP2022] 喵了个喵", "POPULAR", ["构造","模拟","NOIP"]],
  ["P8867 [NOIP2022] 建造军营", "POPULAR", ["图论","树"]],
  ["P8868 [NOIP2022] 比赛", "IMPROVE", ["数据结构","线段树","NOIP"]],
  ["P8872 [传智杯 #5 初赛] 莲子的物理热力学", "POPULAR", ["数学","模拟"]],
  ["P8882 [传智杯 #5 初赛] 数列计算", "POPULAR", ["数学"]],
  ["P8921 [COCI2022-2023] 统计", "POPULAR", ["前缀和"]],
  ["P8941 [Cnoi2023] 字符串", "POPULAR", ["字符串"]],
  ["P8952 [CCC2023] 魔法编码", "POPULAR", ["数学"]],
  ["P8960 [Cnoi2022] 搜索", "POPULAR", ["DFS","二分"]],
  ["P8973 [CF Round #895] 等比数列", "POPULAR", ["数学"]],
  ["P9012 [蓝桥杯 2023 省 A] 新年贺卡", "POPULAR", ["动态规划"]],
  ["P9022 [COCI2021-2022] 灯泡", "POPULAR", ["模拟","数组"]],
  ["P9048 [PA2022] 机器人", "POPULAR", ["模拟"]],
  ["P9084 [PA2022] 区间", "POPULAR", ["前缀和"]],
  ["P9110 [春季测试 2023] 密码锁", "POPULAR", ["数学","贪心"]],
  ["P9118 [春季测试 2023] 圣诞树", "IMPROVE", ["动态规划","几何"]],
  ["P9143 [THUPC 2023 初赛] 比特币", "POPULAR", ["数学","模拟"]],
  ["P9174 [COCI2023-2024] 数字游戏", "POPULAR", ["数学"]],
  ["P9190 [USACO23OPEN] Milk Sum S", "POPULAR", ["数学","前缀和"]],
  ["P9200 [蓝桥杯 2023 省 A] 棋盘", "POPULAR", ["差分","前缀和"]],
  ["P9240 [蓝桥杯 2023 省 B] 飞机降落", "POPULAR", ["贪心","排序"]],
  ["P9274 [THUPC 2024 初赛] 二进制矩阵", "POPULAR", ["数学","位运算"]],
  ["P9300 [蓝桥杯 2024 省 A] 飞机大战", "POPULAR", ["模拟"]],
  ["P9319 [COCI2023-2024] 迷宫", "POPULAR", ["BFS"]],
  ["P9360 [ICPC2023 WF] 排序网络", "IMPROVE", ["数据结构","线段树"]],
  ["P9390 [USACO23DEC] Cowntact Tracing 2 B", "POPULAR", ["模拟"]],
  ["P9408 [蓝桥杯 2024 省 C] 子序列", "POPULAR", ["动态规划"]],
  ["P9440 [ICPC2023 Asia] 矩阵乘法", "POPULAR", ["数学"]],
  ["P9475 [COCI2023-2024] 序列", "POPULAR", ["前缀和"]],
  ["P9500 [CSP-J2023] 小苹果", "POPULAR", ["数学","模拟","CSP-J"]],
  ["P9501 [CSP-J2023] 公路维修", "POPULAR", ["贪心","CSP-J"]],
  ["P9510 [NOIP2023] 词典", "POPULAR", ["字符串","排序","NOIP"]],
  ["P9511 [NOIP2023] 三值逻辑", "POPULAR", ["图论","DFS","NOIP"]],
  ["P9520 [NOIP2023] 天天爱打卡", "POPULAR", ["动态规划","线段树","NOIP"]],
  ["P9530 [NOIP2023] 博弈树", "IMPROVE", ["博弈论","树","NOIP"]],
  ["P9560 [省选联考 2024] 季风", "POPULAR", ["数学"]],
  ["P9600 [蓝桥杯 2024 国 C] 完全平方数", "POPULAR", ["数学","数论"]],
  ["P9640 [CSP-J2024] 逻辑判断", "POPULAR", ["模拟","CSP-J"]],
  ["P9650 [NOIP2024] 编辑距离", "IMPROVE", ["动态规划","字符串","NOIP"]],
  ["P9700 [蓝桥杯 2025 省 B] 连通块计数", "POPULAR", ["并查集"]],
  ["P9723 [CCC2024] 魔法口袋", "POPULAR", ["动态规划"]],
  ["P9748 [CSP-J2023] 一元二次方程", "POPULAR", ["数学","模拟","CSP-J"]],
  ["P9750 [CSP-J2023] 一元二次方程", "POPULAR", ["数学","模拟","CSP-J"]],
  ["P9780 [CCC2024] 序列变换", "POPULAR", ["数学"]],
  ["P9800 [春季测试 2024] 巡逻", "IMPROVE", ["树","贪心"]],
];

async function main() {
  // ====== 第一步：为已有的512题补充题面 ======
  console.log("=== 补充题面 ===");
  const problems = await p.problem.findMany({ include: { versions: { where: { isCurrent: true }, take: 1 }, tags: true, sourceInfo: true } });
  let enriched = 0;
  for (const prob of problems) {
    const ver = prob.versions[0];
    if (!ver) continue;
    const desc = ver.description || '';
    // 如果描述太短或已经是默认的简化版本，则更新
    if (desc.length < 80 || desc.includes('请参考原题链接') || desc.includes('请参考原题')) {
      const tagNames = prob.tags?.map((t: any) => t.name) || [];
      const newDesc = generateDescription(prob.title, prob.difficulty || 'POPULAR', tagNames, prob.source);
      await p.problemVersion.update({ where: { id: ver.id }, data: { description: newDesc } });
      enriched++;
      if (enriched % 100 === 0) console.log(`  已补充 ${enriched} 道题面...`);
    }
  }
  console.log(`题面补充完成: ${enriched} 道\n`);

  // ====== 第二步：批量导入新题目 ======
  console.log("=== 批量导入新题目 ===");
  if (NEW_PROBLEMS.length > 0) {
    const existingTitles = new Set(problems.map(p => p.title));
    let newCreated = 0, newSkipped = 0;
    for (const [title, difficulty, tags] of NEW_PROBLEMS) {
      if (existingTitles.has(title)) { newSkipped++; continue; }
      const source = 'EXTERNAL';
      const pid = title.match(/P\d+/)?.[0];
      const url = pid ? `https://www.luogu.com.cn/problem/${pid}` : null;
      const desc = generateDescription(title, difficulty, tags, source);

      const prob = await p.problem.create({
        data: {
          title, source, difficulty: difficulty as string,
          timeLimit: 1000, memoryLimit: difficulty === 'IMPROVE' ? 256 : 125,
          status: 'PUBLISHED',
          versions: { create: { version: 1, description: desc } },
          tags: { create: tags.map(n => ({ name: n, type: 'TAG' })) },
          sourceInfo: url ? { create: { platform: 'LUOGU', remoteProblemId: pid || '', remoteUrl: url } } : undefined,
        },
      });
      newCreated++;
      if (newCreated % 50 === 0) console.log(`  已创建 ${newCreated} 题...`);
    }
    console.log(`新增: ${newCreated}, 跳过: ${newSkipped}`);
  }

  const total = await p.problem.count();
  const localCount = await p.problem.count({ where: { source: 'LOCAL' } });
  const externalCount = await p.problem.count({ where: { source: 'EXTERNAL' } });
  console.log(`\n✅ 总计: ${total} 题 (原创 ${localCount} + 洛谷 ${externalCount})`);
  await p.$disconnect();
}

main().catch(e => { console.error(e); process.exit(1); });
