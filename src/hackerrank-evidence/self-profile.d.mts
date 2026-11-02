export interface SelfAttestorProfile {
 readonly mode:'SELF_ATTESTOR_TEST';
 readonly profileId:string;
 readonly endpoint:string;
 readonly signer:string;
 readonly sourceEnvironment:'LIVE_HACKERRANK'|'SYNTHETIC_HTTPS';
 readonly hosts:readonly ['www.hackerrank.com','hrcdn.net'];
 readonly officialHostedSuccess:false;
 readonly independentTrust:false;
 readonly bgpCheckEnabled:false;
}
export declare const SELF_MODE:'SELF_ATTESTOR_TEST';
export declare const SELF_HOSTS:readonly ['www.hackerrank.com','hrcdn.net'];
export declare function validateSelfProfile(profile:unknown):Readonly<SelfAttestorProfile>;
export declare function requireProfileMode(profile:unknown,mode?:'OFFICIAL'|'SELF_ATTESTOR_TEST',expected?:SelfAttestorProfile|null):void;
