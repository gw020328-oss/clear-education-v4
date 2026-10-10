// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

interface IRefundTokenV3 {
    function balanceOf(address account) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

/// @notice Fixed 50 TEST / four-receipt demo, with runtime-bound participant consent.
/// @dev Does not prove natural-language meaning, reviewer authority or real completion.
contract RefundVault {
    uint256 public constant amount = 50_000_000;
    uint32 public constant requiredReceipts = 4;
    uint32 public constant configVersion = 3;
    bytes32 private constant CONFIG_TYPEHASH = keccak256("RuntimeConfig(uint32 version,address token,address sponsor,address verifier,uint256 amount,uint32 requiredReceipts,uint64 start,uint64 due,uint64 claimUntil)");
    bytes32 private constant ACCEPTANCE_TYPEHASH = keccak256("TermsAcceptance(bytes32 termsHash,bytes32 runtimeConfigHash,address learner,uint64 acceptedAt)");
    bytes32 private constant RECEIPT_TYPEHASH = keccak256("Receipt(bytes32 termsHash,address learner,uint32 session,uint64 completedAt)");
    bytes32 private constant NAME_HASH = keccak256("RefundRights");
    bytes32 private constant VERSION_HASH = keccak256("3");
    uint256 private constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;

    struct Receipt { bytes32 termsHash; address learner; uint32 session; uint64 completedAt; }
    IRefundTokenV3 public immutable token;
    address public immutable sponsor;
    address public immutable verifier;
    bytes32 public immutable termsHash;
    uint64 public immutable start;
    uint64 public immutable due;
    uint64 public immutable claimUntil;
    uint256 public totalReserved;
    mapping(address => bool) public enrolled;
    mapping(address => bool) public settled;
    mapping(address => uint64) public acceptedAt;
    mapping(address => bytes32) public consentDigest;

    event Enrolled(address indexed learner, uint64 acceptedAt, uint256 amount);
    event Paid(address indexed learner, address indexed submitter, uint256 amount);
    event Reclaimed(address indexed learner, uint256 amount);

    constructor(IRefundTokenV3 token_, address verifier_, bytes32 termsHash_, uint64 start_, uint64 due_, uint64 claimUntil_) {
        require(address(token_) != address(0) && verifier_ != address(0), "ZERO");
        require(start_ < due_ && due_ < claimUntil_, "TIME");
        token = token_; sponsor = msg.sender; verifier = verifier_; termsHash = termsHash_;
        start = start_; due = due_; claimUntil = claimUntil_;
    }

    /// @dev Calculated from actual immutable fields/constants, never supplied by caller.
    function runtimeConfigHash() public view returns (bytes32) {
        return keccak256(abi.encode(CONFIG_TYPEHASH, configVersion, address(token), sponsor, verifier, amount, requiredReceipts, start, due, claimUntil));
    }

    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"), NAME_HASH, VERSION_HASH, block.chainid, address(this)));
    }

    function enroll(address learner, uint64 time, bytes32 approvedConfigHash, bytes calldata consent) external {
        require(msg.sender == sponsor, "SPONSOR"); require(block.timestamp <= due, "REGISTRATION_CLOSED");
        require(learner != address(0) && !enrolled[learner], "ENROLLED");
        require(time > 0 && time <= block.timestamp && time <= due, "CONSENT_TIME");
        bytes32 actualConfigHash = runtimeConfigHash();
        require(approvedConfigHash == actualConfigHash, "CONFIG_MISMATCH");
        bytes32 digest = _typed(keccak256(abi.encode(ACCEPTANCE_TYPEHASH, termsHash, actualConfigHash, learner, time)));
        require(_recover(digest, consent) == learner, "CONSENT");
        uint256 beforeBalance = token.balanceOf(address(this));
        require(token.transferFrom(msg.sender, address(this), amount), "DEPOSIT_TRANSFER");
        uint256 afterBalance = token.balanceOf(address(this));
        require(afterBalance == beforeBalance + amount, "DEPOSIT_AMOUNT");
        enrolled[learner] = true; acceptedAt[learner] = time; consentDigest[learner] = digest;
        totalReserved += amount; require(afterBalance >= totalReserved, "UNDERFUNDED");
        emit Enrolled(learner, time, amount);
    }

    function claim(address learner, Receipt[] calldata receipts, bytes[] calldata signatures) external {
        require(block.timestamp <= claimUntil, "CLAIM_EXPIRED"); require(enrolled[learner] && !settled[learner], "NOT_CLAIMABLE");
        require(receipts.length == requiredReceipts && signatures.length == requiredReceipts, "COUNT");
        uint256 seen;
        for (uint256 i; i < requiredReceipts; i++) {
            Receipt calldata r = receipts[i];
            require(r.termsHash == termsHash && r.learner == learner && r.session < requiredReceipts, "SCOPE");
            require(r.completedAt >= start && r.completedAt <= due && r.completedAt <= block.timestamp, "RECEIPT_TIME");
            uint256 bit = 1 << r.session; require(seen & bit == 0, "DUPLICATE"); seen |= bit;
            require(_recover(_typed(keccak256(abi.encode(RECEIPT_TYPEHASH, r.termsHash, r.learner, r.session, r.completedAt))), signatures[i]) == verifier, "SIGNATURE");
        }
        require(token.balanceOf(address(this)) >= totalReserved, "UNDERFUNDED");
        settled[learner] = true; totalReserved -= amount;
        uint256 beforeBalance = token.balanceOf(learner);
        require(token.transfer(learner, amount), "PAYMENT_TRANSFER");
        require(token.balanceOf(learner) == beforeBalance + amount, "PAYMENT_AMOUNT");
        emit Paid(learner, msg.sender, amount);
    }

    function reclaimExpired(address learner) external {
        require(msg.sender == sponsor && block.timestamp > claimUntil, "NOT_EXPIRED");
        require(enrolled[learner] && !settled[learner], "NOT_RECLAIMABLE");
        settled[learner] = true; totalReserved -= amount;
        uint256 beforeBalance = token.balanceOf(sponsor);
        require(token.transfer(sponsor, amount), "RETURN_TRANSFER");
        require(token.balanceOf(sponsor) == beforeBalance + amount, "RETURN_AMOUNT");
        emit Reclaimed(learner, amount);
    }

    function _typed(bytes32 structHash) private view returns (bytes32) { return keccak256(abi.encodePacked("\x19\x01", domainSeparator(), structHash)); }
    function _recover(bytes32 digest, bytes calldata signature) private pure returns (address) {
        require(signature.length == 65, "SIG_LENGTH"); bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(signature.offset) s := calldataload(add(signature.offset, 32)) v := byte(0, calldataload(add(signature.offset, 64))) }
        require(v == 27 || v == 28, "SIG_V"); require(uint256(s) > 0 && uint256(s) <= HALF_ORDER, "SIG_S");
        return ecrecover(digest, v, r, s);
    }
}
