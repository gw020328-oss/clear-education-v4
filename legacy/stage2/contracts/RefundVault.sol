// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;
import "./TestToken.sol";

// Local prototype, NOT audited. No upgrade, pause, key rotation or early withdrawal.
contract RefundVault {
    struct Receipt { bytes32 termsHash; address learner; uint32 session; uint64 completedAt; }
    TestToken public immutable token;
    address public immutable sponsor;
    address public immutable verifier;
    bytes32 public immutable termsHash;
    uint256 public immutable start;
    uint256 public immutable due;
    uint256 public immutable claimUntil;
    uint256 public constant amount = 50_000_000;
    uint256 public totalReserved;
    mapping(address => bool) public enrolled;
    mapping(address => bool) public settled;
    mapping(address => uint64) public acceptedAt;
    mapping(address => bytes32) public consentDigest;
    bytes32 private constant RECEIPT_TYPEHASH = keccak256("Receipt(bytes32 termsHash,address learner,uint32 session,uint64 completedAt)");
    bytes32 private constant ACCEPT_TYPEHASH = keccak256("TermsAcceptance(bytes32 termsHash,address learner,uint64 acceptedAt)");
    uint256 private constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    event Enrolled(address indexed learner, bytes32 indexed termsHash, bytes32 consentDigest, uint64 acceptedAt, uint256 amount);
    event Paid(address indexed learner, address indexed submitter, uint256 amount);
    event Expired(address indexed learner, uint256 amount);

    constructor(TestToken t, address v, bytes32 h, uint256 s, uint256 d, uint256 c) {
        require(address(t).code.length > 0 && v != address(0) && h != bytes32(0), "configuration");
        require(s < d && d < c, "deadlines");
        token = t; verifier = v; sponsor = msg.sender; termsHash = h;
        start = s; due = d; claimUntil = c;
    }
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("RefundRights"), keccak256("2"), block.chainid, address(this)
        ));
    }
    function _typed(bytes32 h) private view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), h));
    }
    function acceptanceDigest(address learner, uint64 time) public view returns (bytes32) {
        return _typed(keccak256(abi.encode(ACCEPT_TYPEHASH, termsHash, learner, time)));
    }
    function digest(Receipt calldata r) public view returns (bytes32) {
        return _typed(keccak256(abi.encode(RECEIPT_TYPEHASH, r.termsHash, r.learner, r.session, r.completedAt)));
    }
    function enroll(address learner, uint64 time, bytes calldata consent) external {
        require(msg.sender == sponsor && learner != address(0) && !enrolled[learner], "registration");
        require(block.timestamp <= due && time > 0 && time <= block.timestamp, "consent time");
        bytes32 h = acceptanceDigest(learner, time);
        require(_recover(h, consent) == learner, "consent");
        uint256 beforeBalance = token.balanceOf(address(this));
        enrolled[learner] = true;
        acceptedAt[learner] = time;
        consentDigest[learner] = h;
        totalReserved += amount;
        require(token.transferFrom(sponsor, address(this), amount), "deposit");
        require(token.balanceOf(address(this)) == beforeBalance + amount, "full deposit");
        require(token.balanceOf(address(this)) >= totalReserved, "reserve");
        emit Enrolled(learner, termsHash, h, time, amount);
    }
    function claim(address learner, Receipt[] calldata receipts, bytes[] calldata signatures) external {
        require(enrolled[learner] && !settled[learner], "not claimable");
        require(block.timestamp <= claimUntil, "expired");
        require(receipts.length == 4 && signatures.length == 4, "count");
        uint256 seen;
        for (uint256 i; i < 4; ++i) {
            Receipt calldata r = receipts[i];
            require(r.termsHash == termsHash && r.learner == learner && r.session < 4, "scope");
            require(r.completedAt >= start && r.completedAt <= due && r.completedAt <= block.timestamp, "time");
            uint256 bit = 1 << r.session;
            require(seen & bit == 0, "duplicate"); seen |= bit;
            require(_recover(digest(r), signatures[i]) == verifier, "signature");
        }
        require(token.balanceOf(address(this)) >= totalReserved, "reserve");
        settled[learner] = true;
        totalReserved -= amount;
        require(token.transfer(learner, amount), "payment");
        emit Paid(learner, msg.sender, amount);
    }
    function reclaimExpired(address learner) external {
        require(block.timestamp > claimUntil && enrolled[learner] && !settled[learner], "not expired");
        settled[learner] = true;
        totalReserved -= amount;
        require(token.transfer(sponsor, amount), "return");
        emit Expired(learner, amount);
    }
    function _recover(bytes32 h, bytes calldata sig) private pure returns (address) {
        require(sig.length == 65, "signature length");
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(sig.offset) s := calldataload(add(sig.offset, 32)) v := byte(0, calldataload(add(sig.offset, 64))) }
        require(uint256(s) <= HALF_ORDER && (v == 27 || v == 28), "signature canonical");
        return ecrecover(h, v, r, s);
    }
}
