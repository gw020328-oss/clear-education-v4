// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;
import "./ClearTestToken.sol";

// ISOLATED SYNTHETIC TEST ONLY. Constructor fixtures are trusted assertions,
// not evidence verification. No PG assets, upgrades, issuer or product outbox.
contract FundingLab {
    struct Config {
        bytes32 instanceId; bytes32 assumptionsHash; address token; address sponsor; address refundRecipient;
        uint256 allocationUntil; uint256 claimUntil; uint256 minClaimWindow;
    }
    struct Fixture {
        bytes32 applicationId; address learner; address recipient; bytes32 policyHash;
        bytes32 decisionCommitment; uint256 entitlement; uint256 tier; bool syntheticEligible;
    }
    enum Settlement { NONE, ALLOCATED, PAID, RECLAIMED }
    struct Account {
        bool registered; bool cancelled; Settlement settlement;
        uint256 fundedTotal; uint256 held; uint256 allocated; uint256 paid; uint256 recovered;
    }
    Config private config;
    bytes32 public configHash;
    mapping(bytes32 => Fixture) private fixtures;
    mapping(bytes32 => Account) public accounts;
    mapping(bytes32 => bytes32) public operations;
    uint256 public totalHeld;
    uint256 public totalReserved;
    bool private entered;
    event Registered(bytes32 indexed applicationId, bytes32 agreementHash);
    event ToppedUp(bytes32 indexed applicationId, bytes32 indexed operationId, uint256 amount);
    event Allocated(bytes32 indexed applicationId, uint256 amount);
    event Paid(bytes32 indexed applicationId, address recipient, uint256 amount);
    event Cancelled(bytes32 indexed applicationId);
    event Recovered(bytes32 indexed applicationId, uint256 amount, bool wasReserved);
    modifier guarded() { require(!entered, "REENTRANCY"); entered = true; _; entered = false; }
    modifier sponsorOnly() { require(msg.sender == config.sponsor, "SPONSOR"); _; }
    constructor(Config memory c, Fixture[] memory input) {
        require(block.chainid == 31338, "TEST_CHAIN_ONLY");
        require(c.token.codehash == keccak256(type(ClearTestToken).runtimeCode), "TEST_TOKEN_ONLY");
        require(c.instanceId != 0 && c.assumptionsHash != 0 && c.sponsor != address(0)
            && c.refundRecipient != address(0) && c.refundRecipient != address(this) && c.refundRecipient != c.token, "CONFIG");
        require(c.minClaimWindow > 0 && c.allocationUntil >= block.timestamp
            && c.claimUntil >= c.allocationUntil + c.minClaimWindow, "DEADLINES");
        require(input.length > 0 && input.length <= 32, "FIXTURE_LIMIT");
        config = c;
        configHash = keccak256(abi.encode("CLEAR-TEST-FUNDING.1", block.chainid, address(this), c));
        for (uint256 i; i < input.length; ++i) {
            Fixture memory f = input[i];
            require(f.applicationId != 0 && fixtures[f.applicationId].learner == address(0), "APPLICATION");
            require(f.learner != address(0) && f.recipient != address(0) && f.recipient != address(this)
                && f.recipient != c.token && f.policyHash != 0 && f.decisionCommitment != 0 && f.entitlement > 0, "FIXTURE");
            require(f.tier == 50 || f.tier == 100 || f.tier == 200 || f.tier == 300, "TIER_TEST_ONLY");
            fixtures[f.applicationId] = f;
        }
    }
    function runtimeConfig() external view returns (Config memory) { return config; }
    function fixture(bytes32 app) public view returns (Fixture memory f) {
        f = fixtures[app]; require(f.learner != address(0), "APPLICATION");
    }
    function agreementHash(bytes32 app) public view returns (bytes32) {
        return keccak256(abi.encode(configHash, fixture(app)));
    }
    function operationHash(bytes32 app, uint256 amount) public view returns (bytes32) {
        return keccak256(abi.encode(configHash, app, amount));
    }
    function register(bytes32 app, bytes32 expectedAgreement) external guarded {
        Fixture memory f = fixture(app);
        require(msg.sender == f.learner && expectedAgreement == agreementHash(app), "CONSENT");
        Account storage a = accounts[app]; if (a.registered) return;
        require(block.timestamp <= config.allocationUntil, "ALLOCATION_TIME");
        a.registered = true; emit Registered(app, expectedAgreement);
    }
    function topUp(bytes32 app, bytes32 operationId, uint256 amount) external guarded sponsorOnly {
        fixture(app); require(operationId != 0 && amount > 0, "TOPUP_INPUT");
        bytes32 h = operationHash(app, amount);
        if (operations[operationId] != 0) { require(operations[operationId] == h, "OPERATION_CONFLICT"); return; }
        Account storage a = accounts[app];
        require(a.registered && !a.cancelled && a.settlement == Settlement.NONE, "TOPUP_STATE");
        require(block.timestamp <= config.allocationUntil, "ALLOCATION_TIME");
        operations[operationId] = h; a.fundedTotal += amount; a.held += amount; totalHeld += amount;
        ClearTestToken token = ClearTestToken(config.token); uint256 beforeBalance = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), amount), "TRANSFER");
        require(token.balanceOf(address(this)) == beforeBalance + amount, "EXACT_TRANSFER");
        _solvent(); emit ToppedUp(app, operationId, amount);
    }
    function allocate(bytes32 app) external guarded {
        Fixture memory f = fixture(app); Account storage a = accounts[app];
        require(a.registered && !a.cancelled && f.syntheticEligible, "SYNTHETIC_ELIGIBILITY");
        if (a.settlement == Settlement.ALLOCATED) return;
        require(a.settlement == Settlement.NONE, "SETTLED");
        require(block.timestamp <= config.allocationUntil, "ALLOCATION_TIME");
        require(a.held >= f.entitlement, "INSUFFICIENT_APPLICATION_FUNDS");
        a.settlement = Settlement.ALLOCATED; a.allocated = f.entitlement; totalReserved += f.entitlement;
        _solvent(); emit Allocated(app, f.entitlement);
    }
    function claim(bytes32 app) external guarded {
        Fixture memory f = fixture(app); Account storage a = accounts[app];
        if (a.settlement == Settlement.PAID) return;
        require(a.settlement == Settlement.ALLOCATED, "CLAIM_STATE");
        require(block.timestamp <= config.claimUntil, "CLAIM_TIME");
        a.settlement = Settlement.PAID; a.paid = f.entitlement;
        a.held -= f.entitlement; totalHeld -= f.entitlement; totalReserved -= f.entitlement;
        _pay(f.recipient, f.entitlement); emit Paid(app, f.recipient, f.entitlement);
    }
    function cancel(bytes32 app) external guarded {
        require(msg.sender == fixture(app).learner, "LEARNER"); Account storage a = accounts[app];
        require(a.registered && a.settlement == Settlement.NONE, "CANCEL_STATE");
        if (!a.cancelled) { a.cancelled = true; emit Cancelled(app); }
    }
    function recoverUnallocated(bytes32 app) external guarded sponsorOnly {
        fixture(app); Account storage a = accounts[app];
        require(a.cancelled || block.timestamp > config.allocationUntil, "RECOVERY_TIME");
        uint256 reserved = a.settlement == Settlement.ALLOCATED ? a.allocated : 0;
        uint256 amount = a.held - reserved; require(amount > 0, "NO_UNALLOCATED");
        a.held -= amount; totalHeld -= amount; a.recovered += amount;
        _pay(config.refundRecipient, amount); emit Recovered(app, amount, false);
    }
    function reclaimExpired(bytes32 app) external guarded sponsorOnly {
        Fixture memory f = fixture(app); Account storage a = accounts[app];
        require(block.timestamp > config.claimUntil && a.settlement == Settlement.ALLOCATED, "RECLAIM_STATE_TIME");
        a.settlement = Settlement.RECLAIMED; a.recovered += f.entitlement;
        a.held -= f.entitlement; totalHeld -= f.entitlement; totalReserved -= f.entitlement;
        _pay(config.refundRecipient, f.entitlement); emit Recovered(app, f.entitlement, true);
    }
    function _solvent() private view {
        require(ClearTestToken(config.token).balanceOf(address(this)) >= totalHeld && totalHeld >= totalReserved, "INSOLVENT");
    }
    function _pay(address recipient, uint256 amount) private {
        ClearTestToken token = ClearTestToken(config.token);
        uint256 beforeVault = token.balanceOf(address(this)); uint256 beforeRecipient = token.balanceOf(recipient);
        require(token.transfer(recipient, amount), "TRANSFER");
        require(token.balanceOf(address(this)) == beforeVault - amount
            && token.balanceOf(recipient) == beforeRecipient + amount, "EXACT_TRANSFER");
        _solvent();
    }
}
