import test from 'node:test';
import assert from 'node:assert/strict';
import {oauthDiagnostic, readOAuthDiagnostic, saveOAuthDiagnostic, diagnosticLabel} from '../../src/embedded-wallet/oauth-diagnostics.mjs';
test('SDK OAuth codes and HTTP status survive without exception data',()=>{
 const secret='https://evil.invalid/?token=private-cookie-user';
 const d=oauthDiagnostic({privyErrorCode:'invalid_captcha',type:'api_error',status:403,message:secret,cause:{token:secret},data:{email:secret}},'OAUTH_START');
 assert.deepEqual(d,{version:1,stage:'OAUTH_START',code:'invalid_captcha',type:'api_error',httpStatus:403});
 assert.doesNotMatch(JSON.stringify(d),/private|cookie|evil|email/);
 assert.match(diagnosticLabel(d),/OAUTH_START.*invalid_captcha.*403/);
});
test('unknown fields, messages, status and getters never escape',()=>{
 const e={privyErrorCode:'token-secret',message:'email token cookie',type:'private',status:123456};
 assert.deepEqual(oauthDiagnostic(e,'secret'),{version:1,stage:'WALLET_ACTION',code:'UNCLASSIFIED',type:'UNKNOWN',httpStatus:null});
 assert.doesNotThrow(()=>oauthDiagnostic({get privyErrorCode(){throw Error('secret');}},'OAUTH_RETURN'));
 assert.equal(oauthDiagnostic(new TypeError('Failed to fetch'),'OAUTH_START').code,'FETCH_FAILED');
});
test('latest safe event persists across redirect, excludes injected storage fields and tolerates denied storage',()=>{
 let value;const storage={setItem:(k,v)=>{value=v;},getItem:()=>value};
 const d=oauthDiagnostic({privyErrorCode:'session_storage_unavailable'},'OAUTH_RETURN');
 saveOAuthDiagnostic(storage,d);assert.deepEqual(readOAuthDiagnostic(storage),d);
 value=JSON.stringify({...d,token:'secret'});assert.deepEqual(readOAuthDiagnostic(storage),d);
 value=JSON.stringify({...d,code:'secret'});assert.equal(readOAuthDiagnostic(storage),null);
 assert.doesNotThrow(()=>saveOAuthDiagnostic({setItem(){throw Error('blocked');}},d));
 assert.equal(readOAuthDiagnostic({getItem(){throw Error('blocked');}}),null);
});
