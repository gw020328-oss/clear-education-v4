// 부트캠프 normal view fixture — 백엔드 제공본 복사
//
// 원본   specs/bootcamp/normal-frontend-fixtures-v1.json
// 출처   codex/bootcamp-e5-api-bridge @ 0b9091f
// 복사   2026-10-23
//
// 왜 복사하는가. web/ 은 npm·번들러 없는 독립 정적 트리다. 백엔드 저장소 경로를
// 참조하면 그 트리에 묶인다. 대신 **출처 커밋을 위에 박아** 원본이 바뀌면 대조할
// 수 있게 한다.
//
// 이 값은 서버가 실제로 보낸 응답이 아니라 **공개 합성 예시**다. 원본 자체가
// scope 를 그렇게 선언한다 — PUBLIC_SYNTHETIC_RESPONSE_EXAMPLES_NOT_RUNTIME_INPUT.
// 실행 시계는 2020 이고 realSourceVerified·chainTransactions·paidCalls 가 전부 0 이다.
// 화면이 이것을 실제 연동 결과로 보여주면 안 된다.
//
// 두 상황 × 두 역할이 들어 있다.
//
//   missing                    네 조건이 전부 UNKNOWN. 재원도 대기(부족 50000000)
//   waitingForOperatorConsent  네 조건 MET, 전액 배정, 참가자만 동의한 상태
//
// normal-client.mjs 의 normalView() 가 내보내는 모양과 같다. 그 모듈이 서버에서
// 오므로 우리는 이 모양을 **검증하지 않고 그대로 그린다** — 어긋나면 서버 모듈이
// 먼저 던진다(BC_NORMAL_*).

