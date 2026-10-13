// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.30;

// LOCAL TEST MODEL. This interface is NOT a Reclaim proof verifier or privacy circuit.
interface IFixtureVerifier { function verify(bytes32 digest, bytes calldata signature) external view returns(bool); }
contract FixtureSignatureVerifier is IFixtureVerifier {
 address public immutable syntheticWitness;
 constructor(address witness){syntheticWitness=witness;}
 function verify(bytes32 digest,bytes calldata sig) external view returns(bool){
  require(sig.length==65,"SIG");bytes32 r;bytes32 s;uint8 v;
  assembly{r:=calldataload(sig.offset) s:=calldataload(add(sig.offset,32)) v:=byte(0,calldataload(add(sig.offset,64)))}
  require(ecrecover(digest,v,r,s)==syntheticWitness,"FIXTURE_SIGNATURE");
  // Model the archived Reclaim no-revert/false convention only.
  return false;
 }
}
contract BoundedAdapter {
 struct Claim {bytes32 application;address owner;address recipient;bytes32 sourcePolicy;bytes32 nullifier;uint64 timestamp;uint32 epoch;}
 struct Enrollment {address learner;address recipient;uint256 amount;bool paid;}
 IFixtureVerifier public immutable verifier;address public immutable sponsor;
 bytes32 public immutable businessScope;bytes32 public immutable sourcePolicy;uint32 public immutable epoch;
 mapping(bytes32=>Enrollment) public applications;mapping(bytes32=>bool) public spent;
 constructor(address v,bytes32 scope,bytes32 policy,uint32 e){require(v.code.length>0,"VERIFIER");verifier=IFixtureVerifier(v);sponsor=msg.sender;businessScope=scope;sourcePolicy=policy;epoch=e;}
 // Initial enrollment is assumed authorized. This does not model product consent/funding.
 function enroll(bytes32 application,address learner,address recipient) external payable {
  require(msg.sender==sponsor&&application!=0&&learner!=address(0)&&recipient!=address(0)&&msg.value>0,"ENROLL");
  require(applications[application].learner==address(0),"EXISTS");applications[application]=Enrollment(learner,recipient,msg.value,false);
 }
 function bindingDigest(bytes32 application,address owner) public view returns(bytes32){
  return keccak256(abi.encode("SYNTHETIC_OWNER_DELEGATION",block.chainid,address(this),businessScope,application,applications[application].recipient,owner,sourcePolicy));
 }
 function claimDigest(Claim calldata c) public view returns(bytes32){return keccak256(abi.encode("SYNTHETIC_PROOF_FACTS",block.chainid,address(this),businessScope,c));}
 function signer(bytes32 digest,bytes calldata sig) private pure returns(address){
  require(sig.length==65,"SIG");bytes32 r;bytes32 s;uint8 v;
  assembly{r:=calldataload(sig.offset) s:=calldataload(add(sig.offset,32)) v:=byte(0,calldataload(add(sig.offset,64)))}
  require(uint256(s)<=0x7fffffffffffffffffffffffffffffff5d576e7357a4501ddfe92f46681b20a0&&(v==27||v==28),"SIG");return ecrecover(digest,v,r,s);
 }
 function claim(Claim calldata c,bytes calldata learnerDelegation,bytes calldata fixtureSignature) external {
  Enrollment storage e=applications[c.application];require(e.learner!=address(0)&&!e.paid,"APPLICATION");
  require(c.recipient==e.recipient&&c.owner!=address(0),"BINDING");
  require(signer(bindingDigest(c.application,c.owner),learnerDelegation)==e.learner,"OWNER_DELEGATION");
  require(c.sourcePolicy==sourcePolicy&&c.epoch==epoch,"POLICY_EPOCH");
  require(c.timestamp<=block.timestamp+60&&uint256(c.timestamp)+1800>=block.timestamp,"FRESHNESS");
  bytes32 key=keccak256(abi.encode(businessScope,c.nullifier));require(c.nullifier!=0&&!spent[key],"NULLIFIER");
  verifier.verify(claimDigest(c),fixtureSignature);
  e.paid=true;spent[key]=true;
  (bool ok,)=e.recipient.call{value:e.amount}("");require(ok,"TRANSFER");
 }
}
