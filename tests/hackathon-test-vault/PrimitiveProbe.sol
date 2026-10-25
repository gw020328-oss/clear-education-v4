// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;
import {StrictECDSA} from "../../src/hackathon-test-vault/StrictECDSA.sol";
contract PrimitiveProbe {
    function recover(bytes32 digest,bytes calldata sig) external pure returns(address) { return StrictECDSA.recover(digest,sig); }
}
