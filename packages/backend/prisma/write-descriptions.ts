import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();

// 21 类详细题面模板（含完整输入输出格式、样例、数据范围）
type DescFN = (t: string, d: string, l: string[]) => string;

const TMPS: Record<string, DescFN> = {
  "AB": (_,__,l)=>`## 题目描述\n输入两个整数 $a$ 和 $b$，输出 $a+b$ 的值。\n\n## 输入格式\n一行，两个用空格隔开的整数 $a, b$。\n\n## 输出格式\n一行，一个整数，表示 $a+b$ 的值。\n\n## 样例 #1\n\`\`\`\n1 2\n\`\`\`\n\`\`\`\n3\n\`\`\`\n\n## 样例 #2\n\`\`\`\n20 30\n\`\`\`\n\`\`\`\n50\n\`\`\`\n\n## 数据范围\n$|a|, |b| \\le 10^9$。\n\n## 提示\n标签：${l.join("、")}`,
  "sort": (_,d,l)=>`## 题目描述\n给定一个长度为 $n$ 的整数序列，请将其按照从小到大的顺序排序后输出。\n\n## 输入格式\n第一行一个整数 $n$。第二行 $n$ 个整数。\n\n## 输出格式\n一行 $n$ 个整数，排序后序列。\n\n## 样例\n\`\`\`\n5\n4 2 4 5 1\n\`\`\`\n\`\`\`\n1 2 4 4 5\n\`\`\`\n\n## 数据范围\n$n \\le 10^5$，$|a_i| \\le 10^9$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n使用快速排序、归并排序或 sort 函数。`,
  "dp": (_,d,l)=>`## 题目描述\n给定一个问题，其最优解可通过子问题的最优解推导。请使用动态规划方法求解。\n\n## 输入格式\n第一行一个整数 $n$，接下来根据具体问题给出数据。\n\n## 输出格式\n输出最优解的值。\n\n## 样例\n\`\`\`\n5\n7 3 8 2 5\n\`\`\`\n\`\`\`\n12\n\`\`\`\n\n## 数据范围\n$n \\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n状态定义和转移方程是核心，注意初始化。`,
  "greedy": (_,d,l)=>`## 题目描述\n给定若干个任务，请设计一种策略，在满足约束条件的情况下获得最优结果。\n\n## 输入格式\n第一行一个整数 $n$。接下来 $n$ 行每行描述任务的属性。\n\n## 输出格式\n一行一个整数，最优结果。\n\n## 样例\n\`\`\`\n3\n0 2\n2 4\n1 3\n\`\`\`\n\`\`\`\n2\n\`\`\`\n\n## 数据范围\n$n \\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n证明局部最优能推出全局最优。`,
  "bs": (_,d,l)=>`## 题目描述\n在具有单调性的解空间中，使用二分查找（二分答案）的方法高效定位目标值。\n\n## 输入格式\n第一行参数，第二行具体数据。\n\n## 输出格式\n一个整数或浮点数。\n\n## 样例\n\`\`\`\n5 3\n1 2 3 4 5\n\`\`\`\n\`\`\`\n3\n\`\`\`\n\n## 数据范围\n$n \\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n二分查找 $O(\\log n)$，要求数据有序。`,
  "dfs": (_,d,l)=>`## 题目描述\n在给定的状态空间中，使用深度优先搜索（DFS）遍历所有可能的解或状态。\n\n## 输入格式\n输入初始状态或图结构。\n\n## 输出格式\n满足条件的解。\n\n## 样例\n\`\`\`\n3\n1 2 3\n\`\`\`\n\`\`\`\n1 2 3\n1 3 2\n2 1 3\n2 3 1\n3 1 2\n3 2 1\n\`\`\`\n\n## 数据范围\n$n \\le 15$（全排列$\\times$枚举）或状态空间大小可控。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n设置剪枝条件优化搜索效率。`,
  "bfs": (_,d,l)=>`## 题目描述\n在一个图或网格中，从起点出发，使用广度优先搜索寻找最短路径或遍历连通区域。\n\n## 输入格式\n第一行图的规模，接下来给出图的具体结构。\n\n## 输出格式\n最短距离或遍历结果。\n\n## 样例\n\`\`\`\n3 3\n0 1 0\n0 0 0\n0 0 1\n\`\`\`\n\`\`\`\n3\n\`\`\`\n\n## 数据范围\n图的规模 $\\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n队列实现，首次访问即为最短路径。`,
  "bigint": (_,d,l)=>`## 题目描述\n数值超出标准 64 位整数的表示范围，需使用高精度（大整数）运算。\n\n## 输入格式\n两行，每行一个正整数（可能非常大，长度可达 $10^4$ 位）。\n\n## 输出格式\n一行，运算结果。\n\n## 样例\n\`\`\`\n12345678901234567890\n98765432109876543210\n\`\`\`\n\`\`\`\n111111111011111111100\n\`\`\`\n\n## 数据范围\n数字长度 $\\le 10^4$ 位。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n字符串或数组存储，模拟竖式计算。`,
  "math": (_,d,l)=>`## 题目描述\n考察数学推导和数论知识。求解最大公约数、最小公倍数、素数判定、欧拉函数、逆元、同余方程等问题。\n\n## 输入格式\n一行或多个整数。\n\n## 输出格式\n计算结果。\n\n## 样例\n\`\`\`\n12 18\n\`\`\`\n\`\`\`\n6 36\n\`\`\`\n\n## 数据范围\n在合理范围内，部分题目数据较大需要取模。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n推导数学公式，常用快速幂、扩欧、逆元、素数筛。`,
  "sim": (_,d,l)=>`## 题目描述\n按照题目描述的规则逐步模拟执行过程，不需要复杂算法，但需要仔细理解题意。\n\n## 输入格式\n根据题意从标准输入读取。\n\n## 输出格式\n根据题意输出结果。\n\n## 数据范围\n按题目给定范围。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n仔细审题，注意边界条件和特殊情况。`,
  "graph": (_,d,l)=>`## 题目描述\n在一个给定的图中，求解最短路径、连通性、生成树等图论问题。\n\n## 输入格式\n第一行 $n, m$（点数和边数），接下来 $m$ 行每行描述一条边。\n\n## 输出格式\n图论问题的结果。\n\n## 样例\n\`\`\`\n4 5\n1 2 2\n1 3 5\n2 3 1\n3 4 3\n2 4 8\n\`\`\`\n\`\`\`\n6\n\`\`\`\n\n## 数据范围\n$n \\le 10^5$，$m \\le 2\\times 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n根据图的性质选择算法：Dijkstra(非负权)/SPFA/Bellman-Ford/Floyd。`,
  "ds": (_,d,l)=>`## 题目描述\n使用恰当的数据结构高效地存储、查询和修改数据。\n\n## 输入格式\n第一行操作次数 $q$。接下来 $q$ 行描述操作。\n\n## 输出格式\n对每个查询输出结果。\n\n## 样例\n\`\`\`\n5\n1 3\n1 5\n2 3\n1 1\n2 0\n\`\`\`\n\`\`\`\n5\n1\n\`\`\`\n\n## 数据范围\n$q \\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n选择合适容器：栈/队列/堆/平衡树/线段树。`,
  "str": (_,d,l)=>`## 题目描述\n对给定的字符串进行处理或模式匹配。\n\n## 输入格式\n一行或若干行字符串。\n\n## 输出格式\n按要求处理的字符串或匹配位置。\n\n## 样例\n\`\`\`\nhello world\n\`\`\`\n\`\`\`\ndlrow olleh\n\`\`\`\n\n## 数据范围\n$|s| \\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n高级算法包括 KMP、哈希、后缀数组、AC 自动机等。`,
  "uf": (_,d,l)=>`## 题目描述\n维护若干个不相交集合，支持合并与查询操作。\n\n## 输入格式\n第一行 $n, m$。接下来 $m$ 行 $op\\ x\\ y$（1=合并 2=查询）。\n\n## 输出格式\n查询时输出 Y（同一集合）或 N（不同集合）。\n\n## 样例\n\`\`\`\n4 3\n2 1 2\n1 1 2\n2 1 2\n\`\`\`\n\`\`\`\nN\nY\n\`\`\`\n\n## 数据范围\n$n \\le 10^4, m \\le 2\\times 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n路径压缩+按秩合并优化。`,
  "seg": (_,d,l)=>`## 题目描述\n长度为 $n$ 的数列，支持区间修改和区间查询。\n\n## 输入格式\n$n, m$，初始数列，$m$ 个操作（1=区间加 2=区间和）。\n\n## 输出格式\n每个查询操作输出结果。\n\n## 样例\n\`\`\`\n5 5\n1 5 4 2 3\n2 2 4\n1 2 3 2\n2 3 4\n1 1 5 1\n2 1 4\n\`\`\`\n\`\`\`\n11\n8\n20\n\`\`\`\n\n## 数据范围\n$n, m \\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n懒标记处理区间修改，$O(\\log n)$ 单次操作。`,
  "bit": (_,d,l)=>`## 题目描述\n树状数组（Fenwick Tree）处理单点修改和前缀查询。\n\n## 输入格式\n$n, m$，数列，$m$ 个操作（1=单点加 2=前缀和）。\n\n## 输出格式\n查询输出前缀和。\n\n## 样例\n\`\`\`\n5 5\n1 5 4 2 3\n2 3\n1 1 3\n2 5\n\`\`\`\n\`\`\`\n10\n20\n\`\`\`\n\n## 数据范围\n$n, m \\le 5\\times 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n树状数组 $O(\\log n)$，常数极小。`,
  "sp": (_,d,l)=>`## 题目描述\n带权图，求从源点 $s$ 到其它各点的最短路径长度。\n\n## 输入格式\n$n, m, s$，接下来 $m$ 行 $u, v, w$。\n\n## 输出格式\n$n$ 个数，第 $i$ 个为 $s$ 到 $i$ 的距离，不可达输出 $2^{31}-1$。\n\n## 样例\n\`\`\`\n4 6 1\n1 2 2\n2 3 2\n2 4 1\n1 3 5\n3 4 3\n1 4 4\n\`\`\`\n\`\`\`\n0 2 4 3\n\`\`\`\n\n## 数据范围\n$n \\le 10^5, m \\le 5\\times 10^5, w \\le 10^9$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\nDijkstra 堆优化 $O(m\\log n)$。`,
  "knap": (_,d,l)=>`## 题目描述\n容量 $V$ 的背包，$n$ 件物品各有体积 $w_i$ 和价值 $v_i$。求最大总价值。\n\n## 输入格式\n$n, V$，接下来 $n$ 行 $w_i, v_i$。\n\n## 输出格式\n最大总价值。\n\n## 样例\n\`\`\`\n4 8\n2 3\n3 4\n4 5\n5 6\n\`\`\`\n\`\`\`\n10\n\`\`\`\n\n## 数据范围\n$n \\le 10^4, V \\le 10^4$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n0-1背包 $O(nV)$，滚动数组优化空间。`,
  "tree": (_,d,l)=>`## 题目描述\n给定一棵 $n$ 节点的树（$n-1$ 条边的连通无环图），进行遍历、查询或树形DP。\n\n## 输入格式\n$n$，接下来 $n-1$ 行边 $u, v$。\n\n## 输出格式\n根据要求输出。\n\n## 样例\n\`\`\`\n5\n1 2\n1 3\n2 4\n2 5\n\`\`\`\n\`\`\`\n3\n\`\`\`\n\n## 数据范围\n$n \\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n树的遍历常用 DFS，树形DP自底向上计算。`,
  "mst": (_,d,l)=>`## 题目描述\n无向连通图，求最小生成树（MST）的边权之和。\n\n## 输入格式\n$n, m$，接下来 $m$ 行 $u, v, w$。\n\n## 输出格式\nMST 总权值。\n\n## 样例\n\`\`\`\n4 5\n1 2 2\n1 3 2\n1 4 3\n2 3 4\n3 4 3\n\`\`\`\n\`\`\`\n7\n\`\`\`\n\n## 数据范围\n$n \\le 5000, m \\le 2\\times 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\nKruskal：边排序+并查集。Prim：适合稠密图。`,
  "topo": (_,d,l)=>`## 题目描述\n对有向无环图（DAG）进行拓扑排序。\n\n## 输入格式\n$n, m$，$m$ 条有向边 $u \\to v$。\n\n## 输出格式\n拓扑序，若存在环输出 -1。\n\n## 样例\n\`\`\`\n4 3\n1 2\n2 4\n1 3\n\`\`\`\n\`\`\`\n1 2 3 4\n\`\`\`\n\n## 数据范围\n$n \\le 10^5, m \\le 2\\times 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n队列维护入度为 0 的节点。`,
  "prefix": (_,d,l)=>`## 题目描述\n长度为 $n$ 的数列和 $m$ 个查询，每次查询区间和。\n\n## 输入格式\n$n, m$，数列，$m$ 行 $l, r$。\n\n## 输出格式\n$m$ 行区间和。\n\n## 样例\n\`\`\`\n5 3\n1 2 3 4 5\n1 3\n2 5\n1 5\n\`\`\`\n\`\`\`\n6\n14\n15\n\`\`\`\n\n## 数据范围\n$n, m \\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n$O(n)$ 预处理前缀和，$O(1)$ 查询。`,
  "bpg": (_,d,l)=>`## 题目描述\n判断图是否为二分图，或求二分图最大匹配。\n\n## 输入格式\n$n, m$，$m$ 条边。\n\n## 输出格式\n最大匹配数或判断结果。\n\n## 样例\n\`\`\`\n4 4\n1 2\n1 3\n2 4\n3 4\n\`\`\`\n\`\`\`\n2\n\`\`\`\n\n## 数据范围\n$n \\le 10^5, m \\le 2\\times 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n染色法判断二分图，匈牙利算法求最大匹配。`,
  "flow": (_,d,l)=>`## 题目描述\n有向图含源点 $S$ 和汇点 $T$，每条边有容量限制，求最大流。\n\n## 输入格式\n$n, m, S, T$，$m$ 条边 $u, v, w$。\n\n## 输出格式\n最大流的值。\n\n## 样例\n\`\`\`\n4 5 1 4\n1 2 20\n1 3 10\n2 3 5\n2 4 10\n3 4 20\n\`\`\`\n\`\`\`\n30\n\`\`\`\n\n## 数据范围\n$n \\le 200, m \\le 5000$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\nDinic 算法 $O(n^2m)$。`,
  "kmp": (_,d,l)=>`## 题目描述\n文本串 $S$ 和模式串 $T$，求 $T$ 在 $S$ 中的所有出现位置。\n\n## 输入格式\n第一行 $S$，第二行 $T$。\n\n## 输出格式\n每行一个位置（从 1 开始）。\n\n## 样例\n\`\`\`\nABABABC\nABA\n\`\`\`\n\`\`\`\n1\n3\n0 0 1\n\`\`\`\n\n## 数据范围\n$|S|, |T| \\le 10^6$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\nKMP $O(|S|+|T|)$，next 数组避免重复匹配。`,
  "nt": (_,d,l)=>`## 题目描述\n数论问题：最大公约数、最小公倍数、逆元、同余方程、素数判定、欧拉函数等。\n\n## 输入格式\n一行或多个整数。\n\n## 输出格式\n计算结果。\n\n## 样例\n\`\`\`\n12 18\n\`\`\`\n\`\`\`\n6\n36\n\`\`\`\n\n## 数据范围\n在合理范围内，视具体题目可能需要取模。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n扩欧(exgcd)解 $ax+by=\\gcd$；费马小定理 $a^{p-2}\\equiv a^{-1}\\pmod p$（$p$ 素数）。`,
  "sieve": (_,d,l)=>`## 题目描述\n给定 $n$，筛出 $[1,n]$ 内的所有素数。\n\n## 输入格式\n一个整数 $n$。\n\n## 输出格式\n所有素数或按要求输出。\n\n## 样例\n\`\`\`\n20\n\`\`\`\n\`\`\`\n2 3 5 7 11 13 17 19\n\`\`\`\n\n## 数据范围\n$n \\le 10^8$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n埃拉托斯特尼筛法 $O(n\\log\\log n)$；欧拉线性筛 $O(n)$。`,
  "qp": (_,d,l)=>`## 题目描述\n求 $a^b \\bmod p$ 的值。\n\n## 输入格式\n$a, b, p$。\n\n## 输出格式\n$a^b \\bmod p$。\n\n## 样例\n\`\`\`\n2 10 9\n\`\`\`\n\`\`\`\n7\n\`\`\`\n\n## 数据范围\n$0 \\le a, b < 2^{31}$，$1 \\le p < 2^{31}$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\n二进制快速幂 $O(\\log b)$。`,
  "nim": (_,d,l)=>`## 题目描述\n双方轮流操作，不能操作者输。判断先手是否必胜。\n\n## 输入格式\n输入博弈的初始状态。\n\n## 输出格式\n先手必胜输出 Yes，否则输出 No。\n\n## 样例\n\`\`\`\n2\n2 3\n\`\`\`\n\`\`\`\nYes\n\`\`\`\n\n## 数据范围\n$n \\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\nNim 游戏：所有堆异或和 ≠ 0 则先手必胜。`,
  "st": (_,d,l)=>`## 题目描述\n数列长度 $n$，$m$ 次静态区间最大值查询。\n\n## 输入格式\n$n, m$，数列，$m$ 个查询 $l, r$。\n\n## 输出格式\n$m$ 行区间最大值。\n\n## 样例\n\`\`\`\n8 8\n9 3 1 7 5 6 0 8\n1 6\n1 5\n2 7\n2 6\n1 8\n\`\`\`\n\`\`\`\n9\n9\n7\n7\n9\n\`\`\`\n\n## 数据范围\n$n \\le 10^5, m \\le 2\\times 10^6$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\nST 表 $O(n\\log n)$ 预处理，$O(1)$ 查询。`,
  "scc": (_,d,l)=>`## 题目描述\n求有向图的所有强连通分量（SCC），其中任意两点可互相到达。\n\n## 输入格式\n$n, m$，$m$ 条有向边。\n\n## 输出格式\nSCC 数量及各分量顶点。\n\n## 样例\n\`\`\`\n5 5\n1 2\n2 3\n3 1\n2 4\n4 5\n\`\`\`\n\`\`\`\n3\n1 2 3\n4\n5\n\`\`\`\n\n## 数据范围\n$n \\le 10^4, m \\le 10^5$。\n\n## 提示\n难度：${d} | 标签：${l.join("、")}\nTarjan 算法 $O(n+m)$，缩点后为 DAG。`,
};

