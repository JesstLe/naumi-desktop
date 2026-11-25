import {LlmError} from '@deepseek-ai/dsh-llm';

const key=r=>JSON.stringify([r?.provider,r?.model]);
export function displayedModel(ctx,selection,labels=new Map()){
 const managed=ctx.get?.('naumiAccountModels');
 const route=managed?.value.routes.find(r=>r.provider===selection?.provider&&r.model.id===selection?.model);
 return route?.model.name??labels.get(key(selection))??'当前所选模型';
}
/** Scope product presentation at native prompt inputs. Never search/replace user
 * text, generated answers, files, model request IDs or durable event history. */
export function installAgentPresentation(ctx){
 return ctx.inject(['agents','systemPrompt','llm'],scope=>{
  const mounted=new Map(),labels=new Map();
  const mount=agent=>{
   if(mounted.has(agent))return;const c=agent.ctx,disposers=[];
   const name=selection=>displayedModel(c,selection,labels);
   disposers.push(c.systemPrompt.section({name:'harness:identity',order:c.systemPrompt.getSectionOrder('HARNESS_IDENTITY'),text:'You are the Naumi assistant. Naumi is the user-facing application identity. A configured model option is a display label, not independent proof of an underlying vendor/model identity. Use the current display label when describing the selected option; do not infer vendor identity or expose internal adapter/route identifiers.'}));
   disposers.push(c.systemPrompt.section({name:'harness:source',order:c.systemPrompt.getSectionOrder('HARNESS_SOURCE'),text:'The user is working in Naumi. Application installation paths and the current task working directory are separate; use the filesystem tools to verify the working directory when needed.'}));
   disposers.push(c.systemPrompt.section({name:'app:web-surface',order:c.systemPrompt.getSectionOrder('WEB_SURFACE'),text:'The user is using Naumi. When the user says this app or this page without another target, they mean Naumi. Browser/desktop content is not implicit; observe it using the available native tools before making claims.'}));
   for(const [id,order]of [['harness:source','HARNESS_SOURCE'],['app:web-surface','WEB_SURFACE']])disposers.push(c.systemPrompt.context({name:id,order:c.systemPrompt.getContextOrder(order),text:''}));
   disposers.push(c.systemPrompt.context({name:'naumi:model-display',order:124,required:true,interpolate:false,text:context=>{const selected=context.modelSelection??agent.model.current();return 'Naumi 当前模型选项：'+JSON.stringify(name(selected))+'。此名称是产品配置显示名称；不要把内部路由编号当作型号，不根据历史回复或引擎实现名称推断供应商。模型切换保留本会话任务、进度与历史，不代表切换到另一个任务或身份。';}}));
   disposers.push(c.systemPrompt.variable('model',context=>name(context.modelSelection??agent.model.current())));
   disposers.push(c.systemPrompt.variable('provider',()=> 'Naumi'));
   disposers.push(c.on('system-prompt/assemble',async(assembly,context,next)=>{const selected=context.modelSelection??agent.model.current();if(selected&&!c.get?.('naumiAccountModels')){try{const info=await c.llm.resolveModelInfo(selected.provider,selected.model,context.signal);if(info?.name&&info.name!==selected.model)labels.set(key(selected),info.name);}catch{context.signal?.throwIfAborted();}}const result=await next();return {...result,variables:{...result.variables,model:name(selected),provider:'Naumi'}};}));
   disposers.push(c.on('agent/pre-step',async({agent,modelSelection},next)=>{const decision=await next();if(decision.kind==='reject')return decision;const previous=agent.session.requestHeader()?.config;return {...decision,messages:decision.messages.map(m=>m.source?.kind==='model-selection'?{...m,content:[{type:'text',text:'[模型选项已切换：之前的答复使用 '+name(previous)+'；本会话现在使用 '+name(modelSelection)+'。继续当前任务与最新进度，保留历史。]'}],source:{...m.source,summary:name(previous)+' → '+name(modelSelection)}}:m)};},{prepend:true}));
   disposers.push(c.on('agent/request',async(_input,next)=>{try{return await next();}catch(error){if(error?.code!=='MODEL_SWITCH_COMPACTION_FAILED')throw error;throw new LlmError('切换模型时未能整理上下文，原会话历史已保留。请检查当前模型授权后重试。','MODEL_SWITCH_COMPACTION_FAILED',{cause:error});}},{prepend:true}));
   mounted.set(agent,()=>{for(const dispose of disposers.reverse())dispose();});
  };
  scope.on('agent/created',({agent})=>mount(agent));scope.on('agent/disposed',({agent})=>{mounted.get(agent)?.();mounted.delete(agent);});for(const agent of scope.agents.list())mount(agent);
  scope.effect(()=>()=>{for(const dispose of mounted.values())dispose();mounted.clear();labels.clear();});
 });
}
