import { readFileSync } from 'node:fs';

const problemList = readFileSync(new URL('../src/views/ProblemList.vue', import.meta.url), 'utf8');
const difficultyUtil = readFileSync(new URL('../src/utils/pointDifficulty.ts', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

const rowShortLabelUses = problemList.match(/difficultyShortLabel\(problem\.difficulty\)/g) || [];

assert(rowShortLabelUses.length >= 2, '题目列表桌面端和移动端都必须使用短难度标签');
assert(!problemList.includes('{{ difficultyLabel(problem.difficulty) }}'), '题目条块不能显示带英文的完整难度标签');
assert(difficultyUtil.includes("label: 'P1 · 焦点 / Focus'"), '完整标签应保留给详情/辅助场景');
assert(difficultyUtil.includes("shortLabel: 'P1 · 焦点'"), '短标签必须只保留 / 前面的中文难度');
assert(difficultyUtil.includes("return '未评定难度'"), '未评级题目必须显示为“未评定难度”');
assert(!difficultyUtil.includes("level: 'Point 1'"), '难度等级不能再使用 Point 1 长写');

assert(problemList.includes("'/api/problems/metadata'"), 'Problem library metadata must use the full aggregate endpoint.');
assert(!problemList.includes('params: { page: 1, pageSize: 100 }'), 'Problem library tag filters must not be built from a sampled first page.');
assert(!problemList.includes('样本内标签'), 'Problem library tag filter label must not expose sampled tags.');
assert(problemList.includes('tagSearchKeyword'), 'Problem library tag panel must provide an in-panel tag keyword search.');
assert(problemList.includes('visibleTagCounts'), 'Problem library tag panel must render tags filtered by the keyword search.');
assert(problemList.includes('没有匹配标签'), 'Problem library tag panel must show an empty state when no tags match.');

assert(problemList.includes("value: 'UNRATED'"), 'Problem library difficulty filter must include an unrated option.');
assert(problemList.includes("label: '未评定难度'"), 'Problem library difficulty filter must label unrated problems as 未评定难度.');
assert(problemList.includes('item.difficulty === null'), 'Problem library difficulty distribution must count null difficulty as unrated.');

console.log('Point difficulty UI checks passed.');
