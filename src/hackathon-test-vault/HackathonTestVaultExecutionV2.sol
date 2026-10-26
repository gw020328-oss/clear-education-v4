// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;
import {StrictECDSA} from "./StrictECDSA.sol";
import {ClearTestToken} from "../../contracts/ClearTestToken.sol";

/// Separate V2 TEST candidate; existing deployments and V1 source remain unchanged.
/// Participant-bound registration; no production activation or migration.
/// Source truth and authenticated app consents remain registrar assertions.
contract HackathonTestVaultExecutionV2 {
    uint256 public constant AMOUNT = 100000000;
    uint256 public constant MAX_APPLICATIONS = 64;
    bytes32 public constant P0_POLICY = 0x1c6f90cd998e91a11bc6abc9fca3fb9f918238225b077b1aa0610de395fae281;
    bytes32 public constant PROFILE = 0x47a18b20a02a8acf89160c50601b8a2625bcae432292d9cf6d4644af0a2fdb98;
    bytes32 public constant TYPE_HASH = 0x0420a07c2295bca1fc66f0033f2afa0c6e430c7d7cccb48fa23a98c84d97fa8f;
    // No deployment/activation switch. This source implements rights, not a live runtime.
    bytes32 public constant RUNTIME_KIND = keccak256("CLEAR_HACKATHON_TEST_EXECUTION_V2");
    enum State { NONE, QUEUED, RESERVED, REVIEW, TERMINATED, ACCEPTED, SETTLED }
    enum Change { ROUTINE_REFRESH, REVALIDATION }
    enum Termination { NONE, CAP_UNRESOLVED, NEW_VALID_ERROR_AFTER_REVALIDATION, SOURCE_UNREFRESHED_WITHIN_CAP }
    struct Roles { address registrar; address initialSigner; address keyAdmin; address relayer; address depositor; address terminator; }
    struct Target { bytes32 decisionId; uint64 revision; bytes32 decisionHash; uint64 sourceValidUntilExclusive; uint64 acceptanceSequence; bytes32 sourceReceiptHash; }
    struct Observation { bool currentMet; bool validObjection; bool unassessedObjection; bool newValidError; uint64 sourceValidUntilExclusive; uint64 observedAt; bytes32 receiptHash; }
    struct Application {
        address recipient; State state; Target target; uint64 version; uint64 epoch;
        bytes32 allocationId; uint64 allocatedAt; uint64 targetRecordedAt;
        bytes32 procedureId; uint64 firstStartedAt; uint64 publishedAt; uint8 revalidationCount;
        bool currentMet; bool validObjection; bool unassessedObjection; bool newValidError; bool terminalError;
        bytes32 consentSetHash; bool mutualConsent; bytes32 observationReceiptHash; uint64 observedAt;
        bytes32 preparedDigest; bytes32 preparedNonce; bytes32 deadlinePolicyHash;
        Termination terminationReason; bytes32 terminationReceiptHash;
    }
    struct RecipientRegistration {
        bytes32 applicationId; bytes32 applicationSalt; bytes32 policyHash; bytes32 runtimeMappingHash;
        address participant; address recipient; bytes32 nonce; uint64 deadline;
    }
    bytes32 public constant REGISTRATION_TYPE_HASH = keccak256("RecipientRegistration(bytes32 applicationId,bytes32 applicationSalt,bytes32 policyHash,bytes32 runtimeMappingHash,address participant,address recipient,bytes32 nonce,uint64 deadline)");
    mapping(address => mapping(bytes32 => bool)) public usedRegistrationNonces;
    event RecipientRegistered(bytes32 indexed applicationId, address indexed participant, bytes32 digest, uint64 registrationSequence);
    struct Authorization {
        bytes32 applicationId; bytes32 policyHash; bytes32 runtimeMappingHash;
        bytes32 decisionId; uint64 decisionRevision; bytes32 decisionHash;
        address recipient; address token; uint256 amountAtoms; bytes32 allocationId;
        bytes32 consentSetHash; bytes32 deadlinePolicyHash; uint8 eligibilityRoute;
        bytes32 nonce; uint64 issuedAt; uint64 expiresAt; bytes32 signerKeyId; uint64 authorizationEpoch;
        bytes32 operationsPolicyHash; bytes32 procedureId; uint64 firstReviewStartedAt;
        uint64 decisionPublishedAt; uint64 sourceValidUntilExclusive; uint8 revalidationCount;
    }
    struct AcceptedRight {
        address recipient; address token; uint256 amountAtoms; bytes32 allocationId;
        bytes32 authorizationDigest; bytes32 nonce; bytes32 signerKeyId;
        uint64 authorizationEpoch; uint64 acceptedAt; uint64 settledAt;
    }
    struct Key { address signer; bool revoked; }
    struct ReplacementTarget { bytes32 decisionId; uint64 revision; bytes32 decisionHash; uint64 acceptanceSequence; uint64 epoch; uint64 appVersion; bytes32 sourceReceiptHash; }
    ClearTestToken public immutable token;
    bytes32 public immutable instanceId;
    bytes32 public immutable policyHash;
    bytes32 public immutable runtimeMappingHash;
    Roles public roles;
    uint256 public balance; // confirmed credited B; unsolicited transfers are surplus
    uint256 public reserved;
    uint256 public obligations; // O includes R
    uint64 public lastAcceptanceSequence;
    bool public newOperationsPaused;
    mapping(bytes32 => Application) private apps;
    mapping(bytes32 => AcceptedRight) private rights;
    mapping(bytes32 => bool) public usedNonces;
    bytes32[] private appIds;
    mapping(bytes32 => bool) public allocationIds;
    mapping(bytes32 => bool) public procedureIds;
    mapping(bytes32 => Key) public keys;
    mapping(address => bool) public keyAddresses;
    mapping(bytes32 => bytes32) public operations;
    uint256 private entered;
    event RightAccepted(bytes32 indexed applicationId, bytes32 indexed allocationId, bytes32 indexed digest, bytes32 nonce, uint64 acceptedAt);
    event RightSettled(bytes32 indexed applicationId, bytes32 indexed allocationId, address indexed recipient, uint256 amountAtoms, uint64 settledAt);
    event OperationApplied(bytes32 indexed operationId, bytes32 digest, address indexed actor);
    event AppChanged(bytes32 indexed applicationId, State state, uint64 version, uint64 epoch);
    event Funded(bytes32 indexed operationId, uint256 amount);
    event KeyRegistered(bytes32 indexed keyId, address signer);
    event KeyRevoked(bytes32 indexed keyId);
    event TargetReplaced(bytes32 indexed applicationId, bytes32 indexed operationId, bytes32 indexed allocationId, ReplacementTarget previous, ReplacementTarget current, uint64 firstStartedAt, Change mode);

    modifier only(address actor) { require(msg.sender == actor, "ROLE"); _; }
    modifier unlocked() { require(entered == 0, "REENTRANCY"); entered = 1; _; entered = 0; }
    modifier active() { require(!newOperationsPaused, "PAUSED"); _; }
    modifier once(bytes32 op) {
        require(op != bytes32(0), "OPERATION_ID");
        bytes32 digest = keccak256(abi.encode(msg.sender, msg.data));
        if (operations[op] != bytes32(0)) { require(operations[op] == digest, "OPERATION_CONFLICT"); }
        else { operations[op] = digest; _; emit OperationApplied(op, digest, msg.sender); }
    }
    constructor(address asset, bytes32 instance, bytes32 policy, bytes32 mappingHash, Roles memory r) {
        require(asset.codehash == keccak256(type(ClearTestToken).runtimeCode), "TOKEN_CODE");
        require(instance != bytes32(0) && policy == P0_POLICY && mappingHash != bytes32(0), "CONFIG");
        address[6] memory actors = [r.registrar,r.initialSigner,r.keyAdmin,r.relayer,r.depositor,r.terminator];
        for(uint256 i; i<actors.length; ++i) {
            require(actors[i] != address(0) && actors[i] != asset && actors[i] != address(this), "ROLE_ADDRESS");
            for(uint256 j; j<i; ++j) require(actors[j] != actors[i], "ROLE_SEPARATION");
        }
        token = ClearTestToken(asset); instanceId = instance; policyHash = policy; runtimeMappingHash = mappingHash; roles = r;
    }
    function application(bytes32 appId) external view returns(Application memory) { return apps[appId]; }
    function acceptedRight(bytes32 appId) external view returns(AcceptedRight memory) { return rights[appId]; }
    function applicationIds() external view returns(bytes32[] memory) { return appIds; }
    function accounting() external view returns(uint256 B,uint256 R,uint256 O,uint256 A,uint256 U,uint256 S,uint256 surplus) {
        _invariants(); B=balance; R=reserved; O=obligations; A=B-R; U=O-R; S=U>A?U-A:0; surplus=token.balanceOf(address(this))-B;
    }
    function fund(bytes32 op,uint256 amount) external only(roles.depositor) unlocked once(op) {
        require(amount>0,"AMOUNT"); uint256 beforeVault=token.balanceOf(address(this)); uint256 beforeSender=token.balanceOf(msg.sender);
        require(token.transferFrom(msg.sender,address(this),amount),"TOKEN_TRANSFER");
        require(token.balanceOf(address(this))==beforeVault+amount && token.balanceOf(msg.sender)+amount==beforeSender,"EXACT_TRANSFER");
        balance+=amount; _invariants(); emit Funded(op,amount);
    }
    function registerKey(bytes32 op,bytes32 keyId,address signer) external only(roles.keyAdmin) unlocked once(op) {
        require(keyId!=bytes32(0) && keys[keyId].signer==address(0) && !keyAddresses[signer],"KEY_ID");
        require(signer!=address(0) && signer!=address(token) && signer!=address(this) && signer!=roles.registrar && signer!=roles.keyAdmin && signer!=roles.relayer && signer!=roles.depositor && signer!=roles.terminator,"KEY_ROLE");
        keyAddresses[signer]=true;keys[keyId]=Key(signer,false); emit KeyRegistered(keyId,signer);
    }
    function revokeKey(bytes32 op,bytes32 keyId) external only(roles.keyAdmin) unlocked once(op) {
        require(keys[keyId].signer!=address(0),"KEY_UNKNOWN"); keys[keyId].revoked=true; emit KeyRevoked(keyId);
    }
    function setPause(bytes32 op,bool paused) external only(roles.keyAdmin) unlocked once(op) { newOperationsPaused=paused; }
    function registrationDomainSeparator() public view returns(bytes32) {
        return keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)"),keccak256("ClearBootcampRecipientRegistration"),keccak256("1"),block.chainid,address(this),instanceId));
    }
    function participantApplicationId(address participant,bytes32 applicationSalt) public view returns(bytes32) {
        return keccak256(abi.encode(keccak256("CLEAR_PARTICIPANT_APPLICATION_V2"),registrationDomainSeparator(),policyHash,runtimeMappingHash,participant,applicationSalt));
    }
    function hashRegistration(RecipientRegistration calldata r) public view returns(bytes32) {
        return keccak256(abi.encodePacked(hex"1901",registrationDomainSeparator(),keccak256(abi.encode(REGISTRATION_TYPE_HASH,r))));
    }
    function registerCurrentMet(bytes32 op,bytes32 appId,address recipient,Target calldata t,RecipientRegistration calldata r,bytes calldata signature)
        external only(roles.registrar) unlocked active once(op)
    {
        require(appId!=bytes32(0) && apps[appId].state==State.NONE && appIds.length<MAX_APPLICATIONS,"APPLICATION");
        require(recipient!=address(0) && recipient!=address(this) && recipient!=address(token),"RECIPIENT");
        require(r.applicationSalt!=bytes32(0) && r.applicationId==appId && r.participant==recipient && r.recipient==recipient,"REGISTRATION_OWNER");
        require(r.policyHash==policyHash && r.runtimeMappingHash==runtimeMappingHash,"REGISTRATION_POLICY");
        require(appId==participantApplicationId(r.participant,r.applicationSalt),"REGISTRATION_APPLICATION");
        require(block.timestamp<r.deadline && r.deadline<=t.sourceValidUntilExclusive,"REGISTRATION_TIME");
        require(r.nonce!=bytes32(0) && !usedRegistrationNonces[r.participant][r.nonce],"REGISTRATION_NONCE");
        bytes32 digest=hashRegistration(r);
        require(StrictECDSA.recover(digest,signature)==r.participant,"REGISTRATION_SIGNER");
        require(t.acceptanceSequence==0,"REGISTRATION_SEQUENCE");
        _newTarget(t); usedRegistrationNonces[r.participant][r.nonce]=true;
        Application storage a=apps[appId]; a.recipient=recipient; a.state=State.QUEUED; a.target=t;
        a.target.acceptanceSequence=++lastAcceptanceSequence;
        a.version=1; a.epoch=1; a.currentMet=true; a.targetRecordedAt=_now(); a.observedAt=_now(); a.observationReceiptHash=t.sourceReceiptHash;
        appIds.push(appId); obligations+=AMOUNT; _invariants(); _emit(appId,a);
        emit RecipientRegistered(appId,r.participant,digest,a.target.acceptanceSequence);
    }
    function nextAllocatable() public view returns(bytes32 next) {
        uint64 seq=type(uint64).max;
        for(uint256 i; i<appIds.length; ++i) { Application storage a=apps[appIds[i]];
            if(a.state==State.QUEUED && _current(a) && (next==bytes32(0)||a.target.acceptanceSequence<seq)) { next=appIds[i];seq=a.target.acceptanceSequence; }
        }
    }
    function allocate(bytes32 op,bytes32 appId,bytes32 allocationId,uint64 expectedVersion) external only(roles.registrar) unlocked active once(op) {
        Application storage a=_mutable(appId,expectedVersion); require(a.state==State.QUEUED,"ALLOCATION_STATE");
        require(nextAllocatable()==appId && _current(a),"QUEUE_ORDER_OR_SOURCE");
        require(allocationId!=bytes32(0)&&!allocationIds[allocationId],"ALLOCATION_ID");
        require(balance-reserved>=AMOUNT,"SHORTFALL"); allocationIds[allocationId]=true; a.allocationId=allocationId;
        a.allocatedAt=_now(); a.state=State.RESERVED; reserved+=AMOUNT; ++a.version; _invariants(); _emit(appId,a);
    }
    function startReview(bytes32 op,bytes32 appId,bytes32 procedureId,uint64 publishedAt,uint64 expectedVersion) external only(roles.registrar) unlocked active once(op) {
        Application storage a=_mutable(appId,expectedVersion); require(a.state==State.RESERVED && _current(a),"REVIEW_STATE");
        require(publishedAt>0 && publishedAt>=a.allocatedAt && publishedAt>=a.targetRecordedAt && publishedAt<=block.timestamp,"PUBLICATION");
        if(a.firstStartedAt==0) { require(procedureId!=bytes32(0)&&!procedureIds[procedureId],"PROCEDURE_ID"); procedureIds[procedureId]=true;a.procedureId=procedureId;a.firstStartedAt=publishedAt; }
        else require(procedureId==a.procedureId,"PROCEDURE_FIXED");
        require(block.timestamp<uint256(a.firstStartedAt)+600 && uint256(a.firstStartedAt)+600<=type(uint64).max,"REVIEW_CAP");
        a.publishedAt=publishedAt; a.state=State.REVIEW; _invalidate(a); _emit(appId,a);
    }
    function observeCurrent(bytes32 op,bytes32 appId,Observation calldata o,uint64 expectedVersion) external only(roles.registrar) unlocked once(op) {
        Application storage a=_mutable(appId,expectedVersion);
        require(o.receiptHash!=bytes32(0) && o.observedAt>=a.observedAt && o.observedAt<=block.timestamp,"OBSERVATION");
        require(o.sourceValidUntilExclusive>0 && o.sourceValidUntilExclusive<=a.target.sourceValidUntilExclusive,"SOURCE_EXTENSION");
        a.currentMet=o.currentMet; a.validObjection=o.validObjection; a.unassessedObjection=o.unassessedObjection;
        if(o.newValidError) { a.newValidError=true; if(a.revalidationCount==1) a.terminalError=true; }
        a.consentSetHash=bytes32(0);a.mutualConsent=false;
        a.target.sourceValidUntilExclusive=o.sourceValidUntilExclusive; a.observationReceiptHash=o.receiptHash;a.observedAt=o.observedAt;
        _invalidate(a); _emit(appId,a); // Do not release R/O for an observation or stale flag.
    }
    function replaceTarget(bytes32 op,bytes32 appId,Target calldata t,Change mode,uint64 expectedVersion) external only(roles.registrar) unlocked active once(op) {
        Application storage a=_mutable(appId,expectedVersion); require(!a.terminalError,"TERMINAL_ERROR");require(!a.unassessedObjection,"OBJECTION_UNASSESSED");ReplacementTarget memory previous=_replacementTarget(a);
        require(a.firstStartedAt==0 || block.timestamp<uint256(a.firstStartedAt)+600,"REVIEW_CAP");
        require(t.revision>a.target.revision && t.decisionHash!=a.target.decisionHash,"NEW_DECISION");
        if(a.newValidError || a.validObjection) require(mode==Change.REVALIDATION,"REVALIDATION_REQUIRED");
        if(mode==Change.REVALIDATION) { require(a.revalidationCount==0,"REVALIDATION_LIMIT"); ++a.revalidationCount; }
        require(t.acceptanceSequence==a.target.acceptanceSequence,"REGISTRATION_SEQUENCE_FIXED");
        _newTarget(t); a.target=t; a.targetRecordedAt=_now();a.observedAt=_now();a.observationReceiptHash=t.sourceReceiptHash;
        a.currentMet=true;a.validObjection=false;a.unassessedObjection=false;a.newValidError=false;
        a.consentSetHash=bytes32(0);a.mutualConsent=false;a.publishedAt=0;
        if(a.state==State.REVIEW) a.state=State.RESERVED;
        _invalidate(a); _invariants(); _emit(appId,a);
        emit TargetReplaced(appId,op,a.allocationId,previous,_replacementTarget(a),a.firstStartedAt,mode);
    }
    function bindConsents(bytes32 op,bytes32 appId,bytes32 consentSetHash,bool mutualConsent,uint64 expectedVersion) external only(roles.registrar) unlocked active once(op) {
        Application storage a=_mutable(appId,expectedVersion);require(a.state==State.REVIEW && _current(a),"CONSENT_STATE");
        require(consentSetHash!=bytes32(0) && block.timestamp<uint256(a.firstStartedAt)+600,"CONSENT_WINDOW");
        a.consentSetHash=consentSetHash;a.mutualConsent=mutualConsent;_invalidate(a);_emit(appId,a);
    }
    function prepareUnsigned(bytes32 op,Authorization calldata m,uint64 expectedVersion) external only(roles.registrar) unlocked active once(op) {
        Application storage a=_mutable(m.applicationId,expectedVersion);_checkUnsigned(a,m);
        require(a.preparedDigest==bytes32(0),"PREPARATION_EXISTS");
        a.preparedDigest=hashAuthorization(m);a.preparedNonce=m.nonce;a.deadlinePolicyHash=m.deadlinePolicyHash;++a.version;_emit(m.applicationId,a);
    }
    /// Current unsigned match only; no signature, nonce consumption, or right creation.
    function checkPrepared(Authorization calldata m) external view returns(bytes32 digest,bool canPay) {
        Application storage a=apps[m.applicationId];require(!newOperationsPaused,"PAUSED");_checkUnsigned(a,m);
        digest=hashAuthorization(m);require(a.preparedDigest!=bytes32(0)&&digest==a.preparedDigest,"PREPARED_TARGET");return(digest,false);
    }
    /// First acceptance only: exact prepared digest plus all current predicates and role/CAS.
    /// The chain transaction, not the off-chain signer, consumes the nonce and creates the right.
    function accept(bytes32 op,Authorization calldata m,bytes calldata signature,uint64 expectedVersion)
        external only(roles.relayer) unlocked active once(op)
    {
        Application storage a=_mutable(m.applicationId,expectedVersion);
        _checkUnsigned(a,m);
        bytes32 digest=hashAuthorization(m);
        require(a.preparedDigest!=bytes32(0) && a.preparedDigest==digest && a.preparedNonce==m.nonce && a.deadlinePolicyHash==m.deadlinePolicyHash,"PREPARED_TARGET");
        require(StrictECDSA.recover(digest,signature)==keys[m.signerKeyId].signer,"AUTHORIZATION_SIGNER");
        usedNonces[m.nonce]=true;
        rights[m.applicationId]=AcceptedRight(a.recipient,address(token),AMOUNT,a.allocationId,digest,m.nonce,m.signerKeyId,a.epoch,_now(),0);
        a.state=State.ACCEPTED;
        ++a.version;
        a.preparedDigest=bytes32(0);a.preparedNonce=bytes32(0);a.deadlinePolicyHash=bytes32(0);
        _invariants();_emit(m.applicationId,a);
        emit RightAccepted(m.applicationId,a.allocationId,digest,m.nonce,rights[m.applicationId].acceptedAt);
    }
    /// Anyone can settle this stored fixed right. No current source, signer, epoch,
    /// pause, signature, or first-accept expiry is consulted after ACCEPTED.
    function claim(bytes32 appId) external unlocked {
        Application storage a=apps[appId];
        require(a.state==State.ACCEPTED,"ACCEPTED_RIGHT_REQUIRED");
        AcceptedRight storage right=rights[appId];
        require(right.amountAtoms==AMOUNT && right.token==address(token) && right.allocationId==a.allocationId && right.recipient==a.recipient,"STORED_RIGHT");
        _invariants();
        uint256 beforeVault=token.balanceOf(address(this));
        uint256 beforeRecipient=token.balanceOf(right.recipient);
        a.state=State.SETTLED;++a.version;right.settledAt=_now();
        balance-=AMOUNT;reserved-=AMOUNT;obligations-=AMOUNT;
        require(token.transfer(right.recipient,AMOUNT),"TOKEN_TRANSFER");
        require(token.balanceOf(address(this))+AMOUNT==beforeVault && token.balanceOf(right.recipient)==beforeRecipient+AMOUNT,"EXACT_TRANSFER");
        _invariants();_emit(appId,a);
        emit RightSettled(appId,right.allocationId,right.recipient,AMOUNT,right.settledAt);
    }
    function terminate(bytes32 op,bytes32 appId,Termination reason,bytes32 receiptHash,uint64 expectedVersion) external only(roles.terminator) unlocked once(op) {
        Application storage a=_mutable(appId,expectedVersion);require(receiptHash!=bytes32(0),"TERMINATION_RECEIPT");
        bool cap=a.firstStartedAt!=0 && block.timestamp>=uint256(a.firstStartedAt)+600;
        require((reason==Termination.CAP_UNRESOLVED&&cap) ||
            (reason==Termination.NEW_VALID_ERROR_AFTER_REVALIDATION&&a.revalidationCount==1&&a.terminalError) ||
            (reason==Termination.SOURCE_UNREFRESHED_WITHIN_CAP&&cap&&block.timestamp>=a.target.sourceValidUntilExclusive),"TERMINATION_CONDITION");
        if(a.allocationId!=bytes32(0))reserved-=AMOUNT;obligations-=AMOUNT;
        a.state=State.TERMINATED;a.terminationReason=reason;a.terminationReceiptHash=receiptHash;_invalidate(a);_invariants();_emit(appId,a);
    }
    function domainSeparator() public view returns(bytes32) {
        return keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)"),keccak256("ClearBootcampTestPayment"),keccak256("3"),block.chainid,address(this),instanceId));
    }
    function hashAuthorization(Authorization calldata m) public view returns(bytes32) { return keccak256(abi.encodePacked(hex"1901",domainSeparator(),keccak256(abi.encode(TYPE_HASH,m)))); }
    function _checkUnsigned(Application storage a,Authorization calldata m) private view {
        require(a.state==State.REVIEW && a.allocationId!=bytes32(0) && _current(a),"CURRENT_REVIEW");
        require(m.policyHash==policyHash && m.runtimeMappingHash==runtimeMappingHash && m.operationsPolicyHash==PROFILE,"POLICY_TARGET");
        require(m.recipient==a.recipient && m.token==address(token) && m.amountAtoms==AMOUNT && m.allocationId==a.allocationId,"FIXED_RIGHT");
        require(m.decisionId==a.target.decisionId && m.decisionRevision==a.target.revision && m.decisionHash==a.target.decisionHash,"DECISION_TARGET");
        require(m.procedureId==a.procedureId && m.firstReviewStartedAt==a.firstStartedAt && m.decisionPublishedAt==a.publishedAt && m.sourceValidUntilExclusive==a.target.sourceValidUntilExclusive && m.revalidationCount==a.revalidationCount,"PROCEDURE_TARGET");
        require(m.authorizationEpoch==a.epoch && m.consentSetHash!=bytes32(0) && m.consentSetHash==a.consentSetHash && m.deadlinePolicyHash!=bytes32(0) && m.nonce!=bytes32(0),"AUTHORIZATION_TARGET");
        require(!usedNonces[m.nonce],"NONCE_USED");
        require(keys[m.signerKeyId].signer!=address(0) && !keys[m.signerKeyId].revoked,"SIGNER_KEY");
        require(m.issuedAt>=a.publishedAt && m.issuedAt>=a.observedAt && m.issuedAt<=block.timestamp && block.timestamp<m.expiresAt,"AUTHORIZATION_TIME");
        uint256 cap=uint256(a.firstStartedAt)+600;
        require(m.expiresAt<=cap && m.expiresAt<=a.target.sourceValidUntilExclusive && block.timestamp<cap && block.timestamp<a.target.sourceValidUntilExclusive,"ACCEPT_WINDOW");
        if(m.eligibilityRoute==1)require(a.mutualConsent,"MUTUAL_CONSENT");
        else { require(m.eligibilityRoute==2,"ROUTE");require(uint256(a.publishedAt)+120<=m.issuedAt && uint256(a.publishedAt)+120<cap,"FULL_CONFIRMATION_WINDOW"); }
        _invariants();
    }
    function _newTarget(Target calldata t) private view {
        require(t.decisionId!=bytes32(0)&&t.revision>0&&t.decisionHash!=bytes32(0)&&t.sourceReceiptHash!=bytes32(0),"TARGET");
        require(t.sourceValidUntilExclusive>block.timestamp,"TARGET_TIME_SEQUENCE");
    }
    function _mutable(bytes32 appId,uint64 expectedVersion) private view returns(Application storage a) {
        a=apps[appId];require(a.state==State.QUEUED||a.state==State.RESERVED||a.state==State.REVIEW,"UNACCEPTED_STATE");require(a.version==expectedVersion,"APP_CAS");
    }
    function _current(Application storage a) private view returns(bool) { return a.currentMet && !a.validObjection && !a.unassessedObjection && !a.newValidError && !a.terminalError && block.timestamp<a.target.sourceValidUntilExclusive; }
    function _invalidate(Application storage a) private { ++a.epoch;++a.version;a.preparedDigest=bytes32(0);a.preparedNonce=bytes32(0);a.deadlinePolicyHash=bytes32(0); }
    function _invariants() private view { require(balance>=reserved && obligations>=reserved && token.balanceOf(address(this))>=balance,"ACCOUNTING"); }
    function _emit(bytes32 appId,Application storage a) private { emit AppChanged(appId,a.state,a.version,a.epoch); }
    function _replacementTarget(Application storage a) private view returns(ReplacementTarget memory) {
        return ReplacementTarget(a.target.decisionId,a.target.revision,a.target.decisionHash,a.target.acceptanceSequence,a.epoch,a.version,a.target.sourceReceiptHash);
    }
    function _now() private view returns(uint64) { require(block.timestamp>0 && block.timestamp<=type(uint64).max,"TIME_OVERFLOW");return uint64(block.timestamp); }
}
