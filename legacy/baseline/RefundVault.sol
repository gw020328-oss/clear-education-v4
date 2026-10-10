// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;

// Deliberately minimal local fixture, NOT a production ERC20 or audited escrow.
contract TestToken {
    address public immutable admin = msg.sender;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public frozen;
    function mint(address to, uint256 amount) external {
        require(msg.sender == admin); balanceOf[to] += amount;
    }
    function setFrozen(bool value) external { require(msg.sender == admin); frozen = value; }
    function approve(address to, uint256 amount) external returns (bool) {
        allowance[msg.sender][to] = amount; return true;
    }
    function transfer(address to, uint256 amount) external returns (bool) {
        _move(msg.sender, to, amount); return true;
    }
    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(allowance[from][msg.sender] >= amount, "allowance");
        allowance[from][msg.sender] -= amount; _move(from, to, amount); return true;
    }
    function _move(address from, address to, uint256 amount) internal {
        require(!frozen, "token frozen"); require(balanceOf[from] >= amount, "balance");
        balanceOf[from] -= amount; balanceOf[to] += amount;
    }
}

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
    mapping(address => bool) public enrolled;
    mapping(address => bool) public settled;
    bytes32 private constant TYPEHASH = keccak256("Receipt(bytes32 termsHash,address learner,uint32 session,uint64 completedAt)");
    uint256 private constant HALF_ORDER = 0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0;
    event Paid(address indexed learner, address indexed submitter, uint256 amount);
    event Enrolled(address indexed learner);
    event Expired(address indexed learner);
    constructor(TestToken t, address v, bytes32 h, uint256 s, uint256 d, uint256 c) {
        require(v != address(0) && s < d && d < c);
        token = t; verifier = v; sponsor = msg.sender; termsHash = h;
        start = s; due = d; claimUntil = c;
    }
    function domainSeparator() public view returns (bytes32) {
        return keccak256(abi.encode(
            keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract)"),
            keccak256("RefundRights"), keccak256("1"), block.chainid, address(this)
        ));
    }
    function digest(Receipt calldata r) public view returns (bytes32) {
        return keccak256(abi.encodePacked("\x19\x01", domainSeparator(),
            keccak256(abi.encode(TYPEHASH, r.termsHash, r.learner, r.session, r.completedAt))));
    }
    function enroll(address learner) external {
        require(msg.sender == sponsor && learner != address(0) && !enrolled[learner] && block.timestamp <= due);
        enrolled[learner] = true;
        require(token.transferFrom(sponsor, address(this), amount));
        emit Enrolled(learner);
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
        settled[learner] = true;
        require(token.transfer(learner, amount));
        emit Paid(learner, msg.sender, amount);
    }
    function reclaimExpired(address learner) external {
        require(block.timestamp > claimUntil && enrolled[learner] && !settled[learner], "not expired");
        settled[learner] = true;
        require(token.transfer(sponsor, amount)); emit Expired(learner);
    }
    function _recover(bytes32 h, bytes calldata sig) private pure returns (address) {
        require(sig.length == 65, "signature length");
        bytes32 r; bytes32 s; uint8 v;
        assembly { r := calldataload(sig.offset) s := calldataload(add(sig.offset, 32)) v := byte(0, calldataload(add(sig.offset, 64))) }
        require(uint256(s) <= HALF_ORDER && (v == 27 || v == 28), "signature canonical");
        return ecrecover(h, v, r, s);
    }
}
