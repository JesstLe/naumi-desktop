export const MODE_KEY='naumi.navigationMode.v1';
export const navigationMode=value=>value==='bot'?'bot':'threads';
/** Exact identities/lineage, never titles or a workspace name heuristic. */
export function threadOwnership(catalog,jobs,groups,sessions,workspaces){
 const ids=new Set(),botIds=new Set(catalog.bots.map(b=>b.id)),add=id=>{if(typeof id==='string'&&id)ids.add(id);};
 for(const bot of catalog.bots){add(bot.homeSessionId);bot.sessionIds.forEach(add);}
 // Dispatch provenance does not transfer ownership of the sending ordinary thread.
 // Explicit Bot homes/history are already classified above; only a task's target is owned.
 for(const task of jobs.tasks??[])if(botIds.has(task.targetBotId))add(task.targetSessionId);
 for(const room of groups.rooms??[])for(const member of room.members??[])add(member.sessionId);
 // The native list's parentId is authoritative; loaded team projections cover
 // live members not yet in the durable catalog. Descend to a fixed point.
 let changed=true;while(changed){const count=ids.size;for(const row of Object.values(sessions.byId)){if(ids.has(row.parentId))add(row.id);if(ids.has(row.id))for(const member of sessions.projectionsBySession?.[row.id]?.values?.agentTeam?.members??[])add(member.id);}changed=count!==ids.size;}
 const normalize=p=>typeof p==='string'?p.replaceAll('\\','/').replace(/\/+$/,'').toLocaleLowerCase():null;
 const paths=new Set(catalog.bots.map(b=>normalize(b.cwd)).filter(Boolean));
 // Keep a shared directory if even one ordinary conversation lives there.
 const workspaceIds=workspaces.items.filter(w=>paths.has(normalize(w.path))&&w.sessionIds.every(id=>ids.has(id))).map(w=>w.workspaceId);
 const waiting=!['ready','loading','error'].includes(catalog.status)||catalog.status!=='ready'&&!catalog.bots.length||jobs.status!=='ready'||groups.status!=='ready';
 return{waiting,error:[catalog,jobs,groups].some(s=>['error','forbidden'].includes(s.status)),sessionIds:[...ids],workspaceIds};
}
export function createThreadVisibility({catalog,activity,groups,sessions,workspaces}){
 const sources=[catalog,activity,groups,sessions,workspaces],listeners=new Set();let stops=[],snapshot={waiting:true,sessionIds:[],workspaceIds:[]};
 const update=()=>{snapshot=threadOwnership(...sources.map(s=>s.getSnapshot()));for(const listener of listeners)listener();};
 return{getSnapshot:()=>snapshot,subscribe(listener){listeners.add(listener);if(listeners.size===1){stops=sources.map(s=>s.subscribe(update));update();}return()=>{listeners.delete(listener);if(!listeners.size){stops.forEach(stop=>stop());stops=[];snapshot={waiting:true,sessionIds:[],workspaceIds:[]};}};}};
}
export function botForSession(bots,sessionId){return bots.find(bot=>bot.sessionIds.includes(sessionId))??null;}
export function botSessions(bot,sessions,workspaces){return bot.sessionIds.filter(id=>sessions.byId[id]&&!workspaces?.archivedSessionIds?.includes(id)).map(id=>({...sessions.byId[id],sessionId:id}));}
export function botTarget(bot,sessions,status,workspaces){
  const rows=botSessions(bot,sessions,workspaces);return rows.find(s=>status.get(s.sessionId)?.running??s.running)?.sessionId??rows.at(-1)?.sessionId??null;
}
export function currentSessionId(sessions,activePanelId){return activePanelId!==null?null:Object.values(sessions.byId).find(row=>(row.retainedBy?.mainView??0)>0)?.id??null;}
export function botSelected(bot,sessionId,sessions){return bot.sessionIds.includes(sessionId)||bot.sessionIds.some(id=>sessions.projectionsBySession[id]?.values.agentTeam?.members.some(member=>member.id===sessionId));}
export function botActivity(bot,sessions,status){
  const ids=new Set(bot.sessionIds);for(const id of bot.sessionIds)for(const m of sessions.projectionsBySession[id]?.values.agentTeam?.members??[])ids.add(m.id);
  let known=false,running=false;for(const id of ids){const state=status.get(id);if(state?.pendingInteraction)return 'waiting';const active=state?.running??sessions.byId[id]?.running;if(typeof active==='boolean')known=true;if(active)running=true;}
  return running?'running':known?'idle':'unknown';
}
export function botSummary(bot,sessions){
  for(const id of [...bot.sessionIds].reverse()){
    const values=sessions.projectionsBySession[id]?.values??sessions.byId[id]?.projections?.values;
    const active=values?.agentTeam?.tasks?.find(t=>t.status==='in_progress');if(active)return active.subject;
  }
  const rows=botSessions(bot,sessions),last=rows.at(-1);return last?(sessions.projectionsBySession[last.sessionId]?.values.title??last.projections?.values?.title??'新任务'):'暂无任务';
}
export function botTone(id){let hash=0;for(const char of id)hash=(hash*31+char.charCodeAt(0))>>>0;return ['violet','blue','green','orange'][hash%4];}
export function newBotTaskRequest(bot,workspaces){
  const normalize=value=>value?.replaceAll('\\','/').replace(/\/$/,'').toLocaleLowerCase();
  const workspace=workspaces.items.find(w=>normalize(w.path)===normalize(bot.cwd));
  return {...(workspace?{workspaceId:workspace.workspaceId}:{cwd:bot.cwd}),...(bot.agentPreset?{agentPreset:bot.agentPreset}:{})};
}

