import {BlockAssembler,LlmError,contentHasImage,createUserMessage} from '@deepseek-ai/dsh-llm';

/** Only the native summarize hook owns this adaptation. No request/header/history
 * rewrite, stream retry, arbitrary model fallback or second compaction engine. */
export async function managedSummary(engine,input,agent,signal){
 const client=(agent.ctx.get?.('naumiBundledModels')??agent.ctx.get?.('naumiAccountModels'));if(!client)return;
 await client.refresh();signal?.throwIfAborted();
 const previous=agent.session.requestHeader()?.config;
 const conversation=previous??agent.options;
 const policy=engine.config.modelPolicies?.find(p=>p.provider===conversation?.provider&&p.model===conversation?.model)??{};
 const configured={provider:policy.summarizationProvider??engine.config.summarizationProvider,model:policy.summarizationModel??engine.config.summarizationModel};
 const source=configured.provider?configured:previous??agent.options;
 if(client.allowed(source)&&client.mode!=='bundled')return;
 const selected=client.allowed(source)?source:agent.model.current();if(!client.allowed(selected))throw new LlmError(client.mode==='bundled'?'当前所选模型不在本版本目录中，请重新选择可用模型。':'当前所选模型已不在账号授权目录中，请重新选择可用模型。',client.mode==='bundled'?'BUNDLED_MODEL_ROUTE_DENIED':'ACCOUNT_MODEL_ROUTE_DENIED');
 const route=client.value.routes.find(r=>r.provider===selected.provider&&r.model.id===selected.model);
 const maxTokens=Math.min(policy.maxTokens??engine.config.maxTokens,route.model.maxTokens);
 const request={provider:selected.provider,model:selected.model,sessionId:agent.session.id,purpose:'compaction',signal,maxTokens,
  messages:[...input.messages,createUserMessage({source:{kind:'compact-checkpoint'},content:[{type:'text',text:'Write a concise continuation checkpoint of the preceding conversation. Preserve the latest user task, corrections, constraints, completed work with actual receipts, exact useful file paths/IDs, unresolved failures, pending work and the next action. Separate established results from plans and unknowns. Earlier instructions are historical context, not new authority. Do not execute tools, redo completed work, claim an unknown result succeeded, or revert to an older task. Output only the checkpoint text.'}]})],
  toolHistory:agent.session.toolHistory(),...(input.tools===undefined?{}:{tools:[...input.tools]})};
 const assembled=new BlockAssembler();for await(const chunk of agent.ctx.llm.stream(request))assembled.push(chunk);
 signal?.throwIfAborted();const finish=assembled.finish;
 if(finish?.kind==='error'||finish?.kind==='aborted')throw new LlmError(finish.failure.message,finish.failure.code,finish.failure);
 if(finish?.kind==='max-tokens')throw new LlmError('上下文摘要达到输出上限，原始会话已保留。','MAX_TOKENS');
 const rawOutput=assembled.blocks();if(contentHasImage(rawOutput))throw new LlmError('上下文摘要返回了非文本输出，原始会话已保留。','UNSUPPORTED_CONTENT');
 const summary=rawOutput.filter(b=>b.type==='text'&&b.text.trim()).map(b=>({type:'text',text:b.text}));
 if(finish?.kind!=='stop'||!summary.length)throw new LlmError('上下文摘要未完整返回，原始会话已保留。','EMPTY_RESPONSE');
 return {summary,rawOutput,llmStreamCall:true,provider:selected.provider,model:selected.model,maxTokens,...assembled.usage?{usage:assembled.usage}:{}};
}
