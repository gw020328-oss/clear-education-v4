import {structureSynthetic,buildPlan,executePublicDemo} from '@clear/preview-core';
const draft=structureSynthetic('Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 확인 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유');
console.log(JSON.stringify(executePublicDemo(buildPlan(draft),draft),null,2));
