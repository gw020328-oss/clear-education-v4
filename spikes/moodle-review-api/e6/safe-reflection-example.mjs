// Independent OFFLINE example, never the original body read from the live fixture.
import {bytesDigest} from '../../../src/product-workflow/contract.mjs';
import {normalizeReviewBody,normalizedReviewContentHash} from '../../../src/review-evidence/common/normalizer.mjs';
export function safeReflectionExample(){
 const html='<p>예제: 배열 합계를 계산했습니다. 🐍<br>문제가 없었지만 빈 배열을 점검했습니다.<br>경계 입력 점검을 배웠습니다.</p>';
 const quotes=['배열 합계를 계산했습니다. 🐍','문제가 없었지만 빈 배열을 점검했습니다.','경계 입력 점검을 배웠습니다.'];
 const n=normalizeReviewBody(html,1);
 return {dataScope:'OFFLINE_SAFE_EXAMPLE_NOT_LIVE_SOURCE',messageFormat:1,sourceId:'offline-safe-reflection',original:html,rawBodyHash:bytesDigest(Buffer.from(html)),normalizerVersion:n.version,
  normalizedHash:normalizedReviewContentHash({version:n.version,title:'Independent example',body:n.text}),locationBasis:'ORIGINAL_BODY_HTML_UTF16',
  spans:quotes.map(quote=>({start:html.indexOf(quote),end:html.indexOf(quote)+quote.length,quoteHash:bytesDigest(Buffer.from(quote))})),normalizedToOriginalMapSupported:false,aiObservationExecuted:false};
}
