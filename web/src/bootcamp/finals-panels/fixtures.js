// 명시적 합성 fixture — 실제 모듈 출력을 그대로 박아 둔다
//
// **자동으로 실제 자료를 대신하지 않는다.** 어댑터가 실제 모드일 때는
// 이 값을 쓰지 않고 빈 상태·오류·로딩을 그대로 보여준다(본부 지침).
//
// 생성 기준: packages/clear-core/src/index.mjs · src/operational-metrics/index.mjs
// 모양이 어긋나면 web/tests/finals.test.mjs 가 실제 모듈과 대조해 실패시킨다.

export const PREVIEW_SOURCE = "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유";

export const PREVIEW_DRAFT = Object.freeze({
  "version": "clear-preview-draft.1",
  "executionMode": "SYNTHETIC_RULES",
  "actualModelCall": false,
  "sourceText": "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유",
  "sourceHash": "4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff",
  "clauses": [
    {
      "id": "clause-1",
      "start": 0,
      "end": 12,
      "text": "Moodle 활동 완료"
    },
    {
      "id": "clause-2",
      "start": 14,
      "end": 26,
      "text": "Moodle 과제 제출"
    },
    {
      "id": "clause-3",
      "start": 28,
      "end": 55,
      "text": "회고에 수행 내용, 문제해결 과정, 배운 점 포함"
    },
    {
      "id": "clause-4",
      "start": 57,
      "end": 89,
      "text": "HackerRank Python (Basic) 인증서 보유"
    }
  ],
  "conditions": [
    {
      "id": "condition-1",
      "clauseId": "clause-1",
      "capability": "MOODLE_ACTIVITY_COMPLETION.1",
      "target": "python-intro"
    },
    {
      "id": "condition-2",
      "clauseId": "clause-2",
      "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
      "target": "python-assignment"
    },
    {
      "id": "condition-3",
      "clauseId": "clause-3",
      "capability": "REFLECTION_REQUIRED_TOPICS.1",
      "target": "python-reflection"
    },
    {
      "id": "condition-4",
      "clauseId": "clause-4",
      "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
      "target": "python-basic"
    }
  ],
  "questions": [],
  "status": "READY",
  "draftHash": "b97c46ea32c32043616c2d464ec501a6e509143ad8812d7ba8ee5fa9833bb234"
});

