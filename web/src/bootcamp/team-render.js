// Keep controls/focus stable across read-only polling and countdown ticks.
export function preparationKey(s,{packet,ack,availability,registrationUnknown}){
 const b=s.bootstrap,a=b?.aiApproval;
 const view=s.view&&Object.fromEntries(Object.entries(s.view).filter(([key])=>key!=='observedAt'));
 return JSON.stringify([s.applicationId,b?.applicationId,b?.role,b?.phase,b?.procedureReady,b?.failure,b?.selfAttestor,b?.expectedPayment,s.approval,s.error?.code,s.error?.outcome,s.ended,packet,ack,registrationUnknown,view,s.receipt,s.consentReplayPending,s.consentTargetChanged,s.reviewStopped,availability.consent,
  a&&['planHash','bodySha256','contextHash','runBindingHash','codeHead','model','approvalWallet','authorityConfigured','reviewScreensReady','status','permitted','approvalWindowEndsAtMs'].map(k=>a[k]),availability.ai.code,availability.ai.enabled,availability.ai.reason]);
}
export function createPreparationRenderer({draw,update}){
 let previous;
 return data=>{const key=preparationKey(data.state,data);if((!data.state.busy||previous===undefined)&&key!==previous){draw(data);previous=key;}update(data);};
}
