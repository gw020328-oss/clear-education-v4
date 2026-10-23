export interface SourceDiagnostics {
 snapshot():Readonly<Record<string,unknown>>;
 record(stage:string,state:'STARTED'|'COMPLETED'|'FAILED'|'DEFERRED',error?:unknown):void;
}
export declare const SOURCE_DIAGNOSTIC_STAGES:readonly string[];
export declare function sourceDiagnosticCode(error:unknown):string;
/** The sink receives only a bounded, fixed-vocabulary snapshot; must be synchronous. */
export declare function createSourceDiagnostics(input?:{persist?:(snapshot:Readonly<Record<string,unknown>>)=>void}):SourceDiagnostics;
export declare function observeSource(diagnostics:SourceDiagnostics|undefined,stage:string,state:string,error?:unknown):void;