export const PREVIEW_PLAN = Object.freeze({
  "version": "clear-preview-plan.1",
  "executionMode": "PUBLIC_SYNTHETIC",
  "sourceHash": "4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff",
  "draftHash": "b97c46ea32c32043616c2d464ec501a6e509143ad8812d7ba8ee5fa9833bb234",
  "steps": [
    {
      "id": "step-1",
      "tool": "moodle.activity.public",
      "version": "1",
      "conditionId": "condition-1",
      "input": {
        "clauseId": "clause-1",
        "target": "python-intro"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
    },
    {
      "id": "step-2",
      "tool": "moodle.assignment.public",
      "version": "1",
      "conditionId": "condition-2",
      "input": {
        "clauseId": "clause-2",
        "target": "python-assignment"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
    },
    {
      "id": "step-3",
      "tool": "reflection.topics.public",
      "version": "1",
      "conditionId": "condition-3",
      "input": {
        "clauseId": "clause-3",
        "target": "python-reflection"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
    },
    {
      "id": "step-4",
      "tool": "hackerrank.certificate.public",
      "version": "1",
      "conditionId": "condition-4",
      "input": {
        "clauseId": "clause-4",
        "target": "python-basic"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
    }
  ],
  "planHash": "3d6bee2f7186601e3f389f56d62b4fe3dad9bc4b968d06b323a556ce7feccbb6"
});

export const PREVIEW_RESULT = Object.freeze({
  "version": "clear-preview-result.1",
  "executionMode": "PUBLIC_SYNTHETIC",
  "actualModelCall": false,
  "sourceHash": "4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff",
  "planHash": "3d6bee2f7186601e3f389f56d62b4fe3dad9bc4b968d06b323a556ce7feccbb6",
  "hashStatus": "VERIFIED",
  "scope": "PRECONFIGURATION_ONLY",
  "automaticEligibility": false,
  "paymentAllowed": false,
  "calls": [
    "moodle.activity.public",
    "moodle.assignment.public",
    "reflection.topics.public",
    "hackerrank.certificate.public"
  ],
  "observations": [
    {
      "stepId": "step-1",
      "conditionId": "condition-1",
      "tool": "moodle.activity.public",
      "state": "MET_IN_PUBLIC_FIXTURE",
      "record": {
        "kind": "ACTIVITY",
        "completion": "COMPLETED",
        "tracking": "AUTOMATIC"
      },
      "recordHash": "a4f67ebd0d07059f02b6761859205e8e403d376d785741ae763b5f9aecc720e1",
      "evidence": [],
      "authenticity": "SYNTHETIC_UNVERIFIED",
      "signatureVerified": false
    },
    {
      "stepId": "step-2",
      "conditionId": "condition-2",
      "tool": "moodle.assignment.public",
      "state": "MET_IN_PUBLIC_FIXTURE",
      "record": {
        "kind": "ASSIGNMENT",
        "status": "submitted",
        "gradingRequired": false
      },
      "recordHash": "056011c8e4f647dda3241d8a0ddcb3fb7a14e3360bb2596044aae52d26e9fb97",
      "evidence": [],
      "authenticity": "SYNTHETIC_UNVERIFIED",
      "signatureVerified": false
    },
    {
      "stepId": "step-3",
      "conditionId": "condition-3",
      "tool": "reflection.topics.public",
      "state": "MET_IN_PUBLIC_FIXTURE",
      "record": {
        "kind": "REFLECTION",
        "text": "수행: 반복문을 구현했다. 확인: 빈 목록 입력으로 동작을 확인했다. 배움: 경계값 검사가 필요함을 배웠다.",
        "quotes": [
          "반복문을 구현했다.",
          "빈 목록 입력으로 동작을 확인했다.",
          "경계값 검사가 필요함을 배웠다."
        ]
      },
      "recordHash": "3faabae67ca1e7e4b495370229073d168bf9e0a0964e2291cc6d9a7b66ebbae8",
      "evidence": [
        {
          "topic": "work-performed",
          "quote": "반복문을 구현했다.",
          "start": 4,
          "end": 14
        },
        {
          "topic": "problem-solving-process",
          "quote": "빈 목록 입력으로 동작을 확인했다.",
          "start": 19,
          "end": 38
        },
        {
          "topic": "learning-takeaway",
          "quote": "경계값 검사가 필요함을 배웠다.",
          "start": 43,
          "end": 60
        }
      ],
      "authenticity": "SYNTHETIC_UNVERIFIED",
      "signatureVerified": false
    },
    {
      "stepId": "step-4",
      "conditionId": "condition-4",
      "tool": "hackerrank.certificate.public",
      "state": "MET_IN_PUBLIC_FIXTURE",
      "record": {
        "kind": "CERTIFICATE",
        "name": "Python (Basic)",
        "issuerStatus": "test_passed",
        "signatureVerified": false
      },
      "recordHash": "1dd223630498b1555dde7a181786623c7434922a5e2ab3b18ebe5730548cdd5f",
      "evidence": [],
      "authenticity": "SYNTHETIC_UNVERIFIED",
      "signatureVerified": false
    }
  ]
});

export const METRICS_INPUT = Object.freeze({
  "version": "clear-operational-metrics-input.1",
  "scope": {
    "applicationRef": "demo-application",
    "runId": "demo-run",
    "epochRef": "demo-clock",
    "accessScopeRef": "demo-access",
    "mode": "SYNTHETIC",
    "source": "FIXTURE"
  },
  "coverage": {
    "verification": true,
    "attempts": true,
    "mandatory": true,
    "exceptions": false,
    "human": false
  },
  "events": [
    {
      "id": "login",
      "kind": "MANDATORY",
      "startMs": 0,
      "endMs": 100,
      "scope": {
        "applicationRef": "demo-application",
        "runId": "demo-run",
        "epochRef": "demo-clock",
        "accessScopeRef": "demo-access",
        "mode": "SYNTHETIC",
        "source": "FIXTURE"
      },
      "actionRef": "login-step",
      "workKind": "LOGIN"
    },
    {
      "id": "first",
      "kind": "ATTEMPT",
      "startMs": 100,
      "endMs": 400,
      "scope": {
        "applicationRef": "demo-application",
        "runId": "demo-run",
        "epochRef": "demo-clock",
        "accessScopeRef": "demo-access",
        "mode": "SYNTHETIC",
        "source": "FIXTURE"
      },
      "operationRef": "verify-activity",
      "conditionRef": "activity",
      "automation": true,
      "attempt": 1,
      "outcome": "FAILED"
    },
    {
      "id": "second",
      "kind": "ATTEMPT",
      "startMs": 500,
      "endMs": 700,
      "scope": {
        "applicationRef": "demo-application",
        "runId": "demo-run",
        "epochRef": "demo-clock",
        "accessScopeRef": "demo-access",
        "mode": "SYNTHETIC",
        "source": "FIXTURE"
      },
      "operationRef": "verify-activity",
      "conditionRef": "activity",
      "automation": true,
      "attempt": 2,
      "outcome": "SUCCEEDED"
    },
    {
      "id": "verified",
      "kind": "VERIFIED",
      "startMs": 100,
      "endMs": 700,
      "scope": {
        "applicationRef": "demo-application",
        "runId": "demo-run",
        "epochRef": "demo-clock",
        "accessScopeRef": "demo-access",
        "mode": "SYNTHETIC",
        "source": "FIXTURE"
      },
      "conditionRef": "activity",
      "automation": true
    }
  ]
});

export const METRICS_SUMMARY = Object.freeze({
  "version": "clear-operational-metrics-summary.1",
  "scope": {
    "applicationRef": "demo-application",
    "runId": "demo-run",
    "epochRef": "demo-clock",
    "accessScopeRef": "demo-access",
    "mode": "SYNTHETIC",
    "source": "FIXTURE",
    "type": "APPLICATION_RUN"
  },
  "coverage": {
    "verification": true,
    "attempts": true,
    "mandatory": true,
    "exceptions": false,
    "human": false,
    "caseCompletion": false
  },
  "eventCount": 4,
  "verification": {
    "applicationsWithVerifiedConditions": 1,
    "verifiedConditions": 1,
    "automatedVerifiedConditions": 1,
    "conditions": [
      {
        "conditionRef": "activity",
        "automated": true
      }
    ]
  },
  "operations": {
    "logical": 1,
    "attempts": 2,
    "retries": 1,
    "failedAttempts": 1,
    "automatedCompleted": 1
  },
  "interventions": {
    "mandatory": 1,
    "exceptions": null
  },
  "time": {
    "overallElapsedMs": null,
    "recordedVerificationWallMs": 600,
    "recordedWaitingWallMs": null,
    "recordedPersonMs": null
  }
});

/** 패널이 받는 모양 하나로 묶은 것. 어댑터가 합성 모드에서 이걸 돌려준다 */
export const PREVIEW_PAYLOAD = Object.freeze({
  draft: PREVIEW_DRAFT,
  plan: PREVIEW_PLAN,
  check: Object.freeze({"ok":true,"errors":[],"sourceHash":"4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff","planHash":"3d6bee2f7186601e3f389f56d62b4fe3dad9bc4b968d06b323a556ce7feccbb6"}),
  result: PREVIEW_RESULT,
});

/**
 * 조건 변화 시연 — ① 강의+과제 → ② 회고 추가 → ③ HackerRank 추가.
 *
 * 단계마다 **실제 모듈을 돌려** 뽑았다. 조건이 늘면 도구와 계획이 따라
 * 느는 것이 보여야 한다 — ①은 도구 2개, ②는 3개, ③은 4개다.
 * 합성 모드의 어댑터는 원문이 이 셋 중 하나와 정확히 같을 때만 답한다.
 * 직접 고친 문장은 실제 모듈이 연결돼야 돈다.
 */
export const PRESETS = Object.freeze([
  {
    "id": "stage-1",
    "label": "① 강의 + 과제",
    "source": "Moodle 활동 완료; Moodle 과제 제출",
    "payload": {
      "draft": {
        "version": "clear-preview-draft.1",
        "executionMode": "SYNTHETIC_RULES",
        "actualModelCall": false,
        "sourceText": "Moodle 활동 완료; Moodle 과제 제출",
        "sourceHash": "806d7fc8f2e06104b373ea4d77924328bc6a901085996df5faf97f461344b8a0",
        "clauses": [
          {
            "id": "clause-1",
            "start": 0,
            "end": 12,
            "text": "Moodle 활동 완료"
          },
          {
            "id": "clause-2",
            "start": 14,
            "end": 26,
            "text": "Moodle 과제 제출"
          }
        ],
        "conditions": [
          {
            "id": "condition-1",
            "clauseId": "clause-1",
            "capability": "MOODLE_ACTIVITY_COMPLETION.1",
            "target": "python-intro"
          },
          {
            "id": "condition-2",
            "clauseId": "clause-2",
            "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
            "target": "python-assignment"
          }
        ],
        "questions": [],
        "status": "READY",
        "draftHash": "fc6a5dc59233aed2b716057d42d761400c1733945e0ef136eca087bcb45805f6"
      },
      "plan": {
        "version": "clear-preview-plan.1",
        "executionMode": "PUBLIC_SYNTHETIC",
        "sourceHash": "806d7fc8f2e06104b373ea4d77924328bc6a901085996df5faf97f461344b8a0",
        "draftHash": "fc6a5dc59233aed2b716057d42d761400c1733945e0ef136eca087bcb45805f6",
        "steps": [
          {
            "id": "step-1",
            "tool": "moodle.activity.public",
            "version": "1",
            "conditionId": "condition-1",
            "input": {
              "clauseId": "clause-1",
              "target": "python-intro"
            },
            "dependsOn": [],
            "output": "public-observation.1",
            "onFailure": "STOP"
          },
          {
            "id": "step-2",
            "tool": "moodle.assignment.public",
            "version": "1",
            "conditionId": "condition-2",
            "input": {
              "clauseId": "clause-2",
              "target": "python-assignment"
            },
            "dependsOn": [],
            "output": "public-observation.1",
            "onFailure": "STOP"
          }
        ],
        "planHash": "da98f58ff8002be45efaedcab0471fcbb6ac0274b84fa3332495408543ebb0e8"
      },
      "check": {
        "ok": true,
        "errors": [],
        "sourceHash": "806d7fc8f2e06104b373ea4d77924328bc6a901085996df5faf97f461344b8a0",
        "planHash": "da98f58ff8002be45efaedcab0471fcbb6ac0274b84fa3332495408543ebb0e8"
      },
      "result": {
        "version": "clear-preview-result.1",
        "executionMode": "PUBLIC_SYNTHETIC",
        "actualModelCall": false,
        "sourceHash": "806d7fc8f2e06104b373ea4d77924328bc6a901085996df5faf97f461344b8a0",
        "planHash": "da98f58ff8002be45efaedcab0471fcbb6ac0274b84fa3332495408543ebb0e8",
        "hashStatus": "VERIFIED",
        "scope": "PRECONFIGURATION_ONLY",
        "automaticEligibility": false,
        "paymentAllowed": false,
        "calls": [
          "moodle.activity.public",
          "moodle.assignment.public"
        ],
        "observations": [
          {
            "stepId": "step-1",
            "conditionId": "condition-1",
            "tool": "moodle.activity.public",
            "state": "MET_IN_PUBLIC_FIXTURE",
            "record": {
              "kind": "ACTIVITY",
              "completion": "COMPLETED",
              "tracking": "AUTOMATIC"
            },
            "recordHash": "a4f67ebd0d07059f02b6761859205e8e403d376d785741ae763b5f9aecc720e1",
            "evidence": [],
            "authenticity": "SYNTHETIC_UNVERIFIED",
            "signatureVerified": false
          },
          {
            "stepId": "step-2",
            "conditionId": "condition-2",
            "tool": "moodle.assignment.public",
            "state": "MET_IN_PUBLIC_FIXTURE",
            "record": {
              "kind": "ASSIGNMENT",
              "status": "submitted",
              "gradingRequired": false
            },
            "recordHash": "056011c8e4f647dda3241d8a0ddcb3fb7a14e3360bb2596044aae52d26e9fb97",
            "evidence": [],
            "authenticity": "SYNTHETIC_UNVERIFIED",
            "signatureVerified": false
          }
        ]
      }
    }
  },
  {
    "id": "stage-2",
    "label": "② + 회고",
    "source": "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함",
    "payload": {
      "draft": {
        "version": "clear-preview-draft.1",
        "executionMode": "SYNTHETIC_RULES",
        "actualModelCall": false,
        "sourceText": "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함",
        "sourceHash": "331199d09d1c5dbe27aa96fd5a5c2d3911f8f5ab4edda48cd4400a0fb9474d2e",
        "clauses": [
          {
            "id": "clause-1",
            "start": 0,
            "end": 12,
            "text": "Moodle 활동 완료"
          },
          {
            "id": "clause-2",
            "start": 14,
            "end": 26,
            "text": "Moodle 과제 제출"
          },
          {
            "id": "clause-3",
            "start": 28,
            "end": 55,
            "text": "회고에 수행 내용, 문제해결 과정, 배운 점 포함"
          }
        ],
        "conditions": [
          {
            "id": "condition-1",
            "clauseId": "clause-1",
            "capability": "MOODLE_ACTIVITY_COMPLETION.1",
            "target": "python-intro"
          },
          {
            "id": "condition-2",
            "clauseId": "clause-2",
            "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
            "target": "python-assignment"
          },
          {
            "id": "condition-3",
            "clauseId": "clause-3",
            "capability": "REFLECTION_REQUIRED_TOPICS.1",
            "target": "python-reflection"
          }
        ],
        "questions": [],
        "status": "READY",
        "draftHash": "836f8403e6a0480ad5651d1051674b63765c72333ffdb0b26ae84ed77e939dec"
      },
      "plan": {
        "version": "clear-preview-plan.1",
        "executionMode": "PUBLIC_SYNTHETIC",
        "sourceHash": "331199d09d1c5dbe27aa96fd5a5c2d3911f8f5ab4edda48cd4400a0fb9474d2e",
        "draftHash": "836f8403e6a0480ad5651d1051674b63765c72333ffdb0b26ae84ed77e939dec",
        "steps": [
          {
            "id": "step-1",
            "tool": "moodle.activity.public",
            "version": "1",
            "conditionId": "condition-1",
            "input": {
              "clauseId": "clause-1",
              "target": "python-intro"
            },
            "dependsOn": [],
            "output": "public-observation.1",
            "onFailure": "STOP"
          },
          {
            "id": "step-2",
            "tool": "moodle.assignment.public",
            "version": "1",
            "conditionId": "condition-2",
            "input": {
              "clauseId": "clause-2",
              "target": "python-assignment"
            },
            "dependsOn": [],
            "output": "public-observation.1",
            "onFailure": "STOP"
          },
          {
            "id": "step-3",
            "tool": "reflection.topics.public",
            "version": "1",
            "conditionId": "condition-3",
            "input": {
              "clauseId": "clause-3",
              "target": "python-reflection"
            },
            "dependsOn": [],
            "output": "public-observation.1",
            "onFailure": "STOP"
          }
        ],
        "planHash": "b790d06e23ea891b55fc7e158127ae101a739fcd4fb76befbd8bf7dc7588553d"
      },
      "check": {
        "ok": true,
        "errors": [],
        "sourceHash": "331199d09d1c5dbe27aa96fd5a5c2d3911f8f5ab4edda48cd4400a0fb9474d2e",
        "planHash": "b790d06e23ea891b55fc7e158127ae101a739fcd4fb76befbd8bf7dc7588553d"
      },
      "result": {
        "version": "clear-preview-result.1",
        "executionMode": "PUBLIC_SYNTHETIC",
        "actualModelCall": false,
        "sourceHash": "331199d09d1c5dbe27aa96fd5a5c2d3911f8f5ab4edda48cd4400a0fb9474d2e",
        "planHash": "b790d06e23ea891b55fc7e158127ae101a739fcd4fb76befbd8bf7dc7588553d",
        "hashStatus": "VERIFIED",
        "scope": "PRECONFIGURATION_ONLY",
        "automaticEligibility": false,
        "paymentAllowed": false,
        "calls": [
          "moodle.activity.public",
          "moodle.assignment.public",
          "reflection.topics.public"
        ],
        "observations": [
          {
            "stepId": "step-1",
            "conditionId": "condition-1",
            "tool": "moodle.activity.public",
            "state": "MET_IN_PUBLIC_FIXTURE",
            "record": {
              "kind": "ACTIVITY",
              "completion": "COMPLETED",
              "tracking": "AUTOMATIC"
            },
            "recordHash": "a4f67ebd0d07059f02b6761859205e8e403d376d785741ae763b5f9aecc720e1",
            "evidence": [],
            "authenticity": "SYNTHETIC_UNVERIFIED",
            "signatureVerified": false
          },
          {
            "stepId": "step-2",
            "conditionId": "condition-2",
            "tool": "moodle.assignment.public",
            "state": "MET_IN_PUBLIC_FIXTURE",
            "record": {
              "kind": "ASSIGNMENT",
              "status": "submitted",
              "gradingRequired": false
            },
            "recordHash": "056011c8e4f647dda3241d8a0ddcb3fb7a14e3360bb2596044aae52d26e9fb97",
            "evidence": [],
            "authenticity": "SYNTHETIC_UNVERIFIED",
            "signatureVerified": false
          },
          {
            "stepId": "step-3",
            "conditionId": "condition-3",
            "tool": "reflection.topics.public",
            "state": "MET_IN_PUBLIC_FIXTURE",
            "record": {
              "kind": "REFLECTION",
              "text": "수행: 반복문을 구현했다. 확인: 빈 목록 입력으로 동작을 확인했다. 배움: 경계값 검사가 필요함을 배웠다.",
              "quotes": [
                "반복문을 구현했다.",
                "빈 목록 입력으로 동작을 확인했다.",
                "경계값 검사가 필요함을 배웠다."
              ]
            },
            "recordHash": "3faabae67ca1e7e4b495370229073d168bf9e0a0964e2291cc6d9a7b66ebbae8",
            "evidence": [
              {
                "topic": "work-performed",
                "quote": "반복문을 구현했다.",
                "start": 4,
                "end": 14
              },
              {
                "topic": "problem-solving-process",
                "quote": "빈 목록 입력으로 동작을 확인했다.",
                "start": 19,
                "end": 38
              },
              {
                "topic": "learning-takeaway",
                "quote": "경계값 검사가 필요함을 배웠다.",
                "start": 43,
                "end": 60
              }
            ],
            "authenticity": "SYNTHETIC_UNVERIFIED",
            "signatureVerified": false
          }
        ]
      }
    }
  },
  {
    "id": "stage-3",
    "label": "③ + HackerRank 인증",
    "source": "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유",
    "payload": {
      "draft": {
        "version": "clear-preview-draft.1",
        "executionMode": "SYNTHETIC_RULES",
        "actualModelCall": false,
        "sourceText": "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유",
        "sourceHash": "4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff",
        "clauses": [
          {
            "id": "clause-1",
            "start": 0,
            "end": 12,
            "text": "Moodle 활동 완료"
          },
          {
            "id": "clause-2",
            "start": 14,
            "end": 26,
            "text": "Moodle 과제 제출"
          },
          {
            "id": "clause-3",
            "start": 28,
            "end": 55,
            "text": "회고에 수행 내용, 문제해결 과정, 배운 점 포함"
          },
          {
            "id": "clause-4",
            "start": 57,
            "end": 89,
            "text": "HackerRank Python (Basic) 인증서 보유"
          }
        ],
        "conditions": [
          {
            "id": "condition-1",
            "clauseId": "clause-1",
            "capability": "MOODLE_ACTIVITY_COMPLETION.1",
            "target": "python-intro"
          },
          {
            "id": "condition-2",
            "clauseId": "clause-2",
            "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
            "target": "python-assignment"
          },
          {
            "id": "condition-3",
            "clauseId": "clause-3",
            "capability": "REFLECTION_REQUIRED_TOPICS.1",
            "target": "python-reflection"
          },
          {
            "id": "condition-4",
            "clauseId": "clause-4",
            "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
            "target": "python-basic"
          }
        ],
        "questions": [],
        "status": "READY",
        "draftHash": "b97c46ea32c32043616c2d464ec501a6e509143ad8812d7ba8ee5fa9833bb234"
      },
      "plan": {
        "version": "clear-preview-plan.1",
        "executionMode": "PUBLIC_SYNTHETIC",
        "sourceHash": "4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff",
        "draftHash": "b97c46ea32c32043616c2d464ec501a6e509143ad8812d7ba8ee5fa9833bb234",
        "steps": [
          {
            "id": "step-1",
            "tool": "moodle.activity.public",
            "version": "1",
            "conditionId": "condition-1",
            "input": {
              "clauseId": "clause-1",
              "target": "python-intro"
            },
            "dependsOn": [],
            "output": "public-observation.1",
            "onFailure": "STOP"
          },
          {
            "id": "step-2",
            "tool": "moodle.assignment.public",
            "version": "1",
            "conditionId": "condition-2",
            "input": {
              "clauseId": "clause-2",
              "target": "python-assignment"
            },
            "dependsOn": [],
            "output": "public-observation.1",
            "onFailure": "STOP"
          },
          {
            "id": "step-3",
            "tool": "reflection.topics.public",
            "version": "1",
            "conditionId": "condition-3",
            "input": {
              "clauseId": "clause-3",
              "target": "python-reflection"
            },
            "dependsOn": [],
            "output": "public-observation.1",
            "onFailure": "STOP"
          },
          {
            "id": "step-4",
            "tool": "hackerrank.certificate.public",
            "version": "1",
            "conditionId": "condition-4",
            "input": {
              "clauseId": "clause-4",
              "target": "python-basic"
            },
            "dependsOn": [],
            "output": "public-observation.1",
            "onFailure": "STOP"
          }
        ],
        "planHash": "3d6bee2f7186601e3f389f56d62b4fe3dad9bc4b968d06b323a556ce7feccbb6"
      },
      "check": {
        "ok": true,
        "errors": [],
        "sourceHash": "4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff",
        "planHash": "3d6bee2f7186601e3f389f56d62b4fe3dad9bc4b968d06b323a556ce7feccbb6"
      },
      "result": {
        "version": "clear-preview-result.1",
        "executionMode": "PUBLIC_SYNTHETIC",
        "actualModelCall": false,
        "sourceHash": "4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff",
        "planHash": "3d6bee2f7186601e3f389f56d62b4fe3dad9bc4b968d06b323a556ce7feccbb6",
        "hashStatus": "VERIFIED",
        "scope": "PRECONFIGURATION_ONLY",
        "automaticEligibility": false,
        "paymentAllowed": false,
        "calls": [
          "moodle.activity.public",
          "moodle.assignment.public",
          "reflection.topics.public",
          "hackerrank.certificate.public"
        ],
        "observations": [
          {
            "stepId": "step-1",
            "conditionId": "condition-1",
            "tool": "moodle.activity.public",
            "state": "MET_IN_PUBLIC_FIXTURE",
            "record": {
              "kind": "ACTIVITY",
              "completion": "COMPLETED",
              "tracking": "AUTOMATIC"
            },
            "recordHash": "a4f67ebd0d07059f02b6761859205e8e403d376d785741ae763b5f9aecc720e1",
            "evidence": [],
            "authenticity": "SYNTHETIC_UNVERIFIED",
            "signatureVerified": false
          },
          {
            "stepId": "step-2",
            "conditionId": "condition-2",
            "tool": "moodle.assignment.public",
            "state": "MET_IN_PUBLIC_FIXTURE",
            "record": {
              "kind": "ASSIGNMENT",
              "status": "submitted",
              "gradingRequired": false
            },
            "recordHash": "056011c8e4f647dda3241d8a0ddcb3fb7a14e3360bb2596044aae52d26e9fb97",
            "evidence": [],
            "authenticity": "SYNTHETIC_UNVERIFIED",
            "signatureVerified": false
          },
          {
            "stepId": "step-3",
            "conditionId": "condition-3",
            "tool": "reflection.topics.public",
            "state": "MET_IN_PUBLIC_FIXTURE",
            "record": {
              "kind": "REFLECTION",
              "text": "수행: 반복문을 구현했다. 확인: 빈 목록 입력으로 동작을 확인했다. 배움: 경계값 검사가 필요함을 배웠다.",
              "quotes": [
                "반복문을 구현했다.",
                "빈 목록 입력으로 동작을 확인했다.",
                "경계값 검사가 필요함을 배웠다."
              ]
            },
            "recordHash": "3faabae67ca1e7e4b495370229073d168bf9e0a0964e2291cc6d9a7b66ebbae8",
            "evidence": [
              {
                "topic": "work-performed",
                "quote": "반복문을 구현했다.",
                "start": 4,
                "end": 14
              },
              {
                "topic": "problem-solving-process",
                "quote": "빈 목록 입력으로 동작을 확인했다.",
                "start": 19,
                "end": 38
              },
              {
                "topic": "learning-takeaway",
                "quote": "경계값 검사가 필요함을 배웠다.",
                "start": 43,
                "end": 60
              }
            ],
            "authenticity": "SYNTHETIC_UNVERIFIED",
            "signatureVerified": false
          },
          {
            "stepId": "step-4",
            "conditionId": "condition-4",
            "tool": "hackerrank.certificate.public",
            "state": "MET_IN_PUBLIC_FIXTURE",
            "record": {
              "kind": "CERTIFICATE",
              "name": "Python (Basic)",
              "issuerStatus": "test_passed",
              "signatureVerified": false
            },
            "recordHash": "1dd223630498b1555dde7a181786623c7434922a5e2ab3b18ebe5730548cdd5f",
            "evidence": [],
            "authenticity": "SYNTHETIC_UNVERIFIED",
            "signatureVerified": false
          }
        ]
      }
    }
  }
]);
