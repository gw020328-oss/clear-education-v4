// 생성 파일 — tools/agent-preview/record-operator-replay.mjs. 손으로 고치지 않는다.
// 별도 환경(기존 인증 + B 중계 + D, 오프라인 모델 전송)의 실제 HTTP 응답 녹화. 표시용 대역이며
// 중계·인증·모델 호출이 아니다.
export const OPERATOR_RELAY_REPLAY = {
 "version": "clear-operator-relay-replay.1",
 "recordedAt": 1793881366348,
 "dSide": "D_REAL",
 "modelTransport": "OFFLINE",
 "note": "Recorded HTTP replies of the separate-environment stack. Display material only; not a relay, no authentication, no model call.",
 "entries": {
  "Moodle 활동 완료; Moodle 과제 제출": {
   "prepare": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PREPARED",
     "contextRef": "c27ee9d0-038a-46e9-b324-a6923f188494",
     "revision": 1,
     "expiresAt": 1793881424998,
     "bodyHash": "76114c68931ad032d4befa9360be59d7ff684188f4bb1aef46883fc001e6f720",
     "sourceHash": "806d7fc8f2e06104b373ea4d77924328bc6a901085996df5faf97f461344b8a0",
     "model": "gemini-3.5-flash-lite",
     "limits": {
      "countTokens": 1,
      "generateContent": 1,
      "automaticRetries": 0,
      "maxInputTokens": 4096,
      "maxOutputTokens": 2048,
      "maximumGenerationCostUsd": "0.0063488",
      "priceCheckedOn": "2026-11-04",
      "priceSource": "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite"
     },
     "approvalState": "RECORDED"
    }
   },
   "generate": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PROPOSED",
     "contextRef": "c27ee9d0-038a-46e9-b324-a6923f188494",
     "revision": 1,
     "expiresAt": 1793881424998,
     "generated": {
      "scope": "PRECONFIGURATION_ONLY",
      "automaticEligibility": false,
      "paymentAllowed": false,
      "actualReclaimCall": false,
      "actualPayout": false,
      "dataMode": "DEMO_ACCOUNTS_ONLY",
      "version": "clear-external-preview-draft.1",
      "draftId": "fe31810c-1c7e-4763-b9cd-63d3a6cfdde7",
      "expiresAt": 1793882265011,
      "draft": {
       "version": "clear-preview-model-draft.2",
       "executionMode": "MODEL_PROPOSAL",
       "sourceText": "Moodle 활동 완료; Moodle 과제 제출",
       "sourceHash": "806d7fc8f2e06104b373ea4d77924328bc6a901085996df5faf97f461344b8a0",
       "proposalHash": "00504390c372bb916b3d81a56c8cab85878fd02509023362940f141715fc1d9e",
       "modelRows": [
        {
         "quote": "Moodle 활동 완료",
         "start": 0,
         "end": 12,
         "status": "SUPPORTED",
         "capability": "MOODLE_ACTIVITY_COMPLETION.1",
         "question": null
        },
        {
         "quote": "Moodle 과제 제출",
         "start": 14,
         "end": 26,
         "status": "SUPPORTED",
         "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
         "question": null
        }
       ],
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
       "guards": [],
       "status": "OPERATOR_REVIEW_REQUIRED",
       "draftHash": "0a9964c9318bc734bb121dcc01b6d15621744cde4052968d1cf128552864489b"
      },
      "proposal": {
       "scope": "PRECONFIGURATION_ONLY",
       "automaticEligibility": false,
       "paymentAllowed": false,
       "version": "clear-condition-proposal.1",
       "executionMode": "MODEL_PROPOSAL",
       "sourceHash": "806d7fc8f2e06104b373ea4d77924328bc6a901085996df5faf97f461344b8a0",
       "proposalHash": "00504390c372bb916b3d81a56c8cab85878fd02509023362940f141715fc1d9e",
       "draftHash": "0a9964c9318bc734bb121dcc01b6d15621744cde4052968d1cf128552864489b",
       "status": "OPERATOR_REVIEW_REQUIRED",
       "toolSelection": "MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL",
       "clauses": [
        {
         "clauseId": "clause-1",
         "quote": "Moodle 활동 완료",
         "start": 0,
         "end": 12,
         "status": "SUPPORTED",
         "capability": "MOODLE_ACTIVITY_COMPLETION.1",
         "tool": "moodle.activity.public",
         "question": null,
         "serverGuard": null
        },
        {
         "clauseId": "clause-2",
         "quote": "Moodle 과제 제출",
         "start": 14,
         "end": 26,
         "status": "SUPPORTED",
         "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
         "tool": "moodle.assignment.public",
         "question": null,
         "serverGuard": null
        }
       ],
       "operatorCanApprove": true,
       "heldClauses": 0
      },
      "modelCall": {
       "attempted": true,
       "replied": true,
       "execution": "OFFLINE_TEST_TRANSPORT",
       "model": "gemini-3.5-flash-lite",
       "bodyHash": "76114c68931ad032d4befa9360be59d7ff684188f4bb1aef46883fc001e6f720",
       "succeeded": true,
       "errorCode": null,
       "methods": {
        "countTokens": {
         "invoked": true,
         "replied": true
        },
        "generateContent": {
         "invoked": true,
         "replied": true
        }
       }
      },
      "model": "gemini-3.5-flash-lite",
      "bodyHash": "76114c68931ad032d4befa9360be59d7ff684188f4bb1aef46883fc001e6f720",
      "actualModelCall": false,
      "modelProvenance": "OFFLINE_TEST_TRANSPORT"
     }
    }
   }
  },
  "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함": {
   "prepare": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PREPARED",
     "contextRef": "68dfa54d-5ff2-4a0f-a884-e650dd47a4ef",
     "revision": 2,
     "expiresAt": 1793881425015,
     "bodyHash": "2b41ae126eabb91b4677a7eec616d3668bc8fc3a45f054f6fcbb995bc7e2dfcb",
     "sourceHash": "331199d09d1c5dbe27aa96fd5a5c2d3911f8f5ab4edda48cd4400a0fb9474d2e",
     "model": "gemini-3.5-flash-lite",
     "limits": {
      "countTokens": 1,
      "generateContent": 1,
      "automaticRetries": 0,
      "maxInputTokens": 4096,
      "maxOutputTokens": 2048,
      "maximumGenerationCostUsd": "0.0063488",
      "priceCheckedOn": "2026-11-04",
      "priceSource": "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite"
     },
     "approvalState": "RECORDED"
    }
   },
   "generate": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PROPOSED",
     "contextRef": "68dfa54d-5ff2-4a0f-a884-e650dd47a4ef",
     "revision": 2,
     "expiresAt": 1793881425015,
     "generated": {
      "scope": "PRECONFIGURATION_ONLY",
      "automaticEligibility": false,
      "paymentAllowed": false,
      "actualReclaimCall": false,
      "actualPayout": false,
      "dataMode": "DEMO_ACCOUNTS_ONLY",
      "version": "clear-external-preview-draft.1",
      "draftId": "68914c55-7abf-409f-972b-508e39afd537",
      "expiresAt": 1793882265022,
      "draft": {
       "version": "clear-preview-model-draft.2",
       "executionMode": "MODEL_PROPOSAL",
       "sourceText": "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함",
       "sourceHash": "331199d09d1c5dbe27aa96fd5a5c2d3911f8f5ab4edda48cd4400a0fb9474d2e",
       "proposalHash": "e7849b8ffd4c282387c9be01ee2f1730cf6f25efee1de6e4c877ca21e8cdc129",
       "modelRows": [
        {
         "quote": "Moodle 활동 완료",
         "start": 0,
         "end": 12,
         "status": "SUPPORTED",
         "capability": "MOODLE_ACTIVITY_COMPLETION.1",
         "question": null
        },
        {
         "quote": "Moodle 과제 제출",
         "start": 14,
         "end": 26,
         "status": "SUPPORTED",
         "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
         "question": null
        },
        {
         "quote": "회고에 수행 내용, 문제해결 과정, 배운 점 포함",
         "start": 28,
         "end": 55,
         "status": "SUPPORTED",
         "capability": "REFLECTION_REQUIRED_TOPICS.1",
         "question": null
        }
       ],
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
       "guards": [],
       "status": "OPERATOR_REVIEW_REQUIRED",
       "draftHash": "c0901fb50af8d0aa397c178c6d77aa56760f8554bdb3b29abf16033903e9d47c"
      },
      "proposal": {
       "scope": "PRECONFIGURATION_ONLY",
       "automaticEligibility": false,
       "paymentAllowed": false,
       "version": "clear-condition-proposal.1",
       "executionMode": "MODEL_PROPOSAL",
       "sourceHash": "331199d09d1c5dbe27aa96fd5a5c2d3911f8f5ab4edda48cd4400a0fb9474d2e",
       "proposalHash": "e7849b8ffd4c282387c9be01ee2f1730cf6f25efee1de6e4c877ca21e8cdc129",
       "draftHash": "c0901fb50af8d0aa397c178c6d77aa56760f8554bdb3b29abf16033903e9d47c",
       "status": "OPERATOR_REVIEW_REQUIRED",
       "toolSelection": "MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL",
       "clauses": [
        {
         "clauseId": "clause-1",
         "quote": "Moodle 활동 완료",
         "start": 0,
         "end": 12,
         "status": "SUPPORTED",
         "capability": "MOODLE_ACTIVITY_COMPLETION.1",
         "tool": "moodle.activity.public",
         "question": null,
         "serverGuard": null
        },
        {
         "clauseId": "clause-2",
         "quote": "Moodle 과제 제출",
         "start": 14,
         "end": 26,
         "status": "SUPPORTED",
         "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
         "tool": "moodle.assignment.public",
         "question": null,
         "serverGuard": null
        },
        {
         "clauseId": "clause-3",
         "quote": "회고에 수행 내용, 문제해결 과정, 배운 점 포함",
         "start": 28,
         "end": 55,
         "status": "SUPPORTED",
         "capability": "REFLECTION_REQUIRED_TOPICS.1",
         "tool": "reflection.topics.public",
         "question": null,
         "serverGuard": null
        }
       ],
       "operatorCanApprove": true,
       "heldClauses": 0
      },
      "modelCall": {
       "attempted": true,
       "replied": true,
       "execution": "OFFLINE_TEST_TRANSPORT",
       "model": "gemini-3.5-flash-lite",
       "bodyHash": "2b41ae126eabb91b4677a7eec616d3668bc8fc3a45f054f6fcbb995bc7e2dfcb",
       "succeeded": true,
       "errorCode": null,
       "methods": {
        "countTokens": {
         "invoked": true,
         "replied": true
        },
        "generateContent": {
         "invoked": true,
         "replied": true
        }
       }
      },
      "model": "gemini-3.5-flash-lite",
      "bodyHash": "2b41ae126eabb91b4677a7eec616d3668bc8fc3a45f054f6fcbb995bc7e2dfcb",
      "actualModelCall": false,
      "modelProvenance": "OFFLINE_TEST_TRANSPORT"
     }
    }
   }
  },
  "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유": {
   "prepare": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PREPARED",
     "contextRef": "0fef3aaa-1b05-42f2-b4a0-3f3e43207432",
     "revision": 3,
     "expiresAt": 1793881425025,
     "bodyHash": "07b0345f5b0bd93ca5621789a027a54abca67615c0c8c027a4503e1651d330bc",
     "sourceHash": "4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff",
     "model": "gemini-3.5-flash-lite",
     "limits": {
      "countTokens": 1,
      "generateContent": 1,
      "automaticRetries": 0,
      "maxInputTokens": 4096,
      "maxOutputTokens": 2048,
      "maximumGenerationCostUsd": "0.0063488",
      "priceCheckedOn": "2026-11-04",
      "priceSource": "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite"
     },
     "approvalState": "RECORDED"
    }
   },
   "generate": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PROPOSED",
     "contextRef": "0fef3aaa-1b05-42f2-b4a0-3f3e43207432",
     "revision": 3,
     "expiresAt": 1793881425025,
     "generated": {
      "scope": "PRECONFIGURATION_ONLY",
      "automaticEligibility": false,
      "paymentAllowed": false,
      "actualReclaimCall": false,
      "actualPayout": false,
      "dataMode": "DEMO_ACCOUNTS_ONLY",
      "version": "clear-external-preview-draft.1",
      "draftId": "75f04088-a77c-4149-87df-29f268af0273",
      "expiresAt": 1793882265032,
      "draft": {
       "version": "clear-preview-model-draft.2",
       "executionMode": "MODEL_PROPOSAL",
       "sourceText": "Moodle 활동 완료; Moodle 과제 제출; 회고에 수행 내용, 문제해결 과정, 배운 점 포함; HackerRank Python (Basic) 인증서 보유",
       "sourceHash": "4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff",
       "proposalHash": "2ca461bda138f3ee999a2eba3ad43146b47a20eaf2d5742d7c50b7ab97795417",
       "modelRows": [
        {
         "quote": "Moodle 활동 완료",
         "start": 0,
         "end": 12,
         "status": "SUPPORTED",
         "capability": "MOODLE_ACTIVITY_COMPLETION.1",
         "question": null
        },
        {
         "quote": "Moodle 과제 제출",
         "start": 14,
         "end": 26,
         "status": "SUPPORTED",
         "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
         "question": null
        },
        {
         "quote": "회고에 수행 내용, 문제해결 과정, 배운 점 포함",
         "start": 28,
         "end": 55,
         "status": "SUPPORTED",
         "capability": "REFLECTION_REQUIRED_TOPICS.1",
         "question": null
        },
        {
         "quote": "HackerRank Python (Basic) 인증서 보유",
         "start": 57,
         "end": 89,
         "status": "SUPPORTED",
         "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
         "question": null
        }
       ],
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
       "guards": [],
       "status": "OPERATOR_REVIEW_REQUIRED",
       "draftHash": "66e8dbd5467cf3e2b848c1ab4d325726c764d7487ff08c11c0e782ba43db4e03"
      },
      "proposal": {
       "scope": "PRECONFIGURATION_ONLY",
       "automaticEligibility": false,
       "paymentAllowed": false,
       "version": "clear-condition-proposal.1",
       "executionMode": "MODEL_PROPOSAL",
       "sourceHash": "4f537baf588613480d396c0945591a3d3c8ecf6b5998cf0218b392bea1f126ff",
       "proposalHash": "2ca461bda138f3ee999a2eba3ad43146b47a20eaf2d5742d7c50b7ab97795417",
       "draftHash": "66e8dbd5467cf3e2b848c1ab4d325726c764d7487ff08c11c0e782ba43db4e03",
       "status": "OPERATOR_REVIEW_REQUIRED",
       "toolSelection": "MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL",
       "clauses": [
        {
         "clauseId": "clause-1",
         "quote": "Moodle 활동 완료",
         "start": 0,
         "end": 12,
         "status": "SUPPORTED",
         "capability": "MOODLE_ACTIVITY_COMPLETION.1",
         "tool": "moodle.activity.public",
         "question": null,
         "serverGuard": null
        },
        {
         "clauseId": "clause-2",
         "quote": "Moodle 과제 제출",
         "start": 14,
         "end": 26,
         "status": "SUPPORTED",
         "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
         "tool": "moodle.assignment.public",
         "question": null,
         "serverGuard": null
        },
        {
         "clauseId": "clause-3",
         "quote": "회고에 수행 내용, 문제해결 과정, 배운 점 포함",
         "start": 28,
         "end": 55,
         "status": "SUPPORTED",
         "capability": "REFLECTION_REQUIRED_TOPICS.1",
         "tool": "reflection.topics.public",
         "question": null,
         "serverGuard": null
        },
        {
         "clauseId": "clause-4",
         "quote": "HackerRank Python (Basic) 인증서 보유",
         "start": 57,
         "end": 89,
         "status": "SUPPORTED",
         "capability": "HACKERRANK_CERTIFICATE_HOLDING.1",
         "tool": "hackerrank.certificate.public",
         "question": null,
         "serverGuard": null
        }
       ],
       "operatorCanApprove": true,
       "heldClauses": 0
      },
      "modelCall": {
       "attempted": true,
       "replied": true,
       "execution": "OFFLINE_TEST_TRANSPORT",
       "model": "gemini-3.5-flash-lite",
       "bodyHash": "07b0345f5b0bd93ca5621789a027a54abca67615c0c8c027a4503e1651d330bc",
       "succeeded": true,
       "errorCode": null,
       "methods": {
        "countTokens": {
         "invoked": true,
         "replied": true
        },
        "generateContent": {
         "invoked": true,
         "replied": true
        }
       }
      },
      "model": "gemini-3.5-flash-lite",
      "bodyHash": "07b0345f5b0bd93ca5621789a027a54abca67615c0c8c027a4503e1651d330bc",
      "actualModelCall": false,
      "modelProvenance": "OFFLINE_TEST_TRANSPORT"
     }
    }
   }
  },
  "강의 수강 또는 과제 제출": {
   "prepare": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PREPARED",
     "contextRef": "8255bdc0-3533-42e2-b07e-c837af105459",
     "revision": 4,
     "expiresAt": 1793881425035,
     "bodyHash": "919475064ae63c4ff667f0c54f52454f0b1115f2bfbc8440be05118f4c0bf147",
     "sourceHash": "b583afd199010bdc8182557900042a9f5fcb493d703b5bd3412ce635428f6d1d",
     "model": "gemini-3.5-flash-lite",
     "limits": {
      "countTokens": 1,
      "generateContent": 1,
      "automaticRetries": 0,
      "maxInputTokens": 4096,
      "maxOutputTokens": 2048,
      "maximumGenerationCostUsd": "0.0063488",
      "priceCheckedOn": "2026-11-04",
      "priceSource": "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite"
     },
     "approvalState": "RECORDED"
    }
   },
   "generate": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PROPOSED",
     "contextRef": "8255bdc0-3533-42e2-b07e-c837af105459",
     "revision": 4,
     "expiresAt": 1793881425035,
     "generated": {
      "scope": "PRECONFIGURATION_ONLY",
      "automaticEligibility": false,
      "paymentAllowed": false,
      "actualReclaimCall": false,
      "actualPayout": false,
      "dataMode": "DEMO_ACCOUNTS_ONLY",
      "version": "clear-external-preview-draft.1",
      "draftId": "98bf5f66-d50e-487c-b888-abfeeb2ec369",
      "expiresAt": 1793882265042,
      "draft": {
       "version": "clear-preview-model-draft.2",
       "executionMode": "MODEL_PROPOSAL",
       "sourceText": "강의 수강 또는 과제 제출",
       "sourceHash": "b583afd199010bdc8182557900042a9f5fcb493d703b5bd3412ce635428f6d1d",
       "proposalHash": "dbee9ba5ef68de189d924dc1f6ec4939ddf10d368a6a424f369d54e31a7c18e5",
       "modelRows": [
        {
         "quote": "강의 수강 또는 과제 제출",
         "start": 0,
         "end": 14,
         "status": "SUPPORTED",
         "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
         "question": null
        }
       ],
       "clauses": [
        {
         "id": "clause-1",
         "start": 0,
         "end": 14,
         "text": "강의 수강 또는 과제 제출"
        }
       ],
       "conditions": [],
       "questions": [
        {
         "clauseId": "clause-1",
         "reason": "NEEDS_CLARIFICATION",
         "question": "조건 중 하나만 채우면 되는 문장(또는)으로 보입니다. 한 조항에 필수 조건 하나만 표현할 수 있어 확정하지 않았습니다. 요구할 조건을 정해 원문을 고쳐 주세요."
        }
       ],
       "guards": [
        {
         "clauseId": "clause-1",
         "kinds": [
          "ALTERNATIVE",
          "MULTIPLE_CONDITIONS"
         ],
         "modelStatus": "SUPPORTED",
         "modelCapability": "MOODLE_ASSIGNMENT_SUBMISSION.1"
        }
       ],
       "status": "NEEDS_CLARIFICATION",
       "draftHash": "a9c7f412d3a6c298e06561ff3ea4ae11d2e0c0af814aaa58b52f43818611e457"
      },
      "proposal": {
       "scope": "PRECONFIGURATION_ONLY",
       "automaticEligibility": false,
       "paymentAllowed": false,
       "version": "clear-condition-proposal.1",
       "executionMode": "MODEL_PROPOSAL",
       "sourceHash": "b583afd199010bdc8182557900042a9f5fcb493d703b5bd3412ce635428f6d1d",
       "proposalHash": "dbee9ba5ef68de189d924dc1f6ec4939ddf10d368a6a424f369d54e31a7c18e5",
       "draftHash": "a9c7f412d3a6c298e06561ff3ea4ae11d2e0c0af814aaa58b52f43818611e457",
       "status": "NEEDS_CLARIFICATION",
       "toolSelection": "MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL",
       "clauses": [
        {
         "clauseId": "clause-1",
         "quote": "강의 수강 또는 과제 제출",
         "start": 0,
         "end": 14,
         "status": "NEEDS_CLARIFICATION",
         "capability": null,
         "tool": null,
         "question": "조건 중 하나만 채우면 되는 문장(또는)으로 보입니다. 한 조항에 필수 조건 하나만 표현할 수 있어 확정하지 않았습니다. 요구할 조건을 정해 원문을 고쳐 주세요.",
         "serverGuard": {
          "kinds": [
           "ALTERNATIVE",
           "MULTIPLE_CONDITIONS"
          ],
          "modelStatus": "SUPPORTED",
          "modelCapability": "MOODLE_ASSIGNMENT_SUBMISSION.1"
         }
        }
       ],
       "operatorCanApprove": false,
       "heldClauses": 1
      },
      "modelCall": {
       "attempted": true,
       "replied": true,
       "execution": "OFFLINE_TEST_TRANSPORT",
       "model": "gemini-3.5-flash-lite",
       "bodyHash": "919475064ae63c4ff667f0c54f52454f0b1115f2bfbc8440be05118f4c0bf147",
       "succeeded": true,
       "errorCode": null,
       "methods": {
        "countTokens": {
         "invoked": true,
         "replied": true
        },
        "generateContent": {
         "invoked": true,
         "replied": true
        }
       }
      },
      "model": "gemini-3.5-flash-lite",
      "bodyHash": "919475064ae63c4ff667f0c54f52454f0b1115f2bfbc8440be05118f4c0bf147",
      "actualModelCall": false,
      "modelProvenance": "OFFLINE_TEST_TRANSPORT"
     }
    }
   }
  },
  "강의수강 후기적기 과제제출": {
   "prepare": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PREPARED",
     "contextRef": "a5943f2a-c562-4872-a476-43b497bdf84f",
     "revision": 5,
     "expiresAt": 1793881425046,
     "bodyHash": "9038921ec4ea57ee4527b2a3adb2ad5b27bba33bbe6619a29e05dd8ba4d5306b",
     "sourceHash": "e7e37128c16984459aca6d3df310db99eddaf83206012b173451cd9f0263b62c",
     "model": "gemini-3.5-flash-lite",
     "limits": {
      "countTokens": 1,
      "generateContent": 1,
      "automaticRetries": 0,
      "maxInputTokens": 4096,
      "maxOutputTokens": 2048,
      "maximumGenerationCostUsd": "0.0063488",
      "priceCheckedOn": "2026-11-04",
      "priceSource": "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite"
     },
     "approvalState": "RECORDED"
    }
   },
   "generate": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PROPOSED",
     "contextRef": "a5943f2a-c562-4872-a476-43b497bdf84f",
     "revision": 5,
     "expiresAt": 1793881425046,
     "generated": {
      "scope": "PRECONFIGURATION_ONLY",
      "automaticEligibility": false,
      "paymentAllowed": false,
      "actualReclaimCall": false,
      "actualPayout": false,
      "dataMode": "DEMO_ACCOUNTS_ONLY",
      "version": "clear-external-preview-draft.1",
      "draftId": "9d09ee14-7a2f-4f95-b65c-4aa218c174be",
      "expiresAt": 1793882265053,
      "draft": {
       "version": "clear-preview-model-draft.2",
       "executionMode": "MODEL_PROPOSAL",
       "sourceText": "강의수강 후기적기 과제제출",
       "sourceHash": "e7e37128c16984459aca6d3df310db99eddaf83206012b173451cd9f0263b62c",
       "proposalHash": "c0ce89948d52f815f9ca780ff1628225d8b99842aa181a03ff131e6bc41da0a2",
       "modelRows": [
        {
         "quote": "강의수강 후기적기 과제제출",
         "start": 0,
         "end": 14,
         "status": "SUPPORTED",
         "capability": "REFLECTION_REQUIRED_TOPICS.1",
         "question": null
        }
       ],
       "clauses": [
        {
         "id": "clause-1",
         "start": 0,
         "end": 14,
         "text": "강의수강 후기적기 과제제출"
        }
       ],
       "conditions": [],
       "questions": [
        {
         "clauseId": "clause-1",
         "reason": "NEEDS_CLARIFICATION",
         "question": "한 조항에 조건이 여럿 있습니다. 조항마다 조건 하나가 되도록 줄이나 세미콜론으로 나눠 주세요."
        }
       ],
       "guards": [
        {
         "clauseId": "clause-1",
         "kinds": [
          "MULTIPLE_CONDITIONS"
         ],
         "modelStatus": "SUPPORTED",
         "modelCapability": "REFLECTION_REQUIRED_TOPICS.1"
        }
       ],
       "status": "NEEDS_CLARIFICATION",
       "draftHash": "339c14e369738dee4f1dc52947c56940cb123d0c951a402d20190321a63dc933"
      },
      "proposal": {
       "scope": "PRECONFIGURATION_ONLY",
       "automaticEligibility": false,
       "paymentAllowed": false,
       "version": "clear-condition-proposal.1",
       "executionMode": "MODEL_PROPOSAL",
       "sourceHash": "e7e37128c16984459aca6d3df310db99eddaf83206012b173451cd9f0263b62c",
       "proposalHash": "c0ce89948d52f815f9ca780ff1628225d8b99842aa181a03ff131e6bc41da0a2",
       "draftHash": "339c14e369738dee4f1dc52947c56940cb123d0c951a402d20190321a63dc933",
       "status": "NEEDS_CLARIFICATION",
       "toolSelection": "MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL",
       "clauses": [
        {
         "clauseId": "clause-1",
         "quote": "강의수강 후기적기 과제제출",
         "start": 0,
         "end": 14,
         "status": "NEEDS_CLARIFICATION",
         "capability": null,
         "tool": null,
         "question": "한 조항에 조건이 여럿 있습니다. 조항마다 조건 하나가 되도록 줄이나 세미콜론으로 나눠 주세요.",
         "serverGuard": {
          "kinds": [
           "MULTIPLE_CONDITIONS"
          ],
          "modelStatus": "SUPPORTED",
          "modelCapability": "REFLECTION_REQUIRED_TOPICS.1"
         }
        }
       ],
       "operatorCanApprove": false,
       "heldClauses": 1
      },
      "modelCall": {
       "attempted": true,
       "replied": true,
       "execution": "OFFLINE_TEST_TRANSPORT",
       "model": "gemini-3.5-flash-lite",
       "bodyHash": "9038921ec4ea57ee4527b2a3adb2ad5b27bba33bbe6619a29e05dd8ba4d5306b",
       "succeeded": true,
       "errorCode": null,
       "methods": {
        "countTokens": {
         "invoked": true,
         "replied": true
        },
        "generateContent": {
         "invoked": true,
         "replied": true
        }
       }
      },
      "model": "gemini-3.5-flash-lite",
      "bodyHash": "9038921ec4ea57ee4527b2a3adb2ad5b27bba33bbe6619a29e05dd8ba4d5306b",
      "actualModelCall": false,
      "modelProvenance": "OFFLINE_TEST_TRANSPORT"
     }
    }
   }
  },
  "[환급 기준]\n- 주관식 과제 정답률 90% 이상 (점수 미달 시, 1회 면제)\n- 주차별 학습 기간동안 전체 출석률 95%이상\n- 주차별 수업 해당 주차 내 100% 수강 완료\n- 주차별 과제 해당 주차 내 100% 제출\n- 현직자 Live 스터디 참석률 100%\n- 수료 후 만족도 조사 제출\n- 수료 후 메타코드 후기 게시판 & 개인 블로그에 부트캠프 환급 후기 작성\n- (선택)수료 후기 인터뷰 촬영 가능자 (익명 가능)\n- 환급 대상 금액은 실결제금액에서 PG사 수수료 공제 후, 제세공과금 22% 공제한 금액이 환불되며 잔여캐시 및 포인트는 소멸됩니다.": {
   "prepare": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PREPARED",
     "contextRef": "7301c40d-951d-4036-8ea5-e09729182246",
     "revision": 6,
     "expiresAt": 1793881425056,
     "bodyHash": "c3ce70b020331d67802819cca83cd2e4690fc16a055017ab1191162c145c0cf6",
     "sourceHash": "a7c3bf74839688a37fb65636019bc44e5d1b2a45c5a6535ad6a67d58e178ee53",
     "model": "gemini-3.5-flash-lite",
     "limits": {
      "countTokens": 1,
      "generateContent": 1,
      "automaticRetries": 0,
      "maxInputTokens": 4096,
      "maxOutputTokens": 2048,
      "maximumGenerationCostUsd": "0.0063488",
      "priceCheckedOn": "2026-11-04",
      "priceSource": "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite"
     },
     "approvalState": "RECORDED"
    }
   },
   "generate": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PROPOSED",
     "contextRef": "7301c40d-951d-4036-8ea5-e09729182246",
     "revision": 6,
     "expiresAt": 1793881425056,
     "generated": {
      "scope": "PRECONFIGURATION_ONLY",
      "automaticEligibility": false,
      "paymentAllowed": false,
      "actualReclaimCall": false,
      "actualPayout": false,
      "dataMode": "DEMO_ACCOUNTS_ONLY",
      "version": "clear-external-preview-draft.1",
      "draftId": "8bbbb3aa-20f7-46df-8f07-fb6e39c734c4",
      "expiresAt": 1793882265064,
      "draft": {
       "version": "clear-preview-model-draft.2",
       "executionMode": "MODEL_PROPOSAL",
       "sourceText": "[환급 기준]\n- 주관식 과제 정답률 90% 이상 (점수 미달 시, 1회 면제)\n- 주차별 학습 기간동안 전체 출석률 95%이상\n- 주차별 수업 해당 주차 내 100% 수강 완료\n- 주차별 과제 해당 주차 내 100% 제출\n- 현직자 Live 스터디 참석률 100%\n- 수료 후 만족도 조사 제출\n- 수료 후 메타코드 후기 게시판 & 개인 블로그에 부트캠프 환급 후기 작성\n- (선택)수료 후기 인터뷰 촬영 가능자 (익명 가능)\n- 환급 대상 금액은 실결제금액에서 PG사 수수료 공제 후, 제세공과금 22% 공제한 금액이 환불되며 잔여캐시 및 포인트는 소멸됩니다.",
       "sourceHash": "a7c3bf74839688a37fb65636019bc44e5d1b2a45c5a6535ad6a67d58e178ee53",
       "proposalHash": "a85dcad508317cd52b865763e5fd923dc68139cdf31faffc03b9767c1593fc6a",
       "modelRows": [
        {
         "quote": "[환급 기준]",
         "start": 0,
         "end": 7,
         "status": "UNSUPPORTED",
         "capability": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "quote": "- 주관식 과제 정답률 90% 이상 (점수 미달 시, 1회 면제)",
         "start": 8,
         "end": 44,
         "status": "UNSUPPORTED",
         "capability": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "quote": "- 주차별 학습 기간동안 전체 출석률 95%이상",
         "start": 45,
         "end": 71,
         "status": "UNSUPPORTED",
         "capability": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "quote": "- 주차별 수업 해당 주차 내 100% 수강 완료",
         "start": 72,
         "end": 99,
         "status": "SUPPORTED",
         "capability": "MOODLE_ACTIVITY_COMPLETION.1",
         "question": null
        },
        {
         "quote": "- 주차별 과제 해당 주차 내 100% 제출",
         "start": 100,
         "end": 124,
         "status": "SUPPORTED",
         "capability": "MOODLE_ASSIGNMENT_SUBMISSION.1",
         "question": null
        },
        {
         "quote": "- 현직자 Live 스터디 참석률 100%",
         "start": 125,
         "end": 148,
         "status": "UNSUPPORTED",
         "capability": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "quote": "- 수료 후 만족도 조사 제출",
         "start": 149,
         "end": 165,
         "status": "UNSUPPORTED",
         "capability": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "quote": "- 수료 후 메타코드 후기 게시판 & 개인 블로그에 부트캠프 환급 후기 작성",
         "start": 166,
         "end": 208,
         "status": "SUPPORTED",
         "capability": "REFLECTION_REQUIRED_TOPICS.1",
         "question": null
        },
        {
         "quote": "- (선택)수료 후기 인터뷰 촬영 가능자 (익명 가능)",
         "start": 209,
         "end": 239,
         "status": "UNSUPPORTED",
         "capability": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "quote": "- 환급 대상 금액은 실결제금액에서 PG사 수수료 공제 후, 제세공과금 22% 공제한 금액이 환불되며 잔여캐시 및 포인트는 소멸됩니다.",
         "start": 240,
         "end": 315,
         "status": "UNSUPPORTED",
         "capability": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        }
       ],
       "clauses": [
        {
         "id": "clause-1",
         "start": 0,
         "end": 7,
         "text": "[환급 기준]"
        },
        {
         "id": "clause-2",
         "start": 8,
         "end": 44,
         "text": "- 주관식 과제 정답률 90% 이상 (점수 미달 시, 1회 면제)"
        },
        {
         "id": "clause-3",
         "start": 45,
         "end": 71,
         "text": "- 주차별 학습 기간동안 전체 출석률 95%이상"
        },
        {
         "id": "clause-4",
         "start": 72,
         "end": 99,
         "text": "- 주차별 수업 해당 주차 내 100% 수강 완료"
        },
        {
         "id": "clause-5",
         "start": 100,
         "end": 124,
         "text": "- 주차별 과제 해당 주차 내 100% 제출"
        },
        {
         "id": "clause-6",
         "start": 125,
         "end": 148,
         "text": "- 현직자 Live 스터디 참석률 100%"
        },
        {
         "id": "clause-7",
         "start": 149,
         "end": 165,
         "text": "- 수료 후 만족도 조사 제출"
        },
        {
         "id": "clause-8",
         "start": 166,
         "end": 208,
         "text": "- 수료 후 메타코드 후기 게시판 & 개인 블로그에 부트캠프 환급 후기 작성"
        },
        {
         "id": "clause-9",
         "start": 209,
         "end": 239,
         "text": "- (선택)수료 후기 인터뷰 촬영 가능자 (익명 가능)"
        },
        {
         "id": "clause-10",
         "start": 240,
         "end": 315,
         "text": "- 환급 대상 금액은 실결제금액에서 PG사 수수료 공제 후, 제세공과금 22% 공제한 금액이 환불되며 잔여캐시 및 포인트는 소멸됩니다."
        }
       ],
       "conditions": [
        {
         "id": "condition-1",
         "clauseId": "clause-8",
         "capability": "REFLECTION_REQUIRED_TOPICS.1",
         "target": "python-reflection"
        }
       ],
       "questions": [
        {
         "clauseId": "clause-1",
         "reason": "UNSUPPORTED",
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "clauseId": "clause-2",
         "reason": "UNSUPPORTED",
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "clauseId": "clause-3",
         "reason": "UNSUPPORTED",
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "clauseId": "clause-4",
         "reason": "NEEDS_CLARIFICATION",
         "question": "수치·횟수 기준이 있습니다. 지원 조건은 지정 항목의 완료·제출 여부만 봐서 기준을 옮길 수 없습니다. 기준을 확인해 주세요."
        },
        {
         "clauseId": "clause-5",
         "reason": "NEEDS_CLARIFICATION",
         "question": "수치·횟수 기준이 있습니다. 지원 조건은 지정 항목의 완료·제출 여부만 봐서 기준을 옮길 수 없습니다. 기준을 확인해 주세요."
        },
        {
         "clauseId": "clause-6",
         "reason": "UNSUPPORTED",
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "clauseId": "clause-7",
         "reason": "UNSUPPORTED",
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "clauseId": "clause-9",
         "reason": "UNSUPPORTED",
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        },
        {
         "clauseId": "clause-10",
         "reason": "UNSUPPORTED",
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요."
        }
       ],
       "guards": [
        {
         "clauseId": "clause-4",
         "kinds": [
          "THRESHOLD"
         ],
         "modelStatus": "SUPPORTED",
         "modelCapability": "MOODLE_ACTIVITY_COMPLETION.1"
        },
        {
         "clauseId": "clause-5",
         "kinds": [
          "THRESHOLD"
         ],
         "modelStatus": "SUPPORTED",
         "modelCapability": "MOODLE_ASSIGNMENT_SUBMISSION.1"
        }
       ],
       "status": "UNSUPPORTED",
       "draftHash": "d4c1208b2a3b61a41f43bf34ce44104b35b6ac00520d912cc708ff4ada0a95b0"
      },
      "proposal": {
       "scope": "PRECONFIGURATION_ONLY",
       "automaticEligibility": false,
       "paymentAllowed": false,
       "version": "clear-condition-proposal.1",
       "executionMode": "MODEL_PROPOSAL",
       "sourceHash": "a7c3bf74839688a37fb65636019bc44e5d1b2a45c5a6535ad6a67d58e178ee53",
       "proposalHash": "a85dcad508317cd52b865763e5fd923dc68139cdf31faffc03b9767c1593fc6a",
       "draftHash": "d4c1208b2a3b61a41f43bf34ce44104b35b6ac00520d912cc708ff4ada0a95b0",
       "status": "UNSUPPORTED",
       "toolSelection": "MODEL_CLASSIFIES_CAPABILITY_CODE_MAPS_TOOL",
       "clauses": [
        {
         "clauseId": "clause-1",
         "quote": "[환급 기준]",
         "start": 0,
         "end": 7,
         "status": "UNSUPPORTED",
         "capability": null,
         "tool": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요.",
         "serverGuard": null
        },
        {
         "clauseId": "clause-2",
         "quote": "- 주관식 과제 정답률 90% 이상 (점수 미달 시, 1회 면제)",
         "start": 8,
         "end": 44,
         "status": "UNSUPPORTED",
         "capability": null,
         "tool": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요.",
         "serverGuard": null
        },
        {
         "clauseId": "clause-3",
         "quote": "- 주차별 학습 기간동안 전체 출석률 95%이상",
         "start": 45,
         "end": 71,
         "status": "UNSUPPORTED",
         "capability": null,
         "tool": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요.",
         "serverGuard": null
        },
        {
         "clauseId": "clause-4",
         "quote": "- 주차별 수업 해당 주차 내 100% 수강 완료",
         "start": 72,
         "end": 99,
         "status": "NEEDS_CLARIFICATION",
         "capability": null,
         "tool": null,
         "question": "수치·횟수 기준이 있습니다. 지원 조건은 지정 항목의 완료·제출 여부만 봐서 기준을 옮길 수 없습니다. 기준을 확인해 주세요.",
         "serverGuard": {
          "kinds": [
           "THRESHOLD"
          ],
          "modelStatus": "SUPPORTED",
          "modelCapability": "MOODLE_ACTIVITY_COMPLETION.1"
         }
        },
        {
         "clauseId": "clause-5",
         "quote": "- 주차별 과제 해당 주차 내 100% 제출",
         "start": 100,
         "end": 124,
         "status": "NEEDS_CLARIFICATION",
         "capability": null,
         "tool": null,
         "question": "수치·횟수 기준이 있습니다. 지원 조건은 지정 항목의 완료·제출 여부만 봐서 기준을 옮길 수 없습니다. 기준을 확인해 주세요.",
         "serverGuard": {
          "kinds": [
           "THRESHOLD"
          ],
          "modelStatus": "SUPPORTED",
          "modelCapability": "MOODLE_ASSIGNMENT_SUBMISSION.1"
         }
        },
        {
         "clauseId": "clause-6",
         "quote": "- 현직자 Live 스터디 참석률 100%",
         "start": 125,
         "end": 148,
         "status": "UNSUPPORTED",
         "capability": null,
         "tool": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요.",
         "serverGuard": null
        },
        {
         "clauseId": "clause-7",
         "quote": "- 수료 후 만족도 조사 제출",
         "start": 149,
         "end": 165,
         "status": "UNSUPPORTED",
         "capability": null,
         "tool": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요.",
         "serverGuard": null
        },
        {
         "clauseId": "clause-8",
         "quote": "- 수료 후 메타코드 후기 게시판 & 개인 블로그에 부트캠프 환급 후기 작성",
         "start": 166,
         "end": 208,
         "status": "SUPPORTED",
         "capability": "REFLECTION_REQUIRED_TOPICS.1",
         "tool": "reflection.topics.public",
         "question": null,
         "serverGuard": null
        },
        {
         "clauseId": "clause-9",
         "quote": "- (선택)수료 후기 인터뷰 촬영 가능자 (익명 가능)",
         "start": 209,
         "end": 239,
         "status": "UNSUPPORTED",
         "capability": null,
         "tool": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요.",
         "serverGuard": null
        },
        {
         "clauseId": "clause-10",
         "quote": "- 환급 대상 금액은 실결제금액에서 PG사 수수료 공제 후, 제세공과금 22% 공제한 금액이 환불되며 잔여캐시 및 포인트는 소멸됩니다.",
         "start": 240,
         "end": 315,
         "status": "UNSUPPORTED",
         "capability": null,
         "tool": null,
         "question": "지원하는 네 조건 중 어느 것인지 읽지 못했습니다. 운영자가 확인해 주세요.",
         "serverGuard": null
        }
       ],
       "operatorCanApprove": false,
       "heldClauses": 9
      },
      "modelCall": {
       "attempted": true,
       "replied": true,
       "execution": "OFFLINE_TEST_TRANSPORT",
       "model": "gemini-3.5-flash-lite",
       "bodyHash": "c3ce70b020331d67802819cca83cd2e4690fc16a055017ab1191162c145c0cf6",
       "succeeded": true,
       "errorCode": null,
       "methods": {
        "countTokens": {
         "invoked": true,
         "replied": true
        },
        "generateContent": {
         "invoked": true,
         "replied": true
        }
       }
      },
      "model": "gemini-3.5-flash-lite",
      "bodyHash": "c3ce70b020331d67802819cca83cd2e4690fc16a055017ab1191162c145c0cf6",
      "actualModelCall": false,
      "modelProvenance": "OFFLINE_TEST_TRANSPORT"
     }
    }
   }
  },
  "과제를 제출하세요 (승인 전 시연)": {
   "prepare": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PREPARED",
     "contextRef": "3424b50e-c7b0-41a9-9388-9d3d190c8149",
     "revision": 7,
     "expiresAt": 1793881425072,
     "bodyHash": "e7aed974fb74adbe82eaf6224934e0752001f384640558e9f34092ca91f286ce",
     "sourceHash": "8d4b8eaeb13bb67af4de15f6cf0343463e3dcdab89b510407342d3c6e9242629",
     "model": "gemini-3.5-flash-lite",
     "limits": {
      "countTokens": 1,
      "generateContent": 1,
      "automaticRetries": 0,
      "maxInputTokens": 4096,
      "maxOutputTokens": 2048,
      "maximumGenerationCostUsd": "0.0063488",
      "priceCheckedOn": "2026-11-04",
      "priceSource": "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite"
     },
     "approvalState": "REQUIRED"
    }
   }
  },
  "강의를 완료하세요 (응답 유실 시연)": {
   "prepare": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PREPARED",
     "contextRef": "a02a8482-4720-4eb3-b3b5-287d7401d83c",
     "revision": 8,
     "expiresAt": 1793881425076,
     "bodyHash": "8933036134e63f7dad0ee97db422df19ba821eaf8341d8c31b8d1185330c4a71",
     "sourceHash": "91a2b7c05a3417dff04e2dd8ce9b5016c706db3a4f6b01416e0d8dc7c23bdc96",
     "model": "gemini-3.5-flash-lite",
     "limits": {
      "countTokens": 1,
      "generateContent": 1,
      "automaticRetries": 0,
      "maxInputTokens": 4096,
      "maxOutputTokens": 2048,
      "maximumGenerationCostUsd": "0.0063488",
      "priceCheckedOn": "2026-11-04",
      "priceSource": "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite"
     },
     "approvalState": "RECORDED"
    }
   },
   "generate": {
    "lost": true
   }
  },
  "강의를 완료하세요 (D 오류 시연)": {
   "prepare": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PREPARED",
     "contextRef": "3ebec5f1-100b-40c9-b2cd-0d6dd824ed4a",
     "revision": 1,
     "expiresAt": 1793881425224,
     "bodyHash": "0f8e8a3e626b92319d685db9ee3f6c495d08ce57ac7c0cb5432ea8435df5061e",
     "sourceHash": "7d9b4840d59a7262b6a680f9da8d3f5fe8af1ebac80f8c64126d47e5674ae282",
     "model": "gemini-3.5-flash-lite",
     "limits": {
      "countTokens": 1,
      "generateContent": 1,
      "automaticRetries": 0,
      "maxInputTokens": 4096,
      "maxOutputTokens": 2048,
      "maximumGenerationCostUsd": "0.0063488",
      "priceCheckedOn": "2026-11-04",
      "priceSource": "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite"
     },
     "approvalState": "RECORDED"
    }
   },
   "generate": {
    "status": 422,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "FAILED",
     "contextRef": "3ebec5f1-100b-40c9-b2cd-0d6dd824ed4a",
     "revision": 1,
     "failure": {
      "kind": "D_HTTP",
      "status": 422,
      "error": {
       "version": "clear-external-preview-error.1",
       "code": "GEMINI_HTTP_FAILURE",
       "paymentAllowed": false
      }
     }
    }
   }
  },
  "과제를 제출하세요 (만료 시연)": {
   "prepare": {
    "status": 200,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "PREPARED",
     "contextRef": "5ce465ef-5fde-47fd-ac8d-4591b2ad48ac",
     "revision": 1,
     "expiresAt": 1793881366137,
     "bodyHash": "abf732a187cf6db59dd94d6321913f004aa9842b9ca9327df26885bb332b6db3",
     "sourceHash": "ed7d906e07540a76581d67fa9684981eb5d843876bd0cf88f32009207391f509",
     "model": "gemini-3.5-flash-lite",
     "limits": {
      "countTokens": 1,
      "generateContent": 1,
      "automaticRetries": 0,
      "maxInputTokens": 4096,
      "maxOutputTokens": 2048,
      "maximumGenerationCostUsd": "0.0063488",
      "priceCheckedOn": "2026-11-04",
      "priceSource": "https://aistudio.google.com/docs/pricing#gemini-3.5-flash-lite"
     },
     "approvalState": "RECORDED"
    }
   },
   "generate": {
    "status": 409,
    "body": {
     "version": "clear-operator-preview.1",
     "scope": "PRECONFIGURATION_ONLY",
     "automaticEligibility": false,
     "paymentAllowed": false,
     "stage": "FAILED",
     "failure": {
      "kind": "RELAY",
      "code": "PREVIEW_STALE"
     }
    }
   }
  }
 }
};
