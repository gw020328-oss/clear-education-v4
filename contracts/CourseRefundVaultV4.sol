// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;
import "./ClearTestToken.sol";

// Non-upgradeable, synthetic-test-only vault. No issuer/sponsor/config setters.
contract CourseRefundVaultV4 {
    struct RuntimeConfig {
        uint256 configVersion; bytes32 instanceId; bytes32 cohortId; bytes32 policyHash;
        address token; address sponsor; address issuer; address outageSigner; uint256 amount;
        uint256 enrollmentStart; uint256 enrollmentUntil; uint256 normalSubmitFrom;
        uint256 normalSubmitAt; uint256 supplementEndAt; uint256 claimUntil;
    }
    struct Terms {
        bytes32 applicationId; address learner; bytes32 policyHash; bytes32 runtimeConfigHash;
        bytes32 nonce; uint256 signedAt; uint256 expiresAt;
    }
    struct Grant {
        bytes32 grantId; bytes32 applicationId; address learner; bytes32 policyHash;
        bytes32 runtimeConfigHash; bytes32 examNullifier; uint256 amount;
        uint256 verifiedAt; uint256 issueBy; uint256 claimUntil;
    }
    struct Enrollment { address learner; bytes32 consentDigest; bytes32 grantDigest; bool settled; }
    RuntimeConfig private config;
    bytes32 public runtimeConfigHash;
    mapping(bytes32 => Enrollment) public enrollments;
    mapping(bytes32 => bool) public usedConsentNonces;
    mapping(bytes32 => bytes32) public nullifierApplication;
    mapping(bytes32 => bytes32) public grantApplication;
    uint256 public totalReserved;
    bool public supplementEnabled;
    bool private entered;
    bytes32 private constant DOMAIN_TYPE = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");
    bytes32 private constant TERMS_TYPE = keccak256("TermsAcceptanceV4(bytes32 applicationId,address learner,bytes32 policyHash,bytes32 runtimeConfigHash,bytes32 nonce,uint256 signedAt,uint256 expiresAt)");
    bytes32 private constant GRANT_TYPE = keccak256("EligibilityGrantV4(bytes32 grantId,bytes32 applicationId,address learner,bytes32 policyHash,bytes32 runtimeConfigHash,bytes32 examNullifier,uint256 amount,uint256 verifiedAt,uint256 issueBy,uint256 claimUntil)");
    bytes32 private constant OUTAGE_TYPE = keccak256("SupplementV4(bytes32 runtimeConfigHash,uint256 observedAt)");
    event Enrolled(bytes32 indexed applicationId, address indexed learner, bytes32 consentDigest, uint256 amount);
    event GrantAuthorized(bytes32 indexed applicationId, bytes32 indexed grantId, bytes32 examNullifier);
    event Paid(bytes32 indexed applicationId, address indexed learner, uint256 amount);
    event Reclaimed(bytes32 indexed applicationId, uint256 amount);
    event SupplementEnabled(uint256 observedAt);
    modifier nonReentrant() { require(!entered, "REENTRANCY"); entered = true; _; entered = false; }
    constructor(RuntimeConfig memory c) {
        require(c.configVersion == 4 && c.instanceId != 0 && c.cohortId != 0 && c.policyHash != 0, "CONFIG");
        require(c.sponsor != address(0) && c.issuer != address(0) && c.outageSigner != address(0) && c.amount > 0, "CONFIG");
        require(c.token.codehash == keccak256(type(ClearTestToken).runtimeCode), "TEST_TOKEN_ONLY");
        require(c.enrollmentStart <= c.enrollmentUntil && c.enrollmentUntil <= c.normalSubmitAt
            && c.normalSubmitFrom <= c.normalSubmitAt, "PERIOD");
        require(c.supplementEndAt == c.normalSubmitAt + 3 days && c.claimUntil == c.normalSubmitAt + 10 days, "DEADLINES");
        config = c; runtimeConfigHash = keccak256(abi.encode(c));
    }
    function runtimeConfig() external view returns (RuntimeConfig memory) { return config; }
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPE, keccak256("ClearRefund"), keccak256("4"), block.chainid, address(this), config.instanceId));
    }
    function _digest(bytes32 structHash) private view returns (bytes32) { return keccak256(abi.encodePacked(hex"1901", domainSeparator(), structHash)); }
    function termsDigest(Terms calldata t) public view returns (bytes32) { return _digest(keccak256(abi.encode(TERMS_TYPE, t))); }
    function grantDigest(Grant calldata g) public view returns (bytes32) { return _digest(keccak256(abi.encode(GRANT_TYPE, g))); }
    function _signer(bytes32 d, bytes calldata sig) private pure returns (address signer) {
        require(sig.length == 65, "SIGNATURE"); bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(sig.offset) s := calldataload(add(sig.offset, 32)) v := byte(0, calldataload(add(sig.offset, 64))) }
        require(uint256(s) <= 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0 && (v == 27 || v == 28), "SIGNATURE");
        signer = ecrecover(d, v, r, s); require(signer != address(0), "SIGNATURE");
    }
    function enrollAndFund(Terms calldata t, bytes calldata sig) external nonReentrant {
        require(msg.sender == config.sponsor, "SPONSOR");
        require(block.timestamp >= config.enrollmentStart && block.timestamp <= config.enrollmentUntil, "ENROLLMENT_TIME");
        require(t.applicationId != 0 && t.learner != address(0) && enrollments[t.applicationId].learner == address(0), "APPLICATION");
        require(t.policyHash == config.policyHash && t.runtimeConfigHash == runtimeConfigHash, "TERMS_CONFIG");
        require(t.nonce != 0 && !usedConsentNonces[t.nonce] && t.signedAt <= block.timestamp
            && block.timestamp < t.expiresAt && t.expiresAt <= config.enrollmentUntil + 1, "TERMS_TIME_NONCE");
        bytes32 d = termsDigest(t); require(_signer(d, sig) == t.learner, "LEARNER_SIGNATURE");
        usedConsentNonces[t.nonce] = true;
        enrollments[t.applicationId] = Enrollment(t.learner, d, 0, false);
        totalReserved += config.amount;
        ClearTestToken token = ClearTestToken(config.token); uint256 beforeBalance = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), config.amount), "TRANSFER");
        require(token.balanceOf(address(this)) == beforeBalance + config.amount, "EXACT_TRANSFER");
        emit Enrolled(t.applicationId, t.learner, d, config.amount);
    }
    function enableSupplement(uint256 observedAt, bytes calldata sig) external {
        require(observedAt >= config.normalSubmitFrom && observedAt <= config.normalSubmitAt
            && observedAt <= block.timestamp && block.timestamp <= config.supplementEndAt, "OUTAGE_TIME");
        require(_signer(_digest(keccak256(abi.encode(OUTAGE_TYPE, runtimeConfigHash, observedAt))), sig) == config.outageSigner, "OUTAGE_SIGNATURE");
        if (!supplementEnabled) { supplementEnabled = true; emit SupplementEnabled(observedAt); }
    }
    function authorizeGrant(Grant calldata g, bytes calldata sig) external {
        Enrollment storage e = enrollments[g.applicationId]; bytes32 d = grantDigest(g);
        require(_signer(d, sig) == config.issuer, "ISSUER_SIGNATURE");
        if (e.grantDigest != 0) { require(e.grantDigest == d, "GRANT_CONFLICT"); return; }
        require(e.learner != address(0) && !e.settled && e.learner == g.learner, "ENROLLMENT");
        require(g.policyHash == config.policyHash && g.runtimeConfigHash == runtimeConfigHash
            && g.amount == config.amount && g.claimUntil == config.claimUntil, "GRANT_CONFIG");
        require(g.verifiedAt >= config.normalSubmitFrom && g.verifiedAt <= block.timestamp && block.timestamp <= g.issueBy
            && g.issueBy <= (supplementEnabled ? config.supplementEndAt : config.normalSubmitAt), "ISSUE_TIME");
        require(g.grantId != 0 && g.examNullifier != 0 && grantApplication[g.grantId] == 0
            && nullifierApplication[g.examNullifier] == 0, "GRANT_REUSE");
        e.grantDigest = d; grantApplication[g.grantId] = g.applicationId; nullifierApplication[g.examNullifier] = g.applicationId;
        emit GrantAuthorized(g.applicationId, g.grantId, g.examNullifier);
    }
    function claim(bytes32 applicationId) external nonReentrant {
        Enrollment storage e = enrollments[applicationId];
        require(e.learner != address(0) && e.grantDigest != 0 && !e.settled, "CLAIM_STATE");
        require(block.timestamp <= config.claimUntil, "CLAIM_TIME");
        e.settled = true; totalReserved -= config.amount; _pay(e.learner);
        emit Paid(applicationId, e.learner, config.amount);
    }
    function reclaimExpired(bytes32 applicationId) external nonReentrant {
        require(msg.sender == config.sponsor && block.timestamp > config.claimUntil, "RECLAIM_TIME_ROLE");
        Enrollment storage e = enrollments[applicationId]; require(e.learner != address(0) && !e.settled, "RECLAIM_STATE");
        e.settled = true; totalReserved -= config.amount; _pay(config.sponsor); emit Reclaimed(applicationId, config.amount);
    }
    function _pay(address recipient) private {
        ClearTestToken token = ClearTestToken(config.token);
        uint256 beforeVault = token.balanceOf(address(this)); uint256 beforeRecipient = token.balanceOf(recipient);
        require(token.transfer(recipient, config.amount), "TRANSFER");
        require(token.balanceOf(address(this)) == beforeVault - config.amount
            && token.balanceOf(recipient) == beforeRecipient + config.amount, "EXACT_TRANSFER");
    }
}
