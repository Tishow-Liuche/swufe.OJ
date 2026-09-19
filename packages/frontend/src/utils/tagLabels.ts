// Display-only translations: keep source identifiers for filtering and synchronisation.
const names: Record<string, string> = {
  'greedy':'贪心','math':'数学','implementation':'模拟','special judge':'特殊判题','dp':'动态规划',
  'constructive algorithms':'构造','brute force':'暴力枚举','data structures':'数据结构','sortings':'排序',
  'binary search':'二分查找','dfs and similar':'深度优先搜索','graphs':'图论','number theory':'数论',
  'strings':'字符串','trees':'树','combinatorics':'组合数学','two pointers':'双指针','bitmasks':'位运算',
  '*special':'特殊题','dsu':'并查集','ad-hoc':'思维题','geometry':'计算几何','shortest paths':'最短路',
  'games':'博弈论','divide and conquer':'分治','interactive':'交互题','hashing':'哈希','probabilities':'概率',
  'bitset':'位集合','flows':'网络流','matrices':'矩阵','fft':'快速傅里叶变换','string suffix structures':'字符串后缀结构',
  'ternary search':'三分查找','graph matchings':'图匹配','meet-in-the-middle':'折半搜索','expression parsing':'表达式解析',
  '2-sat':'二元可满足性','k-d tree':'多维搜索树','chinese remainder theorem':'中国剩余定理',
  'schedules':'调度','communication':'通信','dfs':'深度优先搜索','bfs':'广度优先搜索','lis':'最长上升子序列',
  'lcs':'最长公共子序列','dancing links':'舞蹈链','floyd':'全源最短路','a*':'启发式搜索',
  'icpc':'国际大学生程序设计竞赛','ccpc':'中国大学生程序设计竞赛','usaco':'美国信息学奥赛',
  'google code jam':'谷歌编程挑战赛','google kick start':'谷歌编程新星赛','thupc':'清华大学程序设计竞赛',
  'nerc/neerc':'东北欧区域赛','noi':'全国信息学奥林匹克竞赛','ynoi':'模拟信息学竞赛',
  'nac':'北美锦标赛','wf':'世界总决赛','cerc':'中欧区域赛','ioi':'国际信息学奥林匹克竞赛',
  'nwrrc':'西北俄罗斯区域赛','ctsc/cts':'国家集训队选拔','gesp':'编程能力等级认证',
  'apio':'亚洲与太平洋地区信息学奥赛','stl':'标准模板库','cspro':'计算机软件专业认证',
  'wc':'信息学冬令营','ec final':'亚洲区域赛东部大陆决赛','code+':'联合命题赛',
  'moscow olympiad':'莫斯科信息学奥赛','seerc':'东南欧区域赛','thus c':'清华夏令营','thusc':'清华夏令营',
  'noi online':'全国信息学在线能力测试','agm':'算术几何平均','thuwc':'清华冬令营',
  'swer c':'西南欧区域赛','swerc':'西南欧区域赛','noip':'全国信息学联赛','paio':'泛非信息学奥赛',
  'csp-j':'非专业级软件能力认证入门级',
  'tarjan':'塔扬算法',
};
const mixed: Record<string, string> = {
  'O2优化':'二级编译优化','动态规划 DP':'动态规划','深度优先搜索 DFS':'深度优先搜索','广度优先搜索 BFS':'广度优先搜索',
  '哈希 hashing':'哈希','树形 DP':'树形动态规划','状压 DP':'状态压缩动态规划','背包 DP':'背包动态规划',
  '双指针 two-pointer':'双指针','最近公共祖先 LCA':'最近公共祖先','字典树 Trie':'字典树','ST 表':'稀疏表',
  '快速数论变换 NTT':'快速数论变换','快速傅里叶变换 FFT':'快速傅里叶变换','最大公约数 gcd':'最大公约数',
  '区间 DP':'区间动态规划','数位 DP':'数位动态规划','动态树 LCT':'动态树','后缀数组 SA':'后缀数组',
  'cdq 分治':'分维分治','NOIP 提高组':'全国信息学联赛提高组','NOIP 普及组':'全国信息学联赛普及组',
  'NOI 导刊':'全国信息学竞赛导刊','KMP 算法':'字符串前缀匹配算法','颜色段均摊（珂朵莉树 ODT）':'颜色段均摊（珂朵莉树）',
  '后缀自动机 SAM':'后缀自动机','AC 自动机':'多模式匹配自动机','Floyd 算法':'全源最短路算法',
  '线性 DP':'线性动态规划','CSP-J 入门级':'非专业级软件能力认证入门级','CSP-S 提高级':'非专业级软件能力认证提高级',
  'Fibonacci 数列':'斐波那契数列','Kruskal 重构树':'克鲁斯卡尔重构树','中国剩余定理 CRT':'中国剩余定理',
  '折半搜索 meet in the middle':'折半搜索','凸完全单调性（wqs 二分）':'凸完全单调性（带权二分）',
  '快速沃尔什变换 FWT':'快速沃尔什变换','Manacher 算法':'马拉车算法','动态 DP':'动态动态规划',
  '轮廓线 DP':'轮廓线动态规划','Lucas 定理':'卢卡斯定理','Stirling 数':'斯特林数','Catalan 数':'卡特兰数',
  'SG 函数':'斯普拉格—格兰迪函数','吉司机线段树 segment tree beats':'吉司机线段树',
  '大步小步算法 BSGS':'大步小步算法','快速莫比乌斯变换 FMT':'快速莫比乌斯变换',
  '回文自动机 PAM':'回文自动机','Dilworth 定理':'狄尔沃斯定理','Prüfer 序列':'普吕弗序列',
  '斜率维护技巧 slope trick':'斜率维护技巧','Z 函数':'扩展前缀匹配函数','Pólya 定理':'波利亚定理',
  'DP 套 DP':'动态规划嵌套','Dirichlet 卷积':'狄利克雷卷积','KTT / Kinetic Tournament Tree':'动态锦标赛树',
  'Stern-Brocot 树':'斯特恩—布罗科特树','启发式迭代加深搜索 IDA*':'启发式迭代加深搜索',
  'LGV 引理':'不相交路径计数引理','闵可夫斯基和 Minkowski sum':'闵可夫斯基和','Bézout 定理':'裴蜀定理',
  'A*  算法':'启发式搜索算法','Hall 定理':'霍尔定理','Lyndon 分解':'林登分解',
  '区间DP':'区间动态规划','树形DP':'树形动态规划','状压DP':'状态压缩动态规划','多维DP':'多维动态规划',
  'Berlekamp-Massey(BM) 算法':'伯莱坎普—梅西算法','爬山算法 Local search':'爬山算法',
  '随机游走 Markov Chain':'随机游走（马尔可夫链）','Nim 积':'尼姆积'
};
const contests: Record<string, string> = {
  COCI:'克罗地亚信息学公开赛',POI:'波兰信息学奥赛',PA:'波兰算法竞赛',JOI:'日本信息学奥赛',
  BalticOI:'波罗的海信息学奥赛','JOISC/JOIST':'日本信息学春季训练赛',UOI:'乌克兰信息学奥赛',
  CEOI:'中欧信息学奥赛',ROI:'俄罗斯信息学奥赛',ROIR:'俄罗斯信息学区域赛',CCC:'加拿大计算竞赛',
  NOISG:'新加坡信息学奥赛',CCO:'加拿大信息学奥赛',KOI:'韩国信息学奥赛',CTT:'清华与北大集训',
  COTS:'克罗地亚国家队选拔',KTSC:'韩国国家队选拔',COI:'克罗地亚信息学奥赛',
  eJOI:'欧洲青少年信息学奥赛',EGOI:'欧洲女子信息学奥赛',RMI:'罗马尼亚数学信息学竞赛',
  NordicOI:'北欧信息学奥赛',BalkanOI:'巴尔干信息学奥赛',PO:'瑞典信息学奥赛',
  IATI:'保加利亚国际信息学锦标赛','MCC/MCO':'马来西亚计算竞赛',INOI:'伊朗信息学奥赛',
};
export function tagLabel(name: string): string {
  const text = String(name || '').trim();
  if (mixed[text]) return mixed[text];
  if (names[text.toLowerCase()]) return names[text.toLowerCase()]!;
  const prefix = text.split('（')[0]!;
  return contests[prefix] || text;
}
