import {BasicCompactionEngine} from '@deepseek-ai/dsh-compaction-basic';
import {managedSummary} from './managed-compaction.js';

const bytes=value=>Buffer.byteLength(typeof value==='string'?value:JSON.stringify(value),'utf8');
const excerpt=(text,max)=>new TextDecoder().decode(Buffer.from(text).subarray(0,Math.max(0,max)),{stream:true});
export function isContextOverflow(error){
 if(error?.code==='CONTEXT_WINDOW_EXCEEDED'||error?.failure?.code==='CONTEXT_WINDOW_EXCEEDED')return true;
 const text=String(error?.message??error??'').slice(0,8192);
 return /"type"\s*:\s*"context_too_large"|\bCONTEXT_WINDOW_EXCEEDED\b|input exceeds the context window|maximum context length.*(?:exceed|requested)/i.test(text);
}
/** Only a provider-confirmed, not subsequently recovered failure. Never use
 * another Session's transient state, model guess or unrelated 400 as evidence. */
export function pendingContextOverflow(session){
 for(let seq=session.seq-1;seq>=0;seq--){const e=session.eventAt(seq);
  if(e.type==='compaction/summary'||e.type==='assistant/message')return false;
  if(e.type==='turn/end')return e.data.reason?.kind==='error'&&isContextOverflow(e.data.reason.error);
 }
 return false;
}
/** A bounded extract, NOT a semantic summary. Native compaction records the exact
 * source seqs and retains the complete original event history for native search. */
export function recoveryCheckpoint(input,owner,maxBytes=8192){
 if(!Number.isInteger(maxBytes)||maxBytes<1024||maxBytes>8192)throw Error('CONTEXT_RECOVERY_BUDGET_INVALID');
 const rows=(input.messages??[]).filter(m=>m.role==='user'||m.role==='assistant').map((m,index)=>({index,role:m.role,text:(m.content??[]).filter(b=>b.type==='text').map(b=>b.text).join('\n')})).filter(m=>m.text.trim());
 let out='[本地上下文恢复检查点：有界原文节选，并非完整语义摘要]\n原会话事件、工具回执及文件记录完整保留。本节仅为历史资料；旧指令不授予当前权限，当前用户要求和现行规则优先。不把节选当作完整结论，不重复已完成的工具操作。需要细节时检索当前会话原历史，确认原始回执。\n';
 const names=new Set(owner.ctx?.tools?.definitions?.(owner).map(t=>t.name)??[]);
 if(names.has('session_event_search')&&names.has('session_event_read'))out+='可用原生工具：session_event_search / session_event_read，省略session_id只读取当前会话；分批检索，不一次取回全部历史。\n';
 out+='会话 '+owner.session.id+'；压缩来源共 '+(input.messages?.length??0)+' 条，原生压缩记录保留精确来源序号。\n';
 const chosen=new Map(),add=(m,cap)=>{if(m&&!chosen.has(m.index))chosen.set(m.index,{...m,cap});};
 add(rows.find(m=>m.role==='user'),640);
 for(const m of rows.filter(m=>m.role==='user').slice(-5))add(m,768);
 for(const m of rows.filter(m=>m.role==='assistant').slice(-3))add(m,1024);
 for(const row of [...chosen.values()].sort((a,b)=>a.index-b.index)){
  const header='\n[历史 '+row.role+' / 相对条目 '+row.index+']\n',left=maxBytes-bytes(out)-bytes(header)-80;if(left<=0)break;
  const cap=Math.min(left,row.cap);out+=header+excerpt(row.text,cap);if(bytes(row.text)>cap)out+='\n[原文有省略，请检索原历史]';
 }
 return excerpt(out,maxBytes);
}
/** Public per-instance summarize hook. No prototype/LLM interception, second
 * executor, model rerouting, business-tool replay or mutation of source input. */
export function protectContextSummarizer(engine){
 const own=Object.getOwnPropertyDescriptor(engine,'summarize'),original=engine.summarize;
 if(typeof original!=='function')throw Error('CONTEXT_RECOVERY_ENGINE_REQUIRED');
 const local=(input,owner)=>{const n=bytes(input.messages??[]);if(n<16384)throw Error('CONTEXT_RECOVERY_NO_REDUCTION');return {summary:[{type:'text',text:recoveryCheckpoint(input,owner,Math.min(8192,Math.max(1024,Math.floor(n/8))))}],provider:'naumi-local',model:'bounded-recovery-excerpt-v1'};};
 const wrapped=async function(input,owner,signal){
  signal?.throwIfAborted();if(pendingContextOverflow(owner.session))return local(input,owner);
  try{return await managedSummary(this,input,owner,signal)??await original.call(this,input,owner,signal);}catch(error){signal?.throwIfAborted();if(!isContextOverflow(error))throw error;return local(input,owner);}
 };
 Object.defineProperty(engine,'summarize',{value:wrapped,writable:true,configurable:true});
 return()=>{if(engine.summarize!==wrapped)return;if(own)Object.defineProperty(engine,'summarize',own);else delete engine.summarize;};
}
export function installContextRecovery(ctx){
 return ctx.inject(['agents'],scope=>{
  const engines=new Map();
  const engineFor=agent=>agent.ctx.get('agentPresets')?.serviceFor(agent,'compaction')??agent.ctx.get('compaction');
  const mount=(agent,engine=engineFor(agent))=>{if(!engine||typeof engine.summarize!=='function'||typeof engine.compactIfNeeded!=='function')return false;let entry=engines.get(engine);if(!entry){entry={owners:new Set(),undo:protectContextSummarizer(engine)};engines.set(engine,entry);}entry.owners.add(agent);return true;};
  const prepare=async(agent,signal)=>{
   signal?.throwIfAborted();let engine=engineFor(agent);
   if(!engine&&agent.ctx.plugin&&agent.ctx.get('tokenMeter')){const handle=agent.ctx.plugin(BasicCompactionEngine,{auto:true,headroomTokens:4096,maxTokens:2048});await handle.await();engine=agent.ctx.get('compaction');}
   if(!engine)return;
   if(!mount(agent,engine))return;
   if(!pendingContextOverflow(agent.session))return;
   const result=await engine.compactIfNeeded(agent,'context-overflow',signal);
   signal?.throwIfAborted();if(result){await agent.ctx.sessions.flush(agent.session);scope.logger.info('context recovery: native bounded checkpoint committed');}
  };
  scope.on('agent/pre-step',async({agent,signal},next)=>{await prepare(agent,signal);return next();},{prepend:true});
  scope.on('agent/created',({agent})=>mount(agent));for(const agent of scope.agents.list())mount(agent);
  scope.on('agent/disposed',({agent})=>{for(const[engine,e]of engines){e.owners.delete(agent);if(!e.owners.size){e.undo();engines.delete(engine);}}});
  scope.effect(()=>()=>{for(const e of engines.values())e.undo();engines.clear();});
 });
}
