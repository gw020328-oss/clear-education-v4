// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// Local, valueless fixture only. Not an audited or general-purpose ERC-20.
contract TestToken {
    string public constant name = "Local Refund Test Token";
    string public constant symbol = "TEST";
    uint8 public constant decimals = 6;
    address public immutable admin = msg.sender;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bool public frozen;

    function mint(address to, uint256 value) external {
        require(msg.sender == admin, "admin");
        balanceOf[to] += value;
    }
    function setFrozen(bool value) external {
        require(msg.sender == admin, "admin");
        frozen = value;
    }
    function approve(address to, uint256 value) external returns (bool) {
        allowance[msg.sender][to] = value;
        return true;
    }
    function transfer(address to, uint256 value) external returns (bool) {
        _move(msg.sender, to, value);
        return true;
    }
    function transferFrom(address from, address to, uint256 value) external returns (bool) {
        require(allowance[from][msg.sender] >= value, "allowance");
        allowance[from][msg.sender] -= value;
        _move(from, to, value);
        return true;
    }
    function _move(address from, address to, uint256 value) internal {
        require(!frozen, "token frozen");
        require(to != address(0) && balanceOf[from] >= value, "balance/address");
        balanceOf[from] -= value;
        balanceOf[to] += value;
    }
}
