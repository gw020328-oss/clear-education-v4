// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;
// Standalone primitive prepared for post-E3 acceptance. Not wired to payout.
library StrictECDSA {
    function recover(bytes32 digest,bytes calldata sig) internal pure returns(address signer) {
        require(sig.length==65,"SIGNATURE_LENGTH");bytes32 r;bytes32 s;uint8 v;
        assembly { r:=calldataload(sig.offset) s:=calldataload(add(sig.offset,32)) v:=byte(0,calldataload(add(sig.offset,64))) }
        require(uint256(s)>0 && uint256(s)<=0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0,"SIGNATURE_S");
        require(v==27||v==28,"SIGNATURE_V");signer=ecrecover(digest,v,r,s);require(signer!=address(0),"SIGNATURE_RECOVERY");
    }
}
