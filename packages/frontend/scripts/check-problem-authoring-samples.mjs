import { readFileSync } from 'node:fs';

const createProblem = readFileSync(new URL('../src/views/admin/CreateProblem.vue', import.meta.url), 'utf8');
const editProblem = readFileSync(new URL('../src/views/admin/EditProblem.vue', import.meta.url), 'utf8');

function assert(condition, message) {
  if (!condition) {
    console.error(message);
    process.exitCode = 1;
  }
}

assert(
  createProblem.includes("difficulty: null"),
  'CreateProblem should default authored problems to an unrated/null difficulty option.',
);
assert(
  createProblem.includes('samplePairs') && createProblem.includes('buildSampleText'),
  'CreateProblem should expose three sample input/output pairs and merge filled pairs before submit.',
);
assert(
  /v-for="[^"]*samplePairs"/.test(createProblem),
  'CreateProblem template should render sample pairs from samplePairs.',
);
assert(
  createProblem.includes('value: null') && editProblem.includes('value: null'),
  'CreateProblem and EditProblem should both offer an unrated difficulty option.',
);
assert(
  createProblem.includes("join('\\n---\\n')") || createProblem.includes('join("\\n---\\n")'),
  'Multiple samples should use the ProblemDetail-compatible --- separator.',
);

if (!process.exitCode) console.log('problem authoring sample/difficulty checks passed');
