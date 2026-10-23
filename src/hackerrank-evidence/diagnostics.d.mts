export interface SourceDiagnostics {
 snapshot():Readonly<Record<string,unknown>>;
 record(stage:string,state:'STARTED'|'COMPLETED'|'FAILED'|'DEFERRED'|'OBSERVED',error?:unknown,details?:SourceDiagnosticDetails):void;
}
export interface SourceDiagnosticDetails {
 sdkCode?:string|null;boundedSendCode?:'ATTESTOR_BACKPRESSURE_LIMIT'|'ATTESTOR_SEND_TIMEOUT'|'ATTESTOR_SEND_FAILED'|null;
 resultKind?:'ERROR'|'MISSING_SIGNATURE'|'MALFORMED'|'SIGNED_CLAIM'|'UNKNOWN';aborted?:boolean|null;
 errorKind?:'OWNED_BOUNDED_SEND'|'HR_ATTESTOR_ERROR'|'TRANSPORT_ATTESTOR_ERROR'|'NATIVE_TYPE_ERROR'|'NATIVE_RANGE_ERROR'|'NATIVE_ERROR'|'NON_ERROR'|'UNKNOWN';
 ownCodeKind?:'ABSENT'|'ACCESSOR'|'STRING'|'NUMBER'|'OTHER'|'UNKNOWN';
}
export declare const SOURCE_DIAGNOSTIC_STAGES:readonly string[];
export declare const SOURCE_DIAGNOSTIC_SDK_CODES:readonly string[];
export declare function sourceDiagnosticCode(error:unknown):string;
/** The sink receives only a bounded, fixed-vocabulary snapshot; must be synchronous. */
export declare function createSourceDiagnostics(input?:{persist?:(snapshot:Readonly<Record<string,unknown>>)=>void;monotonicNow?:()=>number}):SourceDiagnostics;
export declare function observeSource(diagnostics:SourceDiagnostics|undefined,stage:string,state:string,error?:unknown,details?:SourceDiagnosticDetails):void;
