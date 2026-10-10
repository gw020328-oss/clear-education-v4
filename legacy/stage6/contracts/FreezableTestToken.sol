// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @notice Negative-test fixture only. Stage 6 deployment policy rejects this code.
contract FreezableTestToken {
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    address public immutable admin;
    bool public frozen;

    constructor(uint256 supply) { admin = msg.sender; balanceOf[msg.sender] = supply; }
    function setFrozen(bool value) external { require(msg.sender == admin, "ADMIN"); frozen = value; }
    function approve(address spender, uint256 value) external returns (bool) { allowance[msg.sender][spender] = value; return true; }
    function transfer(address to, uint256 value) external returns (bool) { _transfer(msg.sender, to, value); return true; }
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender]; require(allowed >= value, "ALLOWANCE");
        allowance[from][msg.sender] = allowed - value; _transfer(from, to, value); return true;
    }
    function _transfer(address from, address to, uint256 value) internal {
        require(!frozen, "FROZEN"); require(balanceOf[from] >= value, "BALANCE");
        balanceOf[from] -= value; balanceOf[to] += value;
    }
}
