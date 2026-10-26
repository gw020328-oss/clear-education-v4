// B owner composition contract. Types are not authentication; private tickets are.
export type Hex = `0x${string}`;
export type Decimal = string;
export type UnixSeconds = number;
export type DeepReadonly<T> = T extends (...args: never[]) => unknown ? T : T extends object ? {readonly [K in keyof T]: DeepReadonly<T[K]>} : T;
export interface Checkpoint {number: Decimal; hash: Hex; time: Decimal}
export interface Target {decisionId: Hex; revision: Decimal; decisionHash: Hex; sourceValidUntilExclusive: Decimal; acceptanceSequence: Decimal; sourceReceiptHash: Hex}
export interface SourceObservation {currentMet: boolean; validObjection: boolean; unassessedObjection: boolean; newValidError: boolean; sourceValidUntilExclusive: Decimal; observedAt: Decimal; receiptHash: Hex}
export interface Application {
 recipient: Hex; state: Decimal; target: Target; version: Decimal; epoch: Decimal;
 allocationId: Hex; allocatedAt: Decimal; targetRecordedAt: Decimal; procedureId: Hex;
 firstStartedAt: Decimal; publishedAt: Decimal; revalidationCount: Decimal;
 currentMet: boolean; validObjection: boolean; unassessedObjection: boolean; newValidError: boolean; terminalError: boolean;
 consentSetHash: Hex; mutualConsent: boolean; observationReceiptHash: Hex; observedAt: Decimal;
 preparedDigest: Hex; preparedNonce: Hex; deadlinePolicyHash: Hex; terminationReason: Decimal; terminationReceiptHash: Hex;
}
export interface AuthorizationV3 {
 applicationId: Hex; policyHash: Hex; runtimeMappingHash: Hex; decisionId: Hex; decisionRevision: Decimal; decisionHash: Hex;
 recipient: Hex; token: Hex; amountAtoms: Decimal; allocationId: Hex; consentSetHash: Hex; deadlinePolicyHash: Hex;
 eligibilityRoute: Decimal; nonce: Hex; issuedAt: Decimal; expiresAt: Decimal; signerKeyId: Hex; authorizationEpoch: Decimal;
 operationsPolicyHash: Hex; procedureId: Hex; firstReviewStartedAt: Decimal; decisionPublishedAt: Decimal;
 sourceValidUntilExclusive: Decimal; revalidationCount: Decimal;
}
export interface AcceptedRight {recipient: Hex; token: Hex; amountAtoms: Decimal; allocationId: Hex; authorizationDigest: Hex; nonce: Hex; signerKeyId: Hex; authorizationEpoch: Decimal; acceptedAt: Decimal; settledAt: Decimal}
export interface CommandArgs {
 registerCurrentMet: [operationId: Hex, applicationId: Hex, recipient: Hex, target: Target] | [operationId: Hex, applicationId: Hex, recipient: Hex, target: Target, registration: {applicationId: Hex; applicationSalt: Hex; policyHash: Hex; runtimeMappingHash: Hex; participant: Hex; recipient: Hex; nonce: Hex; deadline: string}, signature: Hex];
 allocate: [operationId: Hex, applicationId: Hex, allocationId: Hex, expectedVersion: Decimal];
 startReview: [operationId: Hex, applicationId: Hex, procedureId: Hex, publishedAt: Decimal, expectedVersion: Decimal];
 observeCurrent: [operationId: Hex, applicationId: Hex, observation: SourceObservation, expectedVersion: Decimal];
 replaceTarget: [operationId: Hex, applicationId: Hex, target: Target, mode: Decimal, expectedVersion: Decimal];
 bindConsents: [operationId: Hex, applicationId: Hex, consentSetHash: Hex, mutualConsent: boolean, expectedVersion: Decimal];
 prepareUnsigned: [operationId: Hex, message: AuthorizationV3, expectedVersion: Decimal];
 accept: [operationId: Hex, message: AuthorizationV3, expectedVersion: Decimal];
 terminate: [operationId: Hex, applicationId: Hex, reason: Decimal, receiptHash: Hex, expectedVersion: Decimal];
 registerKey: [operationId: Hex, keyId: Hex, signer: Hex]; revokeKey: [operationId: Hex, keyId: Hex];
 setPause: [operationId: Hex, paused: boolean]; fund: [operationId: Hex, amount: Decimal];
 approve: [spender: Hex, amount: Decimal]; claim: [applicationId: Hex];
}
export type Command = {[M in keyof CommandArgs]: {method: M; args: CommandArgs[M]; applicationId: Hex}}[keyof CommandArgs];
export interface CanonicalObservation {
 version: 'clear-e5-canonical-observation.1'; runtimeHash: Hex; checkpoint: Checkpoint; finality: 'INCLUDED'; businessHash: Hex;
 business: {applicationId: Hex; application: Application; right: AcceptedRight; accounting: {B: Decimal; R: Decimal; O: Decimal; A: Decimal; U: Decimal; S: Decimal; surplus: Decimal}; queue: {applicationId: Hex; sequence: Decimal}[]; nextAllocatable: Hex; paused: boolean; nonce: Hex; nonceUsed: boolean; keyRevoked: boolean};
 executionBusinessHash?: Hex; operationMethod?: Command['method'];
}
export interface BusinessWindow {
 createdAt: UnixSeconds; sourceUntil: UnixSeconds | null; reviewUntil: UnixSeconds | null; messageUntil: UnixSeconds | null;
 /** Exact minimum of createdAt + 120 and the non-null limits; never renewed. */
 businessValidUntil: UnixSeconds;
}
export interface Binding {
 version: 'clear-e5-execution-capability.2'; purpose: 'EXECUTE' | 'RECOVER'; business: BusinessWindow;
 intentId: string; requestId: string; attemptId: string; runtimeHash: Hex; lineage: Decimal;
 /** Runtime-global fence, not the intent lease counter. */
 workerFence: Decimal; workerId: string; leaseId: string; expiresAt: UnixSeconds;
 e3Commitment: Hex; commandHash: Hex; anchor: Checkpoint; businessHash: Hex;
}
export interface Certificate<P> {payload: P; signature: Hex}
export interface CurrentPayload {version: 'clear-e5-current-witness.2'; challenge: string; phase: string; bindingHash: Hex; observationHash: Hex; runtimeHash: Hex}
export interface SealReference {ref: string; manifestHash: Hex}
export interface CommitReference extends SealReference {adoptionId: string; adoptionHash: Hex}
export interface CommitPayload extends CommitReference {version: 'clear-e5-api-commit.2'; challenge: string; bindingHash: Hex; runtimeHash: Hex}
export interface RegisteredReaderProof {
 kind: 'REGISTERED_CANONICAL_READER'; runtimeHash: Hex; query: {applicationId: Hex; nonce: Hex};
 anchor: Checkpoint; current: Checkpoint; businessHash: Hex; commandHash: Hex; bindingHash: Hex;
 ancestry: {ancestor: Hex; descendant: Hex};
}
export interface AuthorityOnlyProof {kind: 'AUTHORITY_ONLY_NO_CHAIN_ASSERTION'}
declare const privateTicket: unique symbol;
/** Object identity is checked in a private WeakMap. Clone/JSON/cast cannot grant authority. */
export interface PrivateTicket {readonly version: 'clear-e5b-private-ticket.1'; readonly challenge: string; readonly [privateTicket]: true}
export interface ControllerEvidence {
 version: 'clear-e5b-controller-evidence.1'; runtimeHash: Hex; phase: string; binding: Binding; command: Command;
 observation: CanonicalObservation | {lookup: true} | {recovery: true; ref?: string; txHash?: Hex | null} | {retention: true; ref: string} | null;
 proof: RegisteredReaderProof | AuthorityOnlyProof; reference: CommitReference | null;
 payload: Binding | CurrentPayload | CommitPayload;
}
export interface ControllerPorts {
 witnesses: {consume(ticket: PrivateTicket): DeepReadonly<ControllerEvidence>};
 /** Issue exactly once after consume, only in the matching synchronous callback. */
 issuer: {capability(ticket: PrivateTicket): Certificate<Binding>; current(ticket: PrivateTicket): Certificate<CurrentPayload>; commit(ticket: PrivateTicket): Certificate<CommitPayload>};
}
export interface Controller {
 authorizeSync(context: {ticket: PrivateTicket}): Certificate<Binding>;
 readCurrentSync(context: {ticket: PrivateTicket}): Certificate<CurrentPayload>;
 commitCurrentSync(context: {ticket: PrivateTicket}): Certificate<CommitPayload>;
}
export type ControllerFactory = (ports: DeepReadonly<ControllerPorts>) => Controller;
export interface AuthorizedRequest {binding: Binding; command: Command; capability: Certificate<Binding>}
export interface ReferenceRequest extends SealReference {binding: Binding; capability: Certificate<Binding>}
export interface DispatchRequest extends ReferenceRequest {adoptionId: string; adoptionHash: Hex}
export type EnvelopeState = 'PREPARING' | 'SIGNING_UNCERTAIN' | 'SEALED' | 'SEND_STARTED' | 'UNKNOWN' | 'INCLUDED' | 'REVERTED' | 'REORGED' | 'EXPIRED_UNSENT';
export interface PublicEnvelope {
 version: 'clear-e5-public-envelope.2'; ref: string; manifestHash: Hex | null; state: EnvelopeState;
 runtimeHash: Hex; intentId: string; requestId: string; attemptId: string; lineage: Decimal; commandHash: Hex; originalBindingHash: Hex;
 sender: Hex; transactionNonce: Decimal; authorizationNonce: Hex | null; to: Hex; value: '0'; chainId: Decimal;
 dataHash: Hex | null; txHash: Hex | null; businessValidUntil: UnixSeconds; originalAuthorityUntil: UnixSeconds; bytesUntil: UnixSeconds;
}
export interface Adoption extends CommitReference {
 version: 'clear-e5-envelope-adoption.1'; originalBindingHash: Hex; binding: Binding; bindingHash: Hex;
 businessValidUntil: UnixSeconds; authorityUntil: UnixSeconds;
}
export type LookupResult = {status: 'NOT_FOUND'; automaticSeal: false} | {status: 'FOUND' | 'FOUND_UNSEALED_HOLD'; automaticSeal: false; envelope: PublicEnvelope};
export interface ReceiptObservation {
 status: 'UNKNOWN' | 'INCLUDED' | 'REVERTED' | 'REORGED'; txHash: Hex;
 checkpoint?: Checkpoint; observation?: CanonicalObservation; currentObservation?: CanonicalObservation;
 blockHash?: Hex; finalized?: false; code?: 'E5_CANONICAL_READBACK_UNAVAILABLE';
}
export type RecoveryResult = ({ref: string; lineage: Decimal; automaticResign: false} & ReceiptObservation)
 | {ref: string; status: EnvelopeState; automaticResign: false}
 | {ref: string; status: 'RECOVERY_BLOCKED'; historicalObservation: ReceiptObservation; lineage: Decimal; automaticPromotion: false};