/** One shared subscription for the sidebar and right panel. Never polls or writes names from the browser. */
export function createBotCatalog({fetcher=globalThis.fetch,eventSource=url=>new EventSource(url),windowTarget=globalThis.window}={}){
  const listeners=new Set();let snapshot={status:'idle',bots:[],revision:0},controller=null,events=null,epoch=0,started=false,pending=null,again=false;
  const publish=value=>{snapshot=value;for(const listener of listeners)listener();};
  const stopEvents=()=>{events?.close();events=null;};
  const refresh=()=>{
    if(!started)return Promise.resolve();
    if(pending){again=true;return pending;}
    const generation=epoch;controller=new AbortController();publish({...snapshot,status:'loading'});
    pending=Promise.resolve().then(async()=>{
      do{
        again=false;
        try{
          const response=await fetcher('/naumi/bots',{method:'GET',credentials:'same-origin',cache:'no-store',signal:AbortSignal.any([controller.signal,AbortSignal.timeout(8000)])});
          if(generation!==epoch)return;
          if(!response.ok){if(response.status===401||response.status===403){stopEvents();publish({status:'forbidden',bots:[],revision:0});}else publish({...snapshot,status:'error'});return;}
          const value=await response.json();if(generation!==epoch)return;
          if(value.version!==1||!Array.isArray(value.bots))throw Error('BOT_DIRECTORY_INVALID');
          publish({status:'ready',bots:value.bots,revision:value.revision,primaryBotId:value.primaryBotId??null,primarySetup:value.primarySetup??null,creations:value.creations??[]});
          if(started&&!events){events=eventSource('/naumi/bots/events');events.onmessage=()=>void refresh();events.onerror=()=>{if(started&&generation===epoch){stopEvents();publish({...snapshot,status:'error'});void refresh();}};}
        }catch(error){if(generation===epoch&&!controller.signal.aborted)publish({...snapshot,status:'error'});}
      }while(again&&generation===epoch);
    }).finally(()=>{if(generation===epoch)pending=null;});return pending;
  };
  const focus=()=>{if(started)void refresh();};
  return {
    getSnapshot:()=>snapshot,
    subscribe(listener){listeners.add(listener);if(!started){started=true;epoch++;windowTarget?.addEventListener('focus',focus);void refresh();}return()=>{listeners.delete(listener);if(listeners.size===0){started=false;epoch++;controller?.abort();stopEvents();pending=null;again=false;windowTarget?.removeEventListener('focus',focus);snapshot={status:'idle',bots:[],revision:0};}};},
    refresh,
    async primary(body){
      const response=await fetcher('/naumi/bots',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-naumi-bots':'1'},body:JSON.stringify(body),signal:AbortSignal.timeout(30000)});
      const value=await response.json().catch(()=>({error:'BOT_PRIMARY_UNAVAILABLE'}));await refresh();if(!response.ok)throw Error(value.error??'BOT_PRIMARY_UNAVAILABLE');return value;
    },
    async appearance(bot,appearance){
      const response=await fetcher('/naumi/bots',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-naumi-bots':'1'},body:JSON.stringify({action:'appearance',botId:bot.id,expectedRevision:bot.revision,appearance}),signal:AbortSignal.timeout(12000)});
      const value=await response.json().catch(()=>({error:'BOT_APPEARANCE_FAILED'}));if(!response.ok){await refresh();throw Error(value.error??'BOT_APPEARANCE_FAILED');}await refresh();return value;
    },
    async bind(bot,sessionId){
      const response=await fetcher('/naumi/bots',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json','x-naumi-bots':'1'},body:JSON.stringify({action:'bind',botId:bot.id,sessionId,expectedRevision:bot.revision}),signal:AbortSignal.timeout(12000)});
      const value=await response.json().catch(()=>({error:response.status===401||response.status===403?'BOT_AUTH_REQUIRED':'BOT_BIND_FAILED'}));if(!response.ok){await refresh();throw Error(value.error??'BOT_BIND_FAILED');}await refresh();return value;
    },
  };
}
let shared;
export function botCatalog(){return shared??=createBotCatalog();}

/** Success messages expire; drag guidance/errors have their own lifetime. */
export function transientDragNotice(publish,{schedule=setTimeout,cancel=clearTimeout}={}){
 let timer=null;const clear=()=>{if(timer!==null)cancel(timer);timer=null;};
 return {set(value){clear();publish(value);if(['群聊已创建','成员已加入群聊','顺序已保存'].includes(value))timer=schedule(()=>{timer=null;publish('');},3000);},dispose:clear};
}

export function archivedBotRows(bots,pinned=null){return bots.filter(bot=>bot.status==='archived').map(bot=>({kind:'bot',id:bot.id,bot,name:bot.name,pinned:bot.id===pinned}));}