export const BOOTCAMP_FIXTURES = Object.freeze({
  "version": "clear-bootcamp-normal-frontend-fixtures.1",
  "scope": "PUBLIC_SYNTHETIC_RESPONSE_EXAMPLES_NOT_RUNTIME_INPUT",
  "scenarioClock": "OFFLINE_SYNTHETIC_2020_NOT_FRESH_SOURCE",
  "realSourceVerified": false,
  "chainTransactions": 0,
  "paidCalls": 0,
  "cases": {
    "missing": {
      "participant": {
        "version": "clear-bootcamp-normal-view.1",
        "displayOnly": true,
        "applicationId": "application-50ffec3f-ebb9-40eb-b449-93c98ff1f1ed",
        "policyHash": "0x1c6f90cd998e91a11bc6abc9fca3fb9f918238225b077b1aa0610de395fae281",
        "runtimeMappingHash": "0x76d1c8585013440e31ed8b52b5295255e521404acc6bca2535c7099097c1b732",
        "role": "PARTICIPANT",
        "target": {
          "expectedRevision": 1,
          "expectedLedgerSequence": 3,
          "targetDecisionId": "decision-c4c9f501-3249-43ce-b185-57acdfe2401b",
          "targetDecisionRevision": 1,
          "targetDecisionHash": "0x97f6a31f91a0706773c481d0b48c1ae4afc8f21d573c48f53912345bff4eb218"
        },
        "observedAt": 1580558400,
        "decision": {
          "id": "decision-c4c9f501-3249-43ce-b185-57acdfe2401b",
          "revision": 1,
          "hash": "0x97f6a31f91a0706773c481d0b48c1ae4afc8f21d573c48f53912345bff4eb218",
          "current": true,
          "evidenceCurrent": false,
          "conditionsStatus": "UNKNOWN"
        },
        "criteria": [
          {
            "criterionId": "activity-complete",
            "state": "UNKNOWN",
            "current": false,
            "evidenceId": null,
            "evidenceRevision": null,
            "reasonCode": "SOURCE_UNAVAILABLE",
            "expiresAt": null,
            "source": {
              "kind": "MOODLE_ACTIVITY_COMPLETION",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "assignment-submitted",
            "state": "UNKNOWN",
            "current": false,
            "evidenceId": null,
            "evidenceRevision": null,
            "reasonCode": "SOURCE_UNAVAILABLE",
            "expiresAt": null,
            "source": {
              "kind": "MOODLE_ASSIGNMENT_SUBMISSION",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "reflection-topics",
            "state": "UNKNOWN",
            "current": false,
            "evidenceId": null,
            "evidenceRevision": null,
            "reasonCode": "SOURCE_UNAVAILABLE",
            "expiresAt": null,
            "source": {
              "kind": "MOODLE_REFLECTION_AI",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "python-basic-certificate",
            "state": "UNKNOWN",
            "current": false,
            "evidenceId": null,
            "evidenceRevision": null,
            "reasonCode": "SOURCE_UNAVAILABLE",
            "expiresAt": null,
            "source": {
              "kind": "RECLAIM_HACKERRANK",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          }
        ],
        "agreedPayment": {
          "amountAtoms": "100000000",
          "symbol": "TEST",
          "decimals": 6
        },
        "funding": {
          "implementation": "SYNTHETIC_PORT_FIXTURE",
          "snapshotId": "funding-allocation-1",
          "status": "WAITING_FUNDS",
          "allocationId": null,
          "targetDecisionId": "decision-c4c9f501-3249-43ce-b185-57acdfe2401b",
          "matchesCurrentDecision": false,
          "queue": {
            "position": 2,
            "shortfallAtoms": "50000000"
          },
          "amountAtoms": "100000000",
          "reservedAtoms": "0"
        },
        "procedure": {
          "id": null,
          "status": "SOURCE_REVERIFICATION_REQUIRED",
          "firstStartedAt": null,
          "reviewCapAt": null,
          "publishedDecisionId": null,
          "publishedAt": null,
          "confirmAt": null,
          "deadlineRouteAvailable": false,
          "revalidationCount": 0,
          "revalidationLimit": 1,
          "terminationReason": null,
          "invalidationReason": null,
          "reservationReleased": false,
          "epochInvalidated": false
        },
        "consent": {
          "scopeHash": null,
          "bothCurrent": false,
          "records": [],
          "requiredRoles": [
            "PARTICIPANT",
            "COURSE_OPERATOR"
          ],
          "onchainWalletSignaturesVerified": false
        },
        "objection": {
          "blocked": false
        },
        "payment": {
          "acceptedRight": null,
          "transactionState": null,
          "transactionHash": null,
          "blockRef": null,
          "claimState": null,
          "receivedAtoms": null,
          "canonicalTransferVerified": null,
          "receiptHttpAvailable": false
        },
        "sourceMode": "SYNTHETIC_TEST_SOURCE"
      },
      "operator": {
        "version": "clear-bootcamp-normal-view.1",
        "displayOnly": true,
        "applicationId": "application-50ffec3f-ebb9-40eb-b449-93c98ff1f1ed",
        "policyHash": "0x1c6f90cd998e91a11bc6abc9fca3fb9f918238225b077b1aa0610de395fae281",
        "runtimeMappingHash": "0x76d1c8585013440e31ed8b52b5295255e521404acc6bca2535c7099097c1b732",
        "role": "COURSE_OPERATOR",
        "target": {
          "expectedRevision": 1,
          "expectedLedgerSequence": 3,
          "targetDecisionId": "decision-c4c9f501-3249-43ce-b185-57acdfe2401b",
          "targetDecisionRevision": 1,
          "targetDecisionHash": "0x97f6a31f91a0706773c481d0b48c1ae4afc8f21d573c48f53912345bff4eb218"
        },
        "observedAt": 1580558400,
        "decision": {
          "id": "decision-c4c9f501-3249-43ce-b185-57acdfe2401b",
          "revision": 1,
          "hash": "0x97f6a31f91a0706773c481d0b48c1ae4afc8f21d573c48f53912345bff4eb218",
          "current": true,
          "evidenceCurrent": false,
          "conditionsStatus": "UNKNOWN"
        },
        "criteria": [
          {
            "criterionId": "activity-complete",
            "state": "UNKNOWN",
            "current": false,
            "evidenceId": null,
            "evidenceRevision": null,
            "reasonCode": "ROLE_RAW_ACCESS_NOT_GRANTED",
            "expiresAt": null,
            "source": {
              "kind": "MOODLE_ACTIVITY_COMPLETION",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "assignment-submitted",
            "state": "UNKNOWN",
            "current": false,
            "evidenceId": null,
            "evidenceRevision": null,
            "reasonCode": "ROLE_RAW_ACCESS_NOT_GRANTED",
            "expiresAt": null,
            "source": {
              "kind": "MOODLE_ASSIGNMENT_SUBMISSION",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "reflection-topics",
            "state": "UNKNOWN",
            "current": false,
            "evidenceId": null,
            "evidenceRevision": null,
            "reasonCode": "ROLE_RAW_ACCESS_NOT_GRANTED",
            "expiresAt": null,
            "source": {
              "kind": "MOODLE_REFLECTION_AI",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "python-basic-certificate",
            "state": "UNKNOWN",
            "current": false,
            "evidenceId": null,
            "evidenceRevision": null,
            "reasonCode": "ROLE_RAW_ACCESS_NOT_GRANTED",
            "expiresAt": null,
            "source": {
              "kind": "RECLAIM_HACKERRANK",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          }
        ],
        "agreedPayment": {
          "amountAtoms": "100000000",
          "symbol": "TEST",
          "decimals": 6
        },
        "funding": {
          "implementation": "SYNTHETIC_PORT_FIXTURE",
          "snapshotId": "funding-allocation-1",
          "status": "WAITING_FUNDS",
          "allocationId": null,
          "targetDecisionId": "decision-c4c9f501-3249-43ce-b185-57acdfe2401b",
          "matchesCurrentDecision": false,
          "queue": {
            "position": 2,
            "shortfallAtoms": "50000000"
          },
          "amountAtoms": "100000000",
          "reservedAtoms": "0"
        },
        "procedure": {
          "id": null,
          "status": "SOURCE_REVERIFICATION_REQUIRED",
          "firstStartedAt": null,
          "reviewCapAt": null,
          "publishedDecisionId": null,
          "publishedAt": null,
          "confirmAt": null,
          "deadlineRouteAvailable": false,
          "revalidationCount": 0,
          "revalidationLimit": 1,
          "terminationReason": null,
          "invalidationReason": null,
          "reservationReleased": false,
          "epochInvalidated": false
        },
        "consent": {
          "scopeHash": null,
          "bothCurrent": false,
          "records": [],
          "requiredRoles": [
            "PARTICIPANT",
            "COURSE_OPERATOR"
          ],
          "onchainWalletSignaturesVerified": false
        },
        "objection": {
          "blocked": false
        },
        "payment": {
          "acceptedRight": null,
          "transactionState": null,
          "transactionHash": null,
          "blockRef": null,
          "claimState": null,
          "receivedAtoms": null,
          "canonicalTransferVerified": null,
          "receiptHttpAvailable": false
        },
        "sourceMode": "SYNTHETIC_TEST_SOURCE"
      }
    },
    "waitingForOperatorConsent": {
      "participant": {
        "version": "clear-bootcamp-normal-view.1",
        "displayOnly": true,
        "applicationId": "application-50ffec3f-ebb9-40eb-b449-93c98ff1f1ed",
        "policyHash": "0x1c6f90cd998e91a11bc6abc9fca3fb9f918238225b077b1aa0610de395fae281",
        "runtimeMappingHash": "0x76d1c8585013440e31ed8b52b5295255e521404acc6bca2535c7099097c1b732",
        "role": "PARTICIPANT",
        "target": {
          "expectedRevision": 9,
          "expectedLedgerSequence": 43,
          "targetDecisionId": "decision-8dd63078-406b-457d-a7ca-e7202f5024fc",
          "targetDecisionRevision": 9,
          "targetDecisionHash": "0x6c7d7917a8ed4781aa7e478b70d3f713c3b21a8d109015d4c16f7766bfcac03b"
        },
        "observedAt": 1580558400,
        "decision": {
          "id": "decision-8dd63078-406b-457d-a7ca-e7202f5024fc",
          "revision": 9,
          "hash": "0x6c7d7917a8ed4781aa7e478b70d3f713c3b21a8d109015d4c16f7766bfcac03b",
          "current": true,
          "evidenceCurrent": true,
          "conditionsStatus": "MET"
        },
        "criteria": [
          {
            "criterionId": "activity-complete",
            "state": "MET",
            "current": true,
            "evidenceId": "evidence-8476afd2-1aa9-4fd0-a315-93f1f1608eea",
            "evidenceRevision": 1,
            "reasonCode": null,
            "expiresAt": 1580560200,
            "source": {
              "kind": "MOODLE_ACTIVITY_COMPLETION",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": true,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "assignment-submitted",
            "state": "MET",
            "current": true,
            "evidenceId": "evidence-896f17e7-4951-4fc8-8bd1-e13d34a695df",
            "evidenceRevision": 1,
            "reasonCode": null,
            "expiresAt": 1580560200,
            "source": {
              "kind": "MOODLE_ASSIGNMENT_SUBMISSION",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": true,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "reflection-topics",
            "state": "MET",
            "current": true,
            "evidenceId": "evidence-b2a83ba1-3f19-4e1a-a0b1-60ecbc87cf12",
            "evidenceRevision": 1,
            "reasonCode": null,
            "expiresAt": 1580560200,
            "source": {
              "kind": "MOODLE_REFLECTION_AI",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": true,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "python-basic-certificate",
            "state": "MET",
            "current": true,
            "evidenceId": "evidence-21889a1c-45fb-4bad-83e7-e5f892ac3cd5",
            "evidenceRevision": 1,
            "reasonCode": null,
            "expiresAt": 1580560200,
            "source": {
              "kind": "RECLAIM_HACKERRANK",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": true,
              "httpAvailable": false
            }
          }
        ],
        "agreedPayment": {
          "amountAtoms": "100000000",
          "symbol": "TEST",
          "decimals": 6
        },
        "funding": {
          "implementation": "SYNTHETIC_PORT_FIXTURE",
          "snapshotId": "funding-allocation-1",
          "status": "FULLY_ALLOCATED",
          "allocationId": "allocation-1",
          "targetDecisionId": "decision-8dd63078-406b-457d-a7ca-e7202f5024fc",
          "matchesCurrentDecision": true,
          "queue": null,
          "amountAtoms": "100000000",
          "reservedAtoms": "100000000"
        },
        "procedure": {
          "id": "procedure-ae85d253-dfc1-486f-ba6e-21c87bf1b396",
          "status": "WAITING_CONFIRMATION",
          "firstStartedAt": 1580558400,
          "reviewCapAt": 1580559000,
          "publishedDecisionId": "decision-8dd63078-406b-457d-a7ca-e7202f5024fc",
          "publishedAt": 1580558400,
          "confirmAt": 1580558520,
          "deadlineRouteAvailable": true,
          "revalidationCount": 0,
          "revalidationLimit": 1,
          "terminationReason": null,
          "invalidationReason": null,
          "reservationReleased": false,
          "epochInvalidated": false
        },
        "consent": {
          "scopeHash": "0x7cdad0d1685a1062e46b9db4873898b01919c8537012b1dd27dddf7c699a34af",
          "bothCurrent": false,
          "records": [
            {
              "actorCommitment": "0xe76f5b6c1603f1a83e64bba4546c53b7fed8ec4f08986df7eb444ef44748fcc4",
              "actorRole": "PARTICIPANT",
              "decisionId": "decision-8dd63078-406b-457d-a7ca-e7202f5024fc",
              "id": "consent-9b3949ee-fd8c-43db-93a2-31ac0f030147",
              "procedureId": "procedure-ae85d253-dfc1-486f-ba6e-21c87bf1b396",
              "recordedAt": 1580558400,
              "scopeHash": "0x7cdad0d1685a1062e46b9db4873898b01919c8537012b1dd27dddf7c699a34af",
              "value": "AGREE",
              "version": "clear-bootcamp-review-consent.1"
            }
          ],
          "requiredRoles": [
            "PARTICIPANT",
            "COURSE_OPERATOR"
          ],
          "onchainWalletSignaturesVerified": false
        },
        "objection": {
          "blocked": false
        },
        "payment": {
          "acceptedRight": null,
          "transactionState": null,
          "transactionHash": null,
          "blockRef": null,
          "claimState": null,
          "receivedAtoms": null,
          "canonicalTransferVerified": null,
          "receiptHttpAvailable": false
        },
        "sourceMode": "SYNTHETIC_TEST_SOURCE"
      },
      "operator": {
        "version": "clear-bootcamp-normal-view.1",
        "displayOnly": true,
        "applicationId": "application-50ffec3f-ebb9-40eb-b449-93c98ff1f1ed",
        "policyHash": "0x1c6f90cd998e91a11bc6abc9fca3fb9f918238225b077b1aa0610de395fae281",
        "runtimeMappingHash": "0x76d1c8585013440e31ed8b52b5295255e521404acc6bca2535c7099097c1b732",
        "role": "COURSE_OPERATOR",
        "target": {
          "expectedRevision": 9,
          "expectedLedgerSequence": 43,
          "targetDecisionId": "decision-8dd63078-406b-457d-a7ca-e7202f5024fc",
          "targetDecisionRevision": 9,
          "targetDecisionHash": "0x6c7d7917a8ed4781aa7e478b70d3f713c3b21a8d109015d4c16f7766bfcac03b"
        },
        "observedAt": 1580558400,
        "decision": {
          "id": "decision-8dd63078-406b-457d-a7ca-e7202f5024fc",
          "revision": 9,
          "hash": "0x6c7d7917a8ed4781aa7e478b70d3f713c3b21a8d109015d4c16f7766bfcac03b",
          "current": true,
          "evidenceCurrent": true,
          "conditionsStatus": "MET"
        },
        "criteria": [
          {
            "criterionId": "activity-complete",
            "state": "MET",
            "current": true,
            "evidenceId": "evidence-8476afd2-1aa9-4fd0-a315-93f1f1608eea",
            "evidenceRevision": 1,
            "reasonCode": "ROLE_RAW_ACCESS_NOT_GRANTED",
            "expiresAt": 1580560200,
            "source": {
              "kind": "MOODLE_ACTIVITY_COMPLETION",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "assignment-submitted",
            "state": "MET",
            "current": true,
            "evidenceId": "evidence-896f17e7-4951-4fc8-8bd1-e13d34a695df",
            "evidenceRevision": 1,
            "reasonCode": "ROLE_RAW_ACCESS_NOT_GRANTED",
            "expiresAt": 1580560200,
            "source": {
              "kind": "MOODLE_ASSIGNMENT_SUBMISSION",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "reflection-topics",
            "state": "MET",
            "current": true,
            "evidenceId": "evidence-b2a83ba1-3f19-4e1a-a0b1-60ecbc87cf12",
            "evidenceRevision": 1,
            "reasonCode": "ROLE_RAW_ACCESS_NOT_GRANTED",
            "expiresAt": 1580560200,
            "source": {
              "kind": "MOODLE_REFLECTION_AI",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          },
          {
            "criterionId": "python-basic-certificate",
            "state": "MET",
            "current": true,
            "evidenceId": "evidence-21889a1c-45fb-4bad-83e7-e5f892ac3cd5",
            "evidenceRevision": 1,
            "reasonCode": "ROLE_RAW_ACCESS_NOT_GRANTED",
            "expiresAt": 1580560200,
            "source": {
              "kind": "RECLAIM_HACKERRANK",
              "hostMode": "SYNTHETIC_TEST_SOURCE",
              "actualSourceVerification": null
            },
            "originalEvidence": {
              "authorized": false,
              "httpAvailable": false
            }
          }
        ],
        "agreedPayment": {
          "amountAtoms": "100000000",
          "symbol": "TEST",
          "decimals": 6
        },
        "funding": {
          "implementation": "SYNTHETIC_PORT_FIXTURE",
          "snapshotId": "funding-allocation-1",
          "status": "FULLY_ALLOCATED",
          "allocationId": "allocation-1",
          "targetDecisionId": "decision-8dd63078-406b-457d-a7ca-e7202f5024fc",
          "matchesCurrentDecision": true,
          "queue": null,
          "amountAtoms": "100000000",
          "reservedAtoms": "100000000"
        },
        "procedure": {
          "id": "procedure-ae85d253-dfc1-486f-ba6e-21c87bf1b396",
          "status": "WAITING_CONFIRMATION",
          "firstStartedAt": 1580558400,
          "reviewCapAt": 1580559000,
          "publishedDecisionId": "decision-8dd63078-406b-457d-a7ca-e7202f5024fc",
          "publishedAt": 1580558400,
          "confirmAt": 1580558520,
          "deadlineRouteAvailable": true,
          "revalidationCount": 0,
          "revalidationLimit": 1,
          "terminationReason": null,
          "invalidationReason": null,
          "reservationReleased": false,
          "epochInvalidated": false
        },
        "consent": {
          "scopeHash": "0x7cdad0d1685a1062e46b9db4873898b01919c8537012b1dd27dddf7c699a34af",
          "bothCurrent": false,
          "records": [
            {
              "actorCommitment": "0xe76f5b6c1603f1a83e64bba4546c53b7fed8ec4f08986df7eb444ef44748fcc4",
              "actorRole": "PARTICIPANT",
              "decisionId": "decision-8dd63078-406b-457d-a7ca-e7202f5024fc",
              "id": "consent-9b3949ee-fd8c-43db-93a2-31ac0f030147",
              "procedureId": "procedure-ae85d253-dfc1-486f-ba6e-21c87bf1b396",
              "recordedAt": 1580558400,
              "scopeHash": "0x7cdad0d1685a1062e46b9db4873898b01919c8537012b1dd27dddf7c699a34af",
              "value": "AGREE",
              "version": "clear-bootcamp-review-consent.1"
            }
          ],
          "requiredRoles": [
            "PARTICIPANT",
            "COURSE_OPERATOR"
          ],
          "onchainWalletSignaturesVerified": false
        },
        "objection": {
          "blocked": false
        },
        "payment": {
          "acceptedRight": null,
          "transactionState": null,
          "transactionHash": null,
          "blockRef": null,
          "claimState": null,
          "receivedAtoms": null,
          "canonicalTransferVerified": null,
          "receiptHttpAvailable": false
        },
        "sourceMode": "SYNTHETIC_TEST_SOURCE"
      }
    }
  }
});

/** 화면 선택 상자에 쓸 이름 */
export const BOOTCAMP_CASES = Object.freeze({
  missing: '1. 조건 확인 전 — 네 조건 UNKNOWN · 재원 대기',
  waitingForOperatorConsent: '2. 참가자 동의함 — 운영자 동의 대기',
});

/** @param {'missing'|'waitingForOperatorConsent'} caseId @param {'participant'|'operator'} role */
export function bootcampView(caseId, role) {
  const found = BOOTCAMP_FIXTURES.cases[caseId]?.[role];
  if (!found) throw new Error('없는 fixture: ' + caseId + '/' + role);
  return found;
}
