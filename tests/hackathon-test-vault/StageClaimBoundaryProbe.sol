// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;
// UNSUPPORTED TOKEN, solely a disposable-VM fault injection probe.
// Slots 0..2 intentionally match ClearTestToken. Never deployed as the accepted asset.
contract StageClaimBoundaryProbe {
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;
    bytes32 public callbackRevertHash;
    address immutable vault;
    bytes32 immutable appId;
    uint256 immutable mode;
    constructor(address v,bytes32 a,uint256 m) { vault=v;appId=a;mode=m; }
    function transfer(address to,uint256 value) external returns(bool) {
        require(msg.sender==vault,"PROBE_CALLER");
        if(mode==1) {
            (bool ok,bytes memory reason)=vault.call(abi.encodeWithSignature("claim(bytes32)",appId));
            require(!ok && keccak256(reason)==keccak256(abi.encodeWithSignature("Error(string)","REENTRANCY")),"PROBE_REENTRY_NOT_REJECTED");
            callbackRevertHash=keccak256(reason);
        }
        if(mode==2)return false;
        balanceOf[msg.sender]-=value;
        balanceOf[to]+=mode==3?value-1:value;
        return true;
    }
}
