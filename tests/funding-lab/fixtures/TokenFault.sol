// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;
// Storage-compatible fault injection ONLY. Never accepted by lab constructor.
contract TokenFault {
    uint256 public totalSupply;
    mapping(address=>uint256) public balanceOf;
    mapping(address=>mapping(address=>uint256)) public allowance;
    uint256 public mode; address public target; bytes public attack;
    uint256 public blockedReentries;
    function configure(uint256 m,address t,bytes calldata a) external {mode=m;target=t;attack=a;}
    function transfer(address to,uint256 amount) external returns(bool) {
        if(mode==1)return false;
        if(mode==2)return true;
        if(mode==3){(bool ok,bytes memory reason)=target.call(attack);require(!ok,"REENTRY_SUCCEEDED");
            require(keccak256(reason)==keccak256(abi.encodeWithSignature("Error(string)","REENTRANCY")),"WRONG_FAILURE");blockedReentries++;}
        require(balanceOf[msg.sender]>=amount,"BALANCE");balanceOf[msg.sender]-=amount;balanceOf[to]+=amount;return true;
    }
}
