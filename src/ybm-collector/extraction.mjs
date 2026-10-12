import {extractSource,joinSources} from './source-policy.mjs';
import {requireValue} from './values.mjs';

// A local layout check, never proof verification. Browser HTML is untrusted.
// The future attestor verifier must independently derive these same fields.
export function createExtraction(collection,{onPair,finish=true}={}){
  let registration,scores,closed=false;
  return {
    accept(role,bytes){
      try{
        requireValue(!closed,'EXTRACTION_CLOSED');collection.assertActive();
        const request=collection.request(role);
        requireValue(request.context.clearSourceRole===role,'SOURCE_ROLE');
        const rows=extractSource(role,bytes);
        if(role==='registration'){requireValue(!registration,'SOURCE_ALREADY_COLLECTED');registration=rows;}
        else {requireValue(!scores,'SOURCE_ALREADY_COLLECTED');scores=rows;}
        if(!registration||!scores)return {complete:false,role};
        const pair=joinSources(registration,scores);
        const linked=[collection.request('registration'),collection.request('score',pair.score.index)];
        requireValue(linked[0].context.clearBindingHash===linked[1].context.clearBindingHash&&linked[0].ownerAddress===linked[1].ownerAddress&&linked[0].context.clearSourceRequestId!==linked[1].context.clearSourceRequestId,'SOURCE_BINDING');
        collection.assertActive();onPair?.({scoreIndex:pair.score.index});if(finish)collection.finish();closed=true;
        // No exam fields, request identifiers, wallet or body hashes in logs.
        // Retain no diagnostic artifact that might be mistaken for a proof.
        const result={complete:true,applicationBound:true,recipientAuthorized:true,sourcePairMatched:true,sourcePolicyPinned:true,listComplete:false,highestScoreAssessed:false,proofVerified:false,paymentAllowed:false};
        registration=undefined;scores=undefined;return result;
      }catch(error){closed=true;registration=undefined;scores=undefined;collection.cancel();throw error;}
      finally{if(Buffer.isBuffer(bytes))bytes.fill(0);}
    },
    close(){closed=true;registration=undefined;scores=undefined;collection.cancel();},
  };
}
