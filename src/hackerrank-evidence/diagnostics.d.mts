export interface SourceDiagnostics {
 snapshot():Readonly<Record<string,unknown>>;
 record(stage:string,state:'STARTED'|'COMPLETED'|'FAILED'|'DEFERRED'|'OBSERVED',error?:unknown,details?:SourceDiagnosticDetails):void;
}
export type SourceTransportCode='ATTESTOR_BACKPRESSURE_LIMIT'|'ATTESTOR_MESSAGE_LIMIT'|'ATTESTOR_QUEUE_LIMIT'|'ATTESTOR_QUEUE_TIMEOUT'|'ATTESTOR_SEND_TIMEOUT'|'ATTESTOR_SEND_FAILED'|'ATTESTOR_SEND_ABORTED'|'ATTESTOR_SEND_CLOSED';
export interface SourceTransportDetails {
 phase:'ADMISSION'|'QUEUED'|'DRAIN_WAIT'|'SENDING'|'COMPLETE';
 frameBytes:number|null;socketQueuedBytes:number|null;retainedBytes:number;pendingCount:number;
 frameLimitBytes:number;retainedLimitBytes:number;pendingCountLimit:number;timeoutMs:number;
 waitMs:number;sendMs:number|null;terminalReason:SourceTransportCode|null;
 terminalFrameBytes:number|null;terminalSocketQueuedBytes:number|null;terminalRetainedBytes:number|null;terminalPendingCount:number|null;
}
export interface SourceDiagnosticDetails {
 sdkCode?:string|null;boundedSendCode?:SourceTransportCode|null;transport?:SourceTransportDetails|null;
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
