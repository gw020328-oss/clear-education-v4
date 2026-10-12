// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

// Valueless fixed-supply fixture asset. No fee, rebase, admin or mint operation.
contract ClearTestToken {
    string public constant name = "CLEAR Synthetic Test";
    string public constant symbol = "TEST";
    uint8 public constant decimals = 6;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);
    constructor(uint256 supply) { totalSupply = supply; balanceOf[msg.sender] = supply; emit Transfer(address(0), msg.sender, supply); }
    function approve(address spender, uint256 value) external returns (bool) {
        allowance[msg.sender][spender] = value; emit Approval(msg.sender, spender, value); return true;
    }
    function transfer(address to, uint256 value) external returns (bool) { _transfer(msg.sender, to, value); return true; }
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(allowance[from][msg.sender] >= value, "ALLOWANCE");
        allowance[from][msg.sender] -= value; _transfer(from, to, value); return true;
    }
    function _transfer(address from, address to, uint256 value) private {
        require(to != address(0) && balanceOf[from] >= value, "BALANCE");
        balanceOf[from] -= value; balanceOf[to] += value; emit Transfer(from, to, value);
    }
}
