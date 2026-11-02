import React,{useEffect,useRef} from 'react';
import {createTeamPort} from './team-port.mjs';
export function TeamPanel({session,wallet,config}){
 const frame=useRef(null);
 useEffect(()=>{const port=createTeamPort({session,wallet,config});
  const connect=()=>{const w=frame.current?.contentWindow;if(!w)return;
   Object.defineProperty(w,'clearTeamRuntime',{value:port,configurable:true});
   w.dispatchEvent(new Event('clear-team-ready'));};
  const f=frame.current;f.addEventListener('load',connect);connect();
  return()=>{f.removeEventListener('load',connect);try{delete f.contentWindow.clearTeamRuntime;}catch{}};
 },[session,wallet,config]);
 return <section><h2>팀원 제품 화면 · 로컬 TEST</h2><iframe ref={frame} title="CLEAR 팀원 제품 화면" src="/team/index.html" width="100%" height="1200"/></section>;
}