export type DispatchResult = RecoveryResult | {status: 'UNKNOWN'; ref: string; txHash: Hex};
export interface WorkerPorts {
 /** Call outside the API DB transaction; actual chain reads precede authorizeSync. */
 authorize(request: {binding: Binding; command: Command}): Promise<Certificate<Binding>>;
 lookup(request: AuthorizedRequest): LookupResult;
 envelope(request: ReferenceRequest): PublicEnvelope;
 seal(request: AuthorizedRequest): Promise<SealReference>;
 adopt(request: ReferenceRequest): Promise<Adoption>;
 dispatch(request: DispatchRequest): Promise<DispatchResult>;
 recover(request: ReferenceRequest): Promise<RecoveryResult>;
}
export interface RuntimeManifest {
 version: 'clear-e5-test-runtime.1' | 'clear-e5-test-runtime.2'; environmentId: string; production: false; finalityPolicy: 'LOCAL_DEV_INCLUSION_ONLY';
 imageId: string; platform: string; image: string; clientVersion: string; networkIsolation: string;
 chainId: Decimal; networkId: string; genesisHash: Hex; endpoint: string; tokenAddress: Hex; tokenCodeHash: Hex;
 vaultAddress: Hex; vaultCodeHash: Hex; instanceId: Hex; policyHash: Hex; runtimeMappingHash: Hex; operationsPolicyHash: Hex;
 domain: {name: 'ClearBootcampTestPayment'; version: '3'; chainId: Decimal; verifyingContract: Hex; salt: Hex};
 typeHash: Hex; domainSeparator: Hex; roles: Record<'registrar' | 'initialSigner' | 'keyAdmin' | 'relayer' | 'depositor' | 'terminator', Hex>;
 signerKeyId: Hex; signerAddress: Hex; controllerAddress: Hex; deploymentTransactions: {token: Hex; vault: Hex};
 checkpoint: {number: Decimal; hash: Hex}; blockHashCapability: unknown;
}
export interface ApiBridge {
 version: 'clear-e5-api-bridge.1'; runtime: DeepReadonly<{runtimeHash: Hex; manifest: RuntimeManifest; vaultScope: {chainId: Decimal; vaultAddress: Hex; instanceId: Hex}; authorityScope: FenceQuery}>;
 reader: {observe(command: Command): Promise<{observation: CanonicalObservation; businessHash: Hex}>;
  claimReceipt(query: {applicationId: Hex; txHash: Hex}): Promise<DeepReadonly<DirectClaimReceipt>>;
  compare(input: {previous: Checkpoint; current: Checkpoint}): Promise<{status: 'CANONICAL_ANCESTOR'; previous: Hex; current: Hex} | {status: 'REORG_PROVEN_RECOVERY_BLOCKED'; oldHash: Hex; replacementHash: Hex; currentHash: Hex; commonAncestor: Checkpoint; automaticRebase: false}>;
 };
 worker: Readonly<WorkerPorts>;
 owner: {fenceReader: FenceReader; bindController(factory: ControllerFactory): void; close(): void;
  metrics(): {keyAccesses: number; paymentSignatures: number; transactionSignatures: number; broadcasts: number};
  prune(request: ReferenceRequest): {ref: string; status: EnvelopeState; secretDeletion: 'DELETED'; nonceRetained: true; invalidatesBroadcast: false};
 };
}
export type DirectClaimReceipt = {version: 'clear-e5b-direct-claim-receipt.1'; runtimeHash: Hex; applicationId: Hex; txHash: Hex} & (
 {status: 'UNKNOWN'; code: 'E5B_CLAIM_READBACK_UNAVAILABLE'; automaticPromotion: false}
 | {status: 'INCLUDED'; checkpoint: Checkpoint; observation: CanonicalObservation; allocationId: Hex; authorizationDigest: Hex; recipient: Hex; token: Hex; amountAtoms: '100000000'; finalized: false});
export interface FenceQuery {runtimeId: string; runtimePinHash: Hex; scopeKey: Hex}
export interface FenceWitness extends FenceQuery {version: 'clear-bootcamp-runtime-fence-witness.1'; highestFence: number}
/** Capture this owner-only reader in the API constructor; mandatory before acquire.
 * E4 scopeKey = SHA256(canonical({chainId, vaultAddress, instanceId})). The API
 * adapter must explicitly consume this mapping; old metadata projections differ.
 * Highest fence comes from the E4 database, never a query value. No transaction
 * in the API may be held across read; API owns the post-await CAS and 5s lifetime.
 */
export interface FenceReader {readonly version: 'clear-bootcamp-runtime-fence-reader.1'; read(query: FenceQuery): Promise<DeepReadonly<FenceWitness>>}
/** Trusted owner only; never accept environment/clock/cut from an HTTP body. */
export function openOwnedApiBridge(configuration: {environmentId: string; clock?: () => UnixSeconds; cut?: (phase: string, ownedPrivateRow: unknown) => void}): Readonly<ApiBridge>;
