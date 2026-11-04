import {structureSynthetic,buildPlan} from '../../src/agent-preview/index.mjs';
import {executeExistingModuleDemo} from '../../src/agent-preview/existing-module-demo.mjs';
const draft=structureSynthetic('Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 확인 과정, 배운 점 포함');
console.log(JSON.stringify(await executeExistingModuleDemo(buildPlan(draft),draft),null,2));