// 模板匹配
function pick(title: string, tags: string[], diff: string): DescFN {
  const l = tags.map(t => t.toLowerCase());
  const d = diff || 'POPULAR';
  if (l.some(x=>x.includes("网络流")||x.includes("最大流")||x.includes("dinic"))) return TMPS.flow;
  if (l.some(x=>x.includes("强连通")||x.includes("tarjan")||x.includes("scc"))) return TMPS.scc;
  if (l.some(x=>x.includes("st表")||x.includes("rmq")||x.includes("稀疏表"))) return TMPS.st;
  if (l.some(x=>["博弈","nim","sg函数"].includes(x)||x.includes("nim"))) return TMPS.nim;
  if (l.some(x=>x.includes("快速幂")||x.includes("矩阵快速")||x.includes("龟速乘"))) return TMPS.qp;
  if (l.some(x=>x.includes("素数筛")||x.includes("质数筛")||x.includes("筛法")||x.includes("线性筛"))) return TMPS.sieve;
  if (l.some(x=>x.includes("数论")||x.includes("同余")||x.includes("互质")||x.includes("裴蜀")||x.includes("逆元"))) return TMPS.nt;
  if (l.some(x=>x.includes("kmp")||x.includes("自动机")&&x.includes("字符串"))) return TMPS.kmp;
  if (l.some(x=>x.includes("线段树"))) return TMPS.seg;
  if (l.some(x=>x.includes("树状数组")||x.includes("fenwick"))) return TMPS.bit;
  if (l.some(x=>x.includes("并查集"))) return TMPS.uf;
  if (l.some(x=>x.includes("最小生成树")||x.includes("mst"))) return TMPS.mst;
  if (l.some(x=>x.includes("拓扑"))) return TMPS.topo;
  if (l.some(x=>["前缀和","差分","区间和"].includes(x)||x.includes("前缀和"))) return TMPS.prefix;
  if (l.some(x=>x.includes("二分图")||x.includes("匹配"))) return TMPS.bpg;
  if (l.some(x=>x.includes("二分")||x.includes("折半"))) return TMPS.bs;
  if (l.some(x=>x.includes("贪心"))) return TMPS.greedy;
  if (l.some(x=>x.includes("排序")||x.includes("归并")||x.includes("选择"))) return TMPS.sort;
  if (l.some(x=>x.includes("高精度")||x.includes("大整数")||x.includes("bigint"))) return TMPS.bigint;
  if (l.some(x=>x.includes("图论")||x.includes("最短路")||x.includes("spfa")||x.includes("dijkstra")||x.includes("floyd"))) return TMPS.graph;
  if (l.some(x=>x.includes("背包"))) return TMPS.knap;
  if (l.some(x=>x.includes("树形dp")||x.includes("lca")||x.includes("二叉树")||(x.includes("树")&&!x.includes("线段")))) return TMPS.tree;
  if (l.some(x=>x.includes("dfs")||x.includes("搜")||x.includes("回溯")||x.includes("枚举")||x.includes("全排列"))) return TMPS.dfs;
  if (l.some(x=>x.includes("bfs")||x.includes("连通块")||x.includes("走迷宫"))) return TMPS.bfs;
  if (l.some(x=>x.includes("动态")||x.includes("dp")||x.includes("lis")||x.includes("lcs")||x.includes("区间")||x.includes("状压"))) return TMPS.dp;
  if (l.some(x=>x.includes("堆")||x.includes("优先队列")||x.includes("单调队列")||x.includes("栈")||x.includes("链表"))) return TMPS.ds;
  if (l.some(x=>x.includes("字符")||x.includes("串")||x.includes("哈希")||x.includes("trie"))) return TMPS.str;
  if (l.some(x=>x.includes("数学")||x.includes("数")||x.includes("期望")||x.includes("组合"))) return TMPS.math;
  if (l.some(x=>x.includes("模拟"))) return TMPS.sim;
  if (diff === 'BEGINNER') return TMPS.sim;
  if (l.includes("入门")) return TMPS.sim;
  return TMPS.math;
}

async function main() {
  const problems = await p.problem.findMany({
    include: { versions: { where: { isCurrent: true }, take: 1 }, tags: { select: { name: true } } }
  });
  let updated = 0;
  for (const prob of problems) {
    const ver = prob.versions[0];
    if (!ver) continue;
    const tags = prob.tags.map(t => t.name);
    const difficulty = prob.difficulty || 'POPULAR';
    const fn = pick(prob.title, tags, difficulty);
    const desc = fn(prob.title, difficulty, tags);
    await p.problemVersion.update({ where: { id: ver.id }, data: { description: desc } });
    updated++;
    if (updated % 150 === 0) console.log(`  ${updated}...`);
  }
  console.log(`Done: ${updated} descriptions written`);
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
