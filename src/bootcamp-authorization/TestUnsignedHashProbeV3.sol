// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;
// TEST-ONLY pure hashing probe. No signer, registry, funds, accept or claim.
contract TestUnsignedHashProbeV3 {
    struct Domain { string name; string version; uint256 chainId; address verifyingContract; bytes32 salt; }
    struct Authorization {
        bytes32 applicationId; bytes32 policyHash; bytes32 runtimeMappingHash;
        bytes32 decisionId; uint64 decisionRevision; bytes32 decisionHash;
        address recipient; address token; uint256 amountAtoms; bytes32 allocationId;
        bytes32 consentSetHash; bytes32 deadlinePolicyHash; uint8 eligibilityRoute;
        bytes32 nonce; uint64 issuedAt; uint64 expiresAt; bytes32 signerKeyId; uint64 authorizationEpoch;
        bytes32 operationsPolicyHash; bytes32 procedureId; uint64 firstReviewStartedAt; uint64 decisionPublishedAt; uint64 sourceValidUntilExclusive; uint8 revalidationCount;
    }
    bytes32 private constant DOMAIN_TYPE = keccak256("EIP712Domain(string name,string version,uint256 chainId,address verifyingContract,bytes32 salt)");
    bytes32 private constant AUTH_TYPE = keccak256("BootcampTestPaymentAuthorizationV3(bytes32 applicationId,bytes32 policyHash,bytes32 runtimeMappingHash,bytes32 decisionId,uint64 decisionRevision,bytes32 decisionHash,address recipient,address token,uint256 amountAtoms,bytes32 allocationId,bytes32 consentSetHash,bytes32 deadlinePolicyHash,uint8 eligibilityRoute,bytes32 nonce,uint64 issuedAt,uint64 expiresAt,bytes32 signerKeyId,uint64 authorizationEpoch,bytes32 operationsPolicyHash,bytes32 procedureId,uint64 firstReviewStartedAt,uint64 decisionPublishedAt,uint64 sourceValidUntilExclusive,uint8 revalidationCount)");
    function domainHash(Domain calldata d) public pure returns(bytes32) {
        return keccak256(abi.encode(DOMAIN_TYPE,keccak256(bytes(d.name)),keccak256(bytes(d.version)),d.chainId,d.verifyingContract,d.salt));
    }
    function structHash(Authorization calldata a) public pure returns(bytes32) {
        return keccak256(abi.encode(AUTH_TYPE,a));
    }
    function digest(Domain calldata d, Authorization calldata a) external pure returns(bytes32) {
        return keccak256(abi.encodePacked(hex"1901",domainHash(d),structHash(a)));
    }
}
