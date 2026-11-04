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

/**
 * 4조건의 모든 조합 15가지. 키는 **정규 순서**(활동 → 과제 → 회고 → HackerRank)로
 * 이어 붙인 정규 문장이다. 읽기 제안이 canonicalText 를 같은 순서로 만들므로
 * 읽히는 조합이면 무엇이든 합성 모드에서 실제 모듈 결과를 보여줄 수 있다.
 * 전부 실제 모듈을 돌려 뽑았고 시험이 다시 대조한다.
 */
export const COMBOS = Object.freeze({
 "Moodle 활동 완료": {
  "capabilities": [
   "MOODLE_ACTIVITY_COMPLETION.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "Moodle 활동 완료",
    "sourceHash": "5a2bea9da267d1dd426e7ef805ccf1295f43931b769be2ccd10683c0d439625f",
    "clauses": [
     {
      "id": "clause-1",
      "start": 0,
      "end": 12,
      "text": "Moodle 활동 완료"
     }
    ],
    "conditions": [
     {
      "id": "condition-1",
      "clauseId": "clause-1",
      "capability": "MOODLE_ACTIVITY_COMPLETION.1",
      "target": "python-intro"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "1a0366cb4598b1271062f26f9913620ba4cead1dbc17eb70a49c774bcf571c70"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "5a2bea9da267d1dd426e7ef805ccf1295f43931b769be2ccd10683c0d439625f",
    "draftHash": "1a0366cb4598b1271062f26f9913620ba4cead1dbc17eb70a49c774bcf571c70",
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
     }
    ],
    "planHash": "f807be934049cd7b778a0f892c7782522965865180a2afbed000ba28c9e0645f"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "5a2bea9da267d1dd426e7ef805ccf1295f43931b769be2ccd10683c0d439625f",
    "planHash": "f807be934049cd7b778a0f892c7782522965865180a2afbed000ba28c9e0645f"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "5a2bea9da267d1dd426e7ef805ccf1295f43931b769be2ccd10683c0d439625f",
    "planHash": "f807be934049cd7b778a0f892c7782522965865180a2afbed000ba28c9e0645f",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "moodle.activity.public"
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
     }
    ]
   }
  }
 },
 "Moodle 과제 제출": {
  "capabilities": [
   "MOODLE_ASSIGNMENT_SUBMISSION.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "Moodle 과제 제출",
    "sourceHash": "72b5c8dae41b95da00bc96d94ca573abc2cf0633b2ee5dccc978a0f35a4b8a34",
    "clauses": [
     {
      "id": "clause-1",
      "start": 0,
      "end": 12,
      "text": "Moodle 과제 제출"
     }
    ],
    "conditions": [
     {
      "id": "condition-1",
      "clauseId": "clause-1",
      "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
      "target": "python-assignment"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "984b7ae00b416211ad547e6e68ff6589445708f4619a2e22fb18657ca9b0967d"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "72b5c8dae41b95da00bc96d94ca573abc2cf0633b2ee5dccc978a0f35a4b8a34",
    "draftHash": "984b7ae00b416211ad547e6e68ff6589445708f4619a2e22fb18657ca9b0967d",
    "steps": [
     {
      "id": "step-1",
      "tool": "moodle.assignment.public",
      "version": "1",
      "conditionId": "condition-1",
      "input": {
       "clauseId": "clause-1",
       "target": "python-assignment"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "00cc909b2636eaeb8ec74bce30a55af9aa0ee430a5cea2e563c07c3e0769b493"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "72b5c8dae41b95da00bc96d94ca573abc2cf0633b2ee5dccc978a0f35a4b8a34",
    "planHash": "00cc909b2636eaeb8ec74bce30a55af9aa0ee430a5cea2e563c07c3e0769b493"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "72b5c8dae41b95da00bc96d94ca573abc2cf0633b2ee5dccc978a0f35a4b8a34",
    "planHash": "00cc909b2636eaeb8ec74bce30a55af9aa0ee430a5cea2e563c07c3e0769b493",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "moodle.assignment.public"
    ],
    "observations": [
     {
      "stepId": "step-1",
      "conditionId": "condition-1",
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
 "Moodle 활동 완료; Moodle 과제 제출": {
  "capabilities": [
   "MOODLE_ACTIVITY_COMPLETION.1",
   "MOODLE_ASSIGNMENT_SUBMISSION.1"
  ],
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
 "회고에 수행 내용, 문제해결 과정, 배운 점 포함": {
  "capabilities": [
   "REFLECTION_REQUIRED_TOPICS.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "회고에 수행 내용, 문제해결 과정, 배운 점 포함",
    "sourceHash": "97a027e7ac0b10dc91981da5a5aaa2713901bb9106ec826e2e91e4a26181deec",
    "clauses": [
     {
      "id": "clause-1",
      "start": 0,
      "end": 27,
      "text": "회고에 수행 내용, 문제해결 과정, 배운 점 포함"
     }
    ],
    "conditions": [
     {
      "id": "condition-1",
      "clauseId": "clause-1",
      "capability": "REFLECTION_REQUIRED_TOPICS.1",
      "target": "python-reflection"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "4d0a3da274694cc9c1e095db1e9361a6ce1f26bf13e959f5026f670b504d363c"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "97a027e7ac0b10dc91981da5a5aaa2713901bb9106ec826e2e91e4a26181deec",
    "draftHash": "4d0a3da274694cc9c1e095db1e9361a6ce1f26bf13e959f5026f670b504d363c",
    "steps": [
     {
      "id": "step-1",
      "tool": "reflection.topics.public",
      "version": "1",
      "conditionId": "condition-1",
      "input": {
       "clauseId": "clause-1",
       "target": "python-reflection"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "0b48bbddb2d1bc7beee8188cdfd0a77b42328beea21ed4804f7809d0f19c3992"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "97a027e7ac0b10dc91981da5a5aaa2713901bb9106ec826e2e91e4a26181deec",
    "planHash": "0b48bbddb2d1bc7beee8188cdfd0a77b42328beea21ed4804f7809d0f19c3992"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "97a027e7ac0b10dc91981da5a5aaa2713901bb9106ec826e2e91e4a26181deec",
    "planHash": "0b48bbddb2d1bc7beee8188cdfd0a77b42328beea21ed4804f7809d0f19c3992",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "reflection.topics.public"
    ],
    "observations": [
     {
      "stepId": "step-1",
      "conditionId": "condition-1",
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
 "Moodle 활동 완료; 회고에 수행 내용, 문제해결 과정, 배운 점 포함": {
  "capabilities": [
   "MOODLE_ACTIVITY_COMPLETION.1",
   "REFLECTION_REQUIRED_TOPICS.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "Moodle 활동 완료; 회고에 수행 내용, 문제해결 과정, 배운 점 포함",
    "sourceHash": "f5c6135fee6c5107179f7d3350afb423f72d60c27757d020cedaf5f5f67d6150",
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
      "end": 41,
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
      "capability": "REFLECTION_REQUIRED_TOPICS.1",
      "target": "python-reflection"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "d077d1caea0c9f2cc95caf3a3e89751a190f455fd5f9c8d8cf5905188d02c40b"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "f5c6135fee6c5107179f7d3350afb423f72d60c27757d020cedaf5f5f67d6150",
    "draftHash": "d077d1caea0c9f2cc95caf3a3e89751a190f455fd5f9c8d8cf5905188d02c40b",
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
      "tool": "reflection.topics.public",
      "version": "1",
      "conditionId": "condition-2",
      "input": {
       "clauseId": "clause-2",
       "target": "python-reflection"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "34fc74a729efc14e289cc63b7603ad15e9d2f1baf503d15ce50cbb87c10c5bfa"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "f5c6135fee6c5107179f7d3350afb423f72d60c27757d020cedaf5f5f67d6150",
    "planHash": "34fc74a729efc14e289cc63b7603ad15e9d2f1baf503d15ce50cbb87c10c5bfa"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "f5c6135fee6c5107179f7d3350afb423f72d60c27757d020cedaf5f5f67d6150",
    "planHash": "34fc74a729efc14e289cc63b7603ad15e9d2f1baf503d15ce50cbb87c10c5bfa",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "moodle.activity.public",
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
 "Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함": {
  "capabilities": [
   "MOODLE_ASSIGNMENT_SUBMISSION.1",
   "REFLECTION_REQUIRED_TOPICS.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함",
    "sourceHash": "4cd40c4582177b2e56fbbef5e8b742c959dcd06b5adcee61874f36ea97992dd7",
    "clauses": [
     {
      "id": "clause-1",
      "start": 0,
      "end": 12,
      "text": "Moodle 과제 제출"
     },
     {
      "id": "clause-2",
      "start": 14,
      "end": 41,
      "text": "회고에 수행 내용, 문제해결 과정, 배운 점 포함"
     }
    ],
    "conditions": [
     {
      "id": "condition-1",
      "clauseId": "clause-1",
      "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
      "target": "python-assignment"
     },
     {
      "id": "condition-2",
      "clauseId": "clause-2",
      "capability": "REFLECTION_REQUIRED_TOPICS.1",
      "target": "python-reflection"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "612b26f81d22a582a290c72752f6f035a372794832d46e5d8682dc6d8128442d"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "4cd40c4582177b2e56fbbef5e8b742c959dcd06b5adcee61874f36ea97992dd7",
    "draftHash": "612b26f81d22a582a290c72752f6f035a372794832d46e5d8682dc6d8128442d",
    "steps": [
     {
      "id": "step-1",
      "tool": "moodle.assignment.public",
      "version": "1",
      "conditionId": "condition-1",
      "input": {
       "clauseId": "clause-1",
       "target": "python-assignment"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     },
     {
      "id": "step-2",
      "tool": "reflection.topics.public",
      "version": "1",
      "conditionId": "condition-2",
      "input": {
       "clauseId": "clause-2",
       "target": "python-reflection"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "395218283a4041fffcf5392c2c4e18082edc7d7fd6f4d6280ebc65a321a1d8ed"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "4cd40c4582177b2e56fbbef5e8b742c959dcd06b5adcee61874f36ea97992dd7",
    "planHash": "395218283a4041fffcf5392c2c4e18082edc7d7fd6f4d6280ebc65a321a1d8ed"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "4cd40c4582177b2e56fbbef5e8b742c959dcd06b5adcee61874f36ea97992dd7",
    "planHash": "395218283a4041fffcf5392c2c4e18082edc7d7fd6f4d6280ebc65a321a1d8ed",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "moodle.assignment.public",
     "reflection.topics.public"
    ],
    "observations": [
     {
      "stepId": "step-1",
      "conditionId": "condition-1",
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
      "stepId": "step-2",
      "conditionId": "condition-2",
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
 "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함": {
  "capabilities": [
   "MOODLE_ACTIVITY_COMPLETION.1",
   "MOODLE_ASSIGNMENT_SUBMISSION.1",
   "REFLECTION_REQUIRED_TOPICS.1"
  ],
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
 "HackerRank Python (Basic) 인증서 보유": {
  "capabilities": [
   "HACKERRANK_CERTIFICATE_HOLDING.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "HackerRank Python (Basic) 인증서 보유",
    "sourceHash": "a1b31fcdaf8c5ec92b2ac9b7971c01acf477bc3d79c8b0580ab91241d1861bb8",
    "clauses": [
     {
      "id": "clause-1",
      "start": 0,
      "end": 32,
      "text": "HackerRank Python (Basic) 인증서 보유"
     }
    ],
    "conditions": [
     {
      "id": "condition-1",
      "clauseId": "clause-1",
      "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
      "target": "python-basic"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "3f3010d38fc8e4663206883b01dfc9b524b98dc08a222b441e00aa929fa8da2f"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "a1b31fcdaf8c5ec92b2ac9b7971c01acf477bc3d79c8b0580ab91241d1861bb8",
    "draftHash": "3f3010d38fc8e4663206883b01dfc9b524b98dc08a222b441e00aa929fa8da2f",
    "steps": [
     {
      "id": "step-1",
      "tool": "hackerrank.certificate.public",
      "version": "1",
      "conditionId": "condition-1",
      "input": {
       "clauseId": "clause-1",
       "target": "python-basic"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "103ead8ef9b5790970abcb6ca983fce9a2fa9a33fb87f466fb722e0244d33b95"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "a1b31fcdaf8c5ec92b2ac9b7971c01acf477bc3d79c8b0580ab91241d1861bb8",
    "planHash": "103ead8ef9b5790970abcb6ca983fce9a2fa9a33fb87f466fb722e0244d33b95"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "a1b31fcdaf8c5ec92b2ac9b7971c01acf477bc3d79c8b0580ab91241d1861bb8",
    "planHash": "103ead8ef9b5790970abcb6ca983fce9a2fa9a33fb87f466fb722e0244d33b95",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "hackerrank.certificate.public"
    ],
    "observations": [
     {
      "stepId": "step-1",
      "conditionId": "condition-1",
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
 },
 "Moodle 활동 완료; HackerRank Python (Basic) 인증서 보유": {
  "capabilities": [
   "MOODLE_ACTIVITY_COMPLETION.1",
   "HACKERRANK_CERTIFICATE_HOLDING.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "Moodle 활동 완료; HackerRank Python (Basic) 인증서 보유",
    "sourceHash": "62561c38b2275506c30340ec73d9187364fe13ba4c8a72b6ccb4365466870dd1",
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
      "end": 46,
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
      "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
      "target": "python-basic"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "d365510af0ebec6682c270c07e234f89a4a0318a4b2607dbf10f0b6617dc59f7"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "62561c38b2275506c30340ec73d9187364fe13ba4c8a72b6ccb4365466870dd1",
    "draftHash": "d365510af0ebec6682c270c07e234f89a4a0318a4b2607dbf10f0b6617dc59f7",
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
      "tool": "hackerrank.certificate.public",
      "version": "1",
      "conditionId": "condition-2",
      "input": {
       "clauseId": "clause-2",
       "target": "python-basic"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "f1004b00ee2fb82b5a6c3438aea7cf4f524e82ec63ba36d8d64a61a462552d37"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "62561c38b2275506c30340ec73d9187364fe13ba4c8a72b6ccb4365466870dd1",
    "planHash": "f1004b00ee2fb82b5a6c3438aea7cf4f524e82ec63ba36d8d64a61a462552d37"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "62561c38b2275506c30340ec73d9187364fe13ba4c8a72b6ccb4365466870dd1",
    "planHash": "f1004b00ee2fb82b5a6c3438aea7cf4f524e82ec63ba36d8d64a61a462552d37",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "moodle.activity.public",
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
 },
 "Moodle 과제 제출; HackerRank Python (Basic) 인증서 보유": {
  "capabilities": [
   "MOODLE_ASSIGNMENT_SUBMISSION.1",
   "HACKERRANK_CERTIFICATE_HOLDING.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "Moodle 과제 제출; HackerRank Python (Basic) 인증서 보유",
    "sourceHash": "e408d7cdb04c15f2b126985a2f8c10ad0a37c5047a1d4d3246585de477dbdf73",
    "clauses": [
     {
      "id": "clause-1",
      "start": 0,
      "end": 12,
      "text": "Moodle 과제 제출"
     },
     {
      "id": "clause-2",
      "start": 14,
      "end": 46,
      "text": "HackerRank Python (Basic) 인증서 보유"
     }
    ],
    "conditions": [
     {
      "id": "condition-1",
      "clauseId": "clause-1",
      "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
      "target": "python-assignment"
     },
     {
      "id": "condition-2",
      "clauseId": "clause-2",
      "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
      "target": "python-basic"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "662a694deaaef25e25fbf3b0a309d153542901ccefa4c3401e4ed027c55c2c98"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "e408d7cdb04c15f2b126985a2f8c10ad0a37c5047a1d4d3246585de477dbdf73",
    "draftHash": "662a694deaaef25e25fbf3b0a309d153542901ccefa4c3401e4ed027c55c2c98",
    "steps": [
     {
      "id": "step-1",
      "tool": "moodle.assignment.public",
      "version": "1",
      "conditionId": "condition-1",
      "input": {
       "clauseId": "clause-1",
       "target": "python-assignment"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     },
     {
      "id": "step-2",
      "tool": "hackerrank.certificate.public",
      "version": "1",
      "conditionId": "condition-2",
      "input": {
       "clauseId": "clause-2",
       "target": "python-basic"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "63bba4c2b1ba6d2b1e3ce4069af8ef40dfebfbfcff00168101aa6b9c18026d3b"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "e408d7cdb04c15f2b126985a2f8c10ad0a37c5047a1d4d3246585de477dbdf73",
    "planHash": "63bba4c2b1ba6d2b1e3ce4069af8ef40dfebfbfcff00168101aa6b9c18026d3b"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "e408d7cdb04c15f2b126985a2f8c10ad0a37c5047a1d4d3246585de477dbdf73",
    "planHash": "63bba4c2b1ba6d2b1e3ce4069af8ef40dfebfbfcff00168101aa6b9c18026d3b",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "moodle.assignment.public",
     "hackerrank.certificate.public"
    ],
    "observations": [
     {
      "stepId": "step-1",
      "conditionId": "condition-1",
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
      "stepId": "step-2",
      "conditionId": "condition-2",
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
 },
 "Moodle 활동 완료; Moodle 과제 제출; HackerRank Python (Basic) 인증서 보유": {
  "capabilities": [
   "MOODLE_ACTIVITY_COMPLETION.1",
   "MOODLE_ASSIGNMENT_SUBMISSION.1",
   "HACKERRANK_CERTIFICATE_HOLDING.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "Moodle 활동 완료; Moodle 과제 제출; HackerRank Python (Basic) 인증서 보유",
    "sourceHash": "399bf2d67bd70cbc8bb443f10f6a0541d44a6ceddb7f9acfa391e6e19e7aec06",
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
      "end": 60,
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
      "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
      "target": "python-basic"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "5e2b0583255576185cbf0a9ff393bc7b0dec7717c1a288721aac2303da4724a4"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "399bf2d67bd70cbc8bb443f10f6a0541d44a6ceddb7f9acfa391e6e19e7aec06",
    "draftHash": "5e2b0583255576185cbf0a9ff393bc7b0dec7717c1a288721aac2303da4724a4",
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
      "tool": "hackerrank.certificate.public",
      "version": "1",
      "conditionId": "condition-3",
      "input": {
       "clauseId": "clause-3",
       "target": "python-basic"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "b74b4dfa38475e53f72613c5594cf37f71c26be9c3915b4b1600ffd3060ec691"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "399bf2d67bd70cbc8bb443f10f6a0541d44a6ceddb7f9acfa391e6e19e7aec06",
    "planHash": "b74b4dfa38475e53f72613c5594cf37f71c26be9c3915b4b1600ffd3060ec691"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "399bf2d67bd70cbc8bb443f10f6a0541d44a6ceddb7f9acfa391e6e19e7aec06",
    "planHash": "b74b4dfa38475e53f72613c5594cf37f71c26be9c3915b4b1600ffd3060ec691",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "moodle.activity.public",
     "moodle.assignment.public",
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
 },
 "회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유": {
  "capabilities": [
   "REFLECTION_REQUIRED_TOPICS.1",
   "HACKERRANK_CERTIFICATE_HOLDING.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유",
    "sourceHash": "1f452330a2b02d81c383b376ea2c886fefa5c91e24e4b9201e960a2aebd89b14",
    "clauses": [
     {
      "id": "clause-1",
      "start": 0,
      "end": 27,
      "text": "회고에 수행 내용, 문제해결 과정, 배운 점 포함"
     },
     {
      "id": "clause-2",
      "start": 29,
      "end": 61,
      "text": "HackerRank Python (Basic) 인증서 보유"
     }
    ],
    "conditions": [
     {
      "id": "condition-1",
      "clauseId": "clause-1",
      "capability": "REFLECTION_REQUIRED_TOPICS.1",
      "target": "python-reflection"
     },
     {
      "id": "condition-2",
      "clauseId": "clause-2",
      "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
      "target": "python-basic"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "16f6b74b6928c48fe2c816a68ad4c198468ff193a7d9b4e55ad3b297696a7a01"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "1f452330a2b02d81c383b376ea2c886fefa5c91e24e4b9201e960a2aebd89b14",
    "draftHash": "16f6b74b6928c48fe2c816a68ad4c198468ff193a7d9b4e55ad3b297696a7a01",
    "steps": [
     {
      "id": "step-1",
      "tool": "reflection.topics.public",
      "version": "1",
      "conditionId": "condition-1",
      "input": {
       "clauseId": "clause-1",
       "target": "python-reflection"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     },
     {
      "id": "step-2",
      "tool": "hackerrank.certificate.public",
      "version": "1",
      "conditionId": "condition-2",
      "input": {
       "clauseId": "clause-2",
       "target": "python-basic"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "41e7fd3f0b6e20cbc675774ac23395335aa354dafeef699f1c7f427300b17b98"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "1f452330a2b02d81c383b376ea2c886fefa5c91e24e4b9201e960a2aebd89b14",
    "planHash": "41e7fd3f0b6e20cbc675774ac23395335aa354dafeef699f1c7f427300b17b98"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "1f452330a2b02d81c383b376ea2c886fefa5c91e24e4b9201e960a2aebd89b14",
    "planHash": "41e7fd3f0b6e20cbc675774ac23395335aa354dafeef699f1c7f427300b17b98",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "reflection.topics.public",
     "hackerrank.certificate.public"
    ],
    "observations": [
     {
      "stepId": "step-1",
      "conditionId": "condition-1",
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
      "stepId": "step-2",
      "conditionId": "condition-2",
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
 },
 "Moodle 활동 완료; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유": {
  "capabilities": [
   "MOODLE_ACTIVITY_COMPLETION.1",
   "REFLECTION_REQUIRED_TOPICS.1",
   "HACKERRANK_CERTIFICATE_HOLDING.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "Moodle 활동 완료; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유",
    "sourceHash": "3f7e61d590bf5838074f333bcce7e8cf4158890bf055297ca2074092036cdef3",
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
      "end": 41,
      "text": "회고에 수행 내용, 문제해결 과정, 배운 점 포함"
     },
     {
      "id": "clause-3",
      "start": 43,
      "end": 75,
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
      "capability": "REFLECTION_REQUIRED_TOPICS.1",
      "target": "python-reflection"
     },
     {
      "id": "condition-3",
      "clauseId": "clause-3",
      "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
      "target": "python-basic"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "71a597b982bd7f0f73b377a9ad632cc2e65f1a15727a210e205ee42bff7029f8"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "3f7e61d590bf5838074f333bcce7e8cf4158890bf055297ca2074092036cdef3",
    "draftHash": "71a597b982bd7f0f73b377a9ad632cc2e65f1a15727a210e205ee42bff7029f8",
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
      "tool": "reflection.topics.public",
      "version": "1",
      "conditionId": "condition-2",
      "input": {
       "clauseId": "clause-2",
       "target": "python-reflection"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     },
     {
      "id": "step-3",
      "tool": "hackerrank.certificate.public",
      "version": "1",
      "conditionId": "condition-3",
      "input": {
       "clauseId": "clause-3",
       "target": "python-basic"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "2862a9e18f2d3b2a03499164fc3db889a743366f7f8d4edd28bef647078b6f4f"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "3f7e61d590bf5838074f333bcce7e8cf4158890bf055297ca2074092036cdef3",
    "planHash": "2862a9e18f2d3b2a03499164fc3db889a743366f7f8d4edd28bef647078b6f4f"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "3f7e61d590bf5838074f333bcce7e8cf4158890bf055297ca2074092036cdef3",
    "planHash": "2862a9e18f2d3b2a03499164fc3db889a743366f7f8d4edd28bef647078b6f4f",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "moodle.activity.public",
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
      "stepId": "step-3",
      "conditionId": "condition-3",
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
 },
 "Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유": {
  "capabilities": [
   "MOODLE_ASSIGNMENT_SUBMISSION.1",
   "REFLECTION_REQUIRED_TOPICS.1",
   "HACKERRANK_CERTIFICATE_HOLDING.1"
  ],
  "payload": {
   "draft": {
    "version": "clear-preview-draft.1",
    "executionMode": "SYNTHETIC_RULES",
    "actualModelCall": false,
    "sourceText": "Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유",
    "sourceHash": "f091a15b0215b2a27fdca6c45ff88b634d21bee5df6009ec129ad26dd9a2ca39",
    "clauses": [
     {
      "id": "clause-1",
      "start": 0,
      "end": 12,
      "text": "Moodle 과제 제출"
     },
     {
      "id": "clause-2",
      "start": 14,
      "end": 41,
      "text": "회고에 수행 내용, 문제해결 과정, 배운 점 포함"
     },
     {
      "id": "clause-3",
      "start": 43,
      "end": 75,
      "text": "HackerRank Python (Basic) 인증서 보유"
     }
    ],
    "conditions": [
     {
      "id": "condition-1",
      "clauseId": "clause-1",
      "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
      "target": "python-assignment"
     },
     {
      "id": "condition-2",
      "clauseId": "clause-2",
      "capability": "REFLECTION_REQUIRED_TOPICS.1",
      "target": "python-reflection"
     },
     {
      "id": "condition-3",
      "clauseId": "clause-3",
      "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
      "target": "python-basic"
     }
    ],
    "questions": [],
    "status": "READY",
    "draftHash": "c169a60542f785201b1cf8ac130725fc0c4258b1d64e216122a77a4df63da8da"
   },
   "plan": {
    "version": "clear-preview-plan.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "sourceHash": "f091a15b0215b2a27fdca6c45ff88b634d21bee5df6009ec129ad26dd9a2ca39",
    "draftHash": "c169a60542f785201b1cf8ac130725fc0c4258b1d64e216122a77a4df63da8da",
    "steps": [
     {
      "id": "step-1",
      "tool": "moodle.assignment.public",
      "version": "1",
      "conditionId": "condition-1",
      "input": {
       "clauseId": "clause-1",
       "target": "python-assignment"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     },
     {
      "id": "step-2",
      "tool": "reflection.topics.public",
      "version": "1",
      "conditionId": "condition-2",
      "input": {
       "clauseId": "clause-2",
       "target": "python-reflection"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     },
     {
      "id": "step-3",
      "tool": "hackerrank.certificate.public",
      "version": "1",
      "conditionId": "condition-3",
      "input": {
       "clauseId": "clause-3",
       "target": "python-basic"
      },
      "dependsOn": [],
      "output": "public-observation.1",
      "onFailure": "STOP"
     }
    ],
    "planHash": "a33b0c2a6b85349a4a0138c707fffa58925019a3a7e73de7e146d07ac10f85f7"
   },
   "check": {
    "ok": true,
    "errors": [],
    "sourceHash": "f091a15b0215b2a27fdca6c45ff88b634d21bee5df6009ec129ad26dd9a2ca39",
    "planHash": "a33b0c2a6b85349a4a0138c707fffa58925019a3a7e73de7e146d07ac10f85f7"
   },
   "result": {
    "version": "clear-preview-result.1",
    "executionMode": "PUBLIC_SYNTHETIC",
    "actualModelCall": false,
    "sourceHash": "f091a15b0215b2a27fdca6c45ff88b634d21bee5df6009ec129ad26dd9a2ca39",
    "planHash": "a33b0c2a6b85349a4a0138c707fffa58925019a3a7e73de7e146d07ac10f85f7",
    "hashStatus": "VERIFIED",
    "scope": "PRECONFIGURATION_ONLY",
    "automaticEligibility": false,
    "paymentAllowed": false,
    "calls": [
     "moodle.assignment.public",
     "reflection.topics.public",
     "hackerrank.certificate.public"
    ],
    "observations": [
     {
      "stepId": "step-1",
      "conditionId": "condition-1",
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
      "stepId": "step-2",
      "conditionId": "condition-2",
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
      "stepId": "step-3",
      "conditionId": "condition-3",
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
 },
 "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유": {
  "capabilities": [
   "MOODLE_ACTIVITY_COMPLETION.1",
   "MOODLE_ASSIGNMENT_SUBMISSION.1",
   "REFLECTION_REQUIRED_TOPICS.1",
   "HACKERRANK_CERTIFICATE_HOLDING.1"
  ],
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
});

/**
 * 메타코드 환급 기준 — **실제 공개 안내문**이다. 합성이 아니다.
 *
 * 우리 4조건 중 셋(수강 완료 · 과제 제출 · 후기 작성)이 여기 있고,
 * HackerRank 는 없다 — 그건 P0 에 공증 시연용으로 우리가 넣은 것이다.
 * 나머지 줄(정답률 · 출석률 · 참석률 · 만족도 · 인터뷰 · 금액)은 조건이
 * 아니거나 우리가 확인하지 않는 것이라, 읽기 제안이 그렇게 표시해야 한다.
 */
export const REAL_NOTICE = `[환급 기준]
- 주관식 과제 정답률 90% 이상 (점수 미달 시, 1회 면제)
- 주차별 학습 기간동안 전체 출석률 95%이상
- 주차별 수업 해당 주차 내 100% 수강 완료
- 주차별 과제 해당 주차 내 100% 제출
- 현직자 Live 스터디 참석률 100%
- 수료 후 만족도 조사 제출
- 수료 후 메타코드 후기 게시판 & 개인 블로그에 부트캠프 환급 후기 작성
- (선택)수료 후기 인터뷰 촬영 가능자 (익명 가능)
- 환급 대상 금액은 실결제금액에서 PG사 수수료 공제 후, 제세공과금 22% 공제한 금액이 환불되며 잔여캐시 및 포인트는 소멸됩니다.`;
