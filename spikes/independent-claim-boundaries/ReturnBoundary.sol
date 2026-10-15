// SPDX-License-Identifier: MIT
pragma solidity 0.8.30;

// LOCAL ABI CONFORMANCE HARNESS ONLY. No Reclaim proof verification, source
// semantics, funding, or payment. Do not use this with proxies: extcodehash
// cannot pin a proxy's implementation/storage/registry.
contract ReturnBoundary {
    enum Convention { VoidSuccess, FalseOnSuccess, TrueOnSuccess }
    address public immutable target;
    bytes32 public immutable targetCodeHash;
    Convention public immutable convention;
    bytes4 public immutable selector;
    constructor(address t, bytes32 codeHash, Convention c, bytes4 s) {
        require(block.chainid == 431799, "LOCAL_TEST_ONLY");
        require(t.code.length > 0 && t.codehash == codeHash, "CODE_PIN");
        require(s != bytes4(0), "SELECTOR");
        target=t; targetCodeHash=codeHash; convention=c; selector=s;
    }
    function check(bytes calldata callData) external view returns (bool) {
        require(target.codehash == targetCodeHash, "CODE_CHANGED");
        require(callData.length >= 4 && bytes4(callData[:4]) == selector, "SELECTOR");
        (bool ok, bytes memory result)=target.staticcall(callData);
        require(ok, "VERIFIER_REVERTED");
        if(convention==Convention.VoidSuccess) require(result.length==0,"RETURN_LENGTH");
        else {
            require(result.length==32,"RETURN_LENGTH");
            uint256 value; assembly { value := mload(add(result,32)) }
            require(value<=1,"NONCANONICAL_BOOL");
            require(value==(convention==Convention.TrueOnSuccess?1:0),"RETURN_SEMANTICS");
        }
        return true;
    }
}
// Deliberately untrusted stubs of wire behavior, NOT fake official witnesses.
contract WireFixture {
    // Mode represents a fault injected at a verifier boundary, never real proof data.
    function verifyProof(uint8 mode) external pure {
        if(mode==0) return;
        if(mode==1) { assembly { mstore(0,0) return(0,32) } }
        if(mode==2) { assembly { mstore(0,1) return(0,32) } }
        if(mode==3) revert("INVALID_PROOF_FIXTURE");
        if(mode==4) { assembly { mstore(0,2) return(0,32) } }
        if(mode==5) { assembly { mstore(0,0) return(0,31) } }
        assembly { mstore(0,0) mstore(32,0) return(0,64) }
    }
    function unrelated() external pure {}
}
