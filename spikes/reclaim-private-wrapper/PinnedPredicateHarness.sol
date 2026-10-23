// SPDX-License-Identifier: MIT
pragma solidity ^0.8.30;
interface IPrivatePredicate { function verify(bytes calldata, bytes32[] calldata) external view returns(bool); }
// LOCAL SYNTHETIC ONLY. No payment, eligibility, source nullifier, enrollment or production registry.
contract PinnedPredicateHarness {
    address public immutable verifier;
    bytes32 public immutable verifierCodeHash;
    bytes32 public immutable expectedPublicInputsHash;
    constructor(address target, bytes32 expected) {
        require(block.chainid == 431798 && target.code.length > 0, "LOCAL_ONLY");
        verifier = target; verifierCodeHash = target.codehash; expectedPublicInputsHash = expected;
    }
    function verify(bytes calldata proof, bytes32[] calldata inputs) external view returns(bool) {
        require(verifier.codehash == verifierCodeHash, "PROGRAM_CHANGED");
        require(keccak256(abi.encode(inputs)) == expectedPublicInputsHash, "REGISTRATION_POLICY_BINDING");
        require(IPrivatePredicate(verifier).verify(proof, inputs), "INVALID_PROOF");
        return true;
    }
}
