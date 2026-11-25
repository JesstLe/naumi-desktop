import {openBotOverview,BOT_OVERVIEW_PANEL,selectedBotId} from './bot-overview.js';
import {createBotAvatar} from './bot-avatar.js';
import {EXPERIENCE_EVENT,EXPERIENCE_ACTIONS,advancedEmployeeAccess} from './employee-experience-model.js';
import {taskActivity,employeeTaskState,employeeTasks,receptionTarget} from './bot-task-model.js';
import {MODE_KEY,transientDragNotice,navigationMode,botActivity,botSummary,botTone,botCatalog,currentSessionId,botSelected,createThreadVisibility,archivedBotRows} from './bot-sidebar-model.js';
import {CHAT_PANEL,CHAT_EVENT,PIN_KEY,ORDER_KEY,pendingBotGroup,readBotOrder,writeBotOrder,reorderBotIds,groupBotIds,groupRequest,groupError,groupCatalog,conversationRows,roomPreview,roomWorking} from './bot-chat-model.js';
import {PRIMARY_PANEL,CREATE_BOT_EVENT,primaryBot,enterBotMode} from './primary-bot.js';

export function installBotSidebar(ctx,React,Icon,createPortal){
  return ctx.inject(['remote.session','uiWorkspace','sessions','workspaces'],scope=>installNavigation(scope,React,Icon,createPortal));
}
function installNavigation(ctx,React,Icon,createPortal){
  const h=React.createElement,{useState,useEffect,useLayoutEffect,useRef,useSyncExternalStore}=React,source=botCatalog(),activity=taskActivity(),groups=groupCatalog(),Avatar=createBotAvatar(React);
  const visibility=createThreadVisibility({catalog:source,activity,groups,sessions:ctx.sessions.list,workspaces:ctx.workspaces.list});
  ctx.effect(()=>ctx.uiWorkspace.registerSidebarVisibility?.(visibility));
  function BotRow({bot,props,pinned,onPin,primary=false,dragProps={},folderPreview=null}){
    const {useSessions,useSessionStatus,usePanelInfo,useWorkspaces}=props;
    const sessions=useSessions(s=>s),status=useSessionStatus(s=>s),workspaces=useWorkspaces(s=>s),panelId=usePanelInfo(s=>s.activePanelId),currentId=currentSessionId(sessions,panelId);
    const [error,setError]=useState(null),[menu,setMenu]=useState(null),[advanced,setAdvanced]=useState(false),menuButton=useRef(null),menuRef=useRef(null);
    useEffect(()=>{if(!menu)return;const abort=new AbortController();setAdvanced(false);void advancedEmployeeAccess(globalThis.fetch,abort.signal).then(value=>{if(!abort.signal.aborted)setAdvanced(value);});menuRef.current?.querySelector('button')?.focus({preventScroll:true});const close=()=>setMenu(null),pointer=e=>{if(!menuRef.current?.contains(e.target)&&!menuButton.current?.contains(e.target))close();},key=e=>{if(e.key==='Escape'){e.preventDefault();close();menuButton.current?.focus({preventScroll:true});}else if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){const buttons=[...menuRef.current.querySelectorAll('button')],index=buttons.indexOf(document.activeElement),next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;e.preventDefault();buttons[next]?.focus({preventScroll:true});}else if(e.key==='Tab')close();};document.addEventListener('pointerdown',pointer);document.addEventListener('keydown',key);window.addEventListener('resize',close);window.addEventListener('wheel',close,{passive:true});return()=>{abort.abort();document.removeEventListener('pointerdown',pointer);document.removeEventListener('keydown',key);window.removeEventListener('resize',close);window.removeEventListener('wheel',close);};},[menu]);
    const openSettings=mode=>{setMenu(null);window.dispatchEvent(new CustomEvent(EXPERIENCE_EVENT,{detail:{bot,mode}}));};
    const jobs=useSyncExternalStore(activity.subscribe,activity.getSnapshot,activity.getSnapshot);
    const target=receptionTarget(bot,jobs.tasks,sessions,workspaces),state=jobs.status==='ready'?employeeTaskState(bot,jobs.tasks,botActivity(bot,sessions,status)):botActivity(bot,sessions,status);
    const active=employeeTasks(bot,jobs.tasks).active.filter(t=>t.targetBotId===bot.id);
    const stateName=bot.status==='archived'?'已归档':{running:'工作中',starting:'准备中',waiting:'待你确认',queued:'排队中',idle:'待命',unknown:'待同步'}[state];
    const open=id=>{setError(null);try{ctx.layout.beginNavigation?.();ctx.uiWorkspace.openSession(id);}catch{setError('任务暂未就绪');}};
    return h('div',{className:'naumi-bot-entry','data-bot-id':bot.id,'data-primary':primary,'data-pinned':!!pinned,'data-selected':panelId===BOT_OVERVIEW_PANEL?selectedBotId()===bot.id:botSelected(bot,currentId,sessions),'data-bot-state':state,...dragProps},
      h('div',{className:'naumi-bot-row'},h('button',{type:'button',className:'naumi-bot-open',onClick:()=>target?open(target):setError('主聊天暂未就绪'),'aria-label':bot.name+'，'+stateName,title:bot.name},h(Avatar,{bot,state}),h('span',{className:'naumi-bot-caption'},h('strong',null,bot.name),h('span',null,state!=='idle'&&state!=='unknown'?stateName:botSummary(bot,sessions))),state!=='idle'&&state!=='unknown'&&h('span',{className:'naumi-bot-state',title:stateName,'aria-label':stateName})),
        active.length>0&&h('button',{type:'button',className:'naumi-bot-current','aria-label':'查看'+bot.name+'的当前任务（'+active.length+'）',title:'查看当前任务',onClick:()=>openBotOverview(ctx,bot.id)},active.length),
        h('button',{ref:menuButton,type:'button',className:'naumi-bot-menu-toggle','aria-label':bot.name+'的设置','aria-haspopup':'menu','aria-expanded':!!menu,onClick:e=>{const r=e.currentTarget.getBoundingClientRect();setMenu(v=>v?null:{left:Math.max(8,Math.min(window.innerWidth-205,r.left)),top:Math.max(8,Math.min(window.innerHeight-240,r.bottom+5))});}},'⋯'),h('button',{type:'button',className:'naumi-bot-history-toggle','aria-label':bot.name+'的任务记录',title:'任务',onClick:()=>openBotOverview(ctx,bot.id)},'任务')),
      folderPreview,
      menu&&createPortal(h('div',{ref:menuRef,className:'nx-bot-menu',role:'menu','aria-label':bot.name+'的设置',style:menu},h('button',{type:'button',role:'menuitem',onClick:()=>{onPin(pinned?null:bot.id);setMenu(null);}},pinned?'取消置顶':'置顶'),[...EXPERIENCE_ACTIONS,...(advanced?[['advanced','高级管理']]:[])].map(([mode,label])=>h('button',{type:'button',key:mode,role:'menuitem','data-advanced':mode==='advanced'||undefined,onClick:()=>openSettings(mode)},label))),document.body),
      error&&h('div',{className:'naumi-bot-error',role:'alert'},error));
  }
  function Navigation(props){
      const [mode,setMode]=useState(()=>{try{return navigationMode(localStorage.getItem(MODE_KEY));}catch{return 'threads';}}),[search,setSearch]=useState(''),[archived,setArchived]=useState(false),[error,setError]=useState(null);
      const [pinned,setPinned]=useState(()=>{try{return localStorage.getItem(PIN_KEY);}catch{return null;}}),[adding,setAdding]=useState(false),addRef=useRef(null),lastNative=useRef(null),entryIntent=useRef(0),threadReturn=useRef(null);
      const [order,setOrder]=useState(()=>readBotOrder()),[selected,setSelected]=useState([]),[drop,setDrop]=useState(null),[busy,setBusy]=useState(false),[dragNotice,publishDragNotice]=useState(''),[retry,setRetry]=useState(()=>pendingBotGroup());
      const notice=useRef(null);notice.current??=transientDragNotice(publishDragNotice);const setDragNotice=value=>notice.current.set(value);
      useEffect(()=>()=>notice.current.dispose(),[]);
      const [arrived,setArrived]=useState(null);
      useEffect(()=>{if(!arrived)return;const timer=setTimeout(()=>setArrived(null),640);return()=>clearTimeout(timer);},[arrived]);
      const dragging=useRef(null),dropRef=useRef(null),mutation=useRef(null),flight=useRef(false),anchor=useRef(null),alive=useRef(true);
      useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
      const roomState=useSyncExternalStore(groups.subscribe,groups.getSnapshot,groups.getSnapshot),panel=props.usePanelInfo(s=>s.activePanelId),sessions=props.useSessions(s=>s);
      const ownership=useSyncExternalStore(visibility.subscribe,visibility.getSnapshot,visibility.getSnapshot),hiddenSessions=new Set(ownership.sessionIds);
      const sessionId=currentSessionId(sessions,panel);if(sessionId&&!ownership.waiting&&!hiddenSessions.has(sessionId))lastNative.current=sessionId;
      // Catalog/task refreshes classify sidebar rows; they do not navigate or change user mode.
      useEffect(()=>{if(threadReturn.current===sessionId||threadReturn.current==='panel'&&panel!==null)threadReturn.current=null;},[sessionId,panel]);
      const [surface,setSurface]=useState(null),[wide,setWide]=useState(true);
      const catalog=useSyncExternalStore(source.subscribe,source.getSnapshot,source.getSnapshot);
      useLayoutEffect(()=>{
        let target=null,resize=null,children=null,disposed=false;
        const detach=()=>{resize?.disconnect();children?.disconnect();if(target){target.classList.remove('naumi-navigation');delete target.dataset.naumiNavSurface;delete target.dataset.navigationMode;delete target.dataset.wide;for(const child of target.children)delete child.dataset.naumiThreadContent;}};
        const find=()=>{
          if(disposed||target?.isConnected)return;
          const next=document.querySelector('[data-slot="sidebar.workspaces"]');if(next===target)return;
          detach();target=next;setSurface(next);if(!target)return;
          target.classList.add('naumi-navigation');target.dataset.naumiNavSurface='true';
          const mark=()=>{for(const child of target.children)if(!child.hasAttribute('data-naumi-navigation-owned'))child.dataset.naumiThreadContent='true';};
          mark();children=new MutationObserver(mark);children.observe(target,{childList:true});
          const measure=()=>setWide(target.getBoundingClientRect().width>=100);resize=new ResizeObserver(measure);resize.observe(target);measure();
        };
        find();const observer=new MutationObserver(find);observer.observe(document.getElementById('root')??document.body,{childList:true,subtree:true});
        return()=>{disposed=true;observer.disconnect();detach();};
      },[]);
      useLayoutEffect(()=>{if(surface){surface.dataset.navigationMode=mode;surface.dataset.wide=String(wide);}},[surface,mode,wide]);
      // Another window's navigation preference must not redirect this active conversation.
      const choose=(value,enter=true)=>{const intent=++entryIntent.current,navigation=value==='bot'&&enter?ctx.layout.beginNavigation?.():null;threadReturn.current=value==='threads'?(lastNative.current??'panel'):null;setMode(value);setAdding(false);try{localStorage.setItem(MODE_KEY,value);}catch{}
        if(value==='threads'&&([CHAT_PANEL,PRIMARY_PANEL,BOT_OVERVIEW_PANEL].includes(panel)||sessionId&&hiddenSessions.has(sessionId))){if(lastNative.current&&!hiddenSessions.has(lastNative.current))ctx.uiWorkspace.openSession(lastNative.current);else ctx.layout.selectPanel('naumi-workbench');}
        if(value==='bot'&&enter)void source.refresh().then(()=>{if(entryIntent.current===intent&&!navigation?.aborted)return enterBotMode(ctx,source.getSnapshot());}).catch(()=>setError('目录尚未读取，请重试。'));
      };
      // Primary setup is entered only by an explicit Bot action, never a background refresh.
      useEffect(()=>{const change=()=>choose('bot',false);window.addEventListener(CHAT_EVENT,change);return()=>window.removeEventListener(CHAT_EVENT,change);},[panel]);
      useEffect(()=>{if(!adding)return;const close=e=>{if(e.type==='keydown'&&e.key!=='Escape')return;if(e.type!=='keydown'&&addRef.current?.contains(e.target))return;setAdding(false);};document.addEventListener('pointerdown',close);document.addEventListener('keydown',close);return()=>{document.removeEventListener('pointerdown',close);document.removeEventListener('keydown',close);};},[adding]);
      const pin=id=>{setPinned(id);try{if(id)localStorage.setItem(PIN_KEY,id);else localStorage.removeItem(PIN_KEY);}catch{}};
      const bots=catalog.bots.filter(bot=>bot.status===(archived?'archived':'active')&&(!search||bot.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())));
      const allRows=archived?archivedBotRows(catalog.bots,pinned):conversationRows(catalog.bots,roomState.rooms,'',pinned,order);
      if(!order.length)allRows.sort((a,b)=>Number(b.id===catalog.primaryBotId)-Number(a.id===catalog.primaryBotId));
      const rows=allRows.filter(row=>!search||row.name.toLocaleLowerCase().includes(search.toLocaleLowerCase())),orderedIds=allRows.filter(r=>r.kind==='bot').map(r=>r.id);
      const saveOrder=value=>{setOrder(writeBotOrder(value));pin(null);};
      useEffect(()=>{const change=e=>{if(e.key===ORDER_KEY)setOrder(readBotOrder());};window.addEventListener('storage',change);return()=>window.removeEventListener('storage',change);},[]);
      useEffect(()=>{const escape=e=>{if(e.key==='Escape'){dragging.current=null;dropRef.current=null;setDrop(null);setSelected([]);setDragNotice('');}};document.addEventListener('keydown',escape);return()=>document.removeEventListener('keydown',escape);},[]);
      const runGroup=async command=>{
        if(flight.current)return;flight.current=true;pendingBotGroup(command);setBusy(true);setError(null);setRetry(null);
        try{const room=await groupRequest(undefined,{body:command});pendingBotGroup(null);if(!alive.current)return;mutation.current=null;setSelected([]);setArrived(room.id);setDragNotice(command.action==='create'?'群聊已创建':'成员已加入群聊');if(command.action==='create')groups.created(ctx,room);else{groups.renamed(room);groups.select(ctx,room.id);}}
        catch(e){if(alive.current){setError(groupError(e));setRetry(command);}}
        finally{flight.current=false;if(alive.current)setBusy(false);}
      };
      const finishDrop=(target,zone,ids)=>{
        if(!ids?.length||flight.current)return;
        if(retry){setError('先重试保存上一项群操作。');return;}
        if(zone!=='group'&&target.kind==='bot'){saveOrder(reorderBotIds(orderedIds,ids,target.id,zone==='before'));setSelected([]);setDragNotice('顺序已保存');return;}
        const members=target.kind==='bot'?groupBotIds(ids,target.id):ids;
        if(target.kind==='bot'&&members.length<2)return;
        const room=target.room,primaryId=catalog.primaryBotId,unique=new Set([...(room?.members.map(m=>m.botId)??[]),...members,...primaryId?[primaryId]:[]]);
        if(unique.size>12){setError('群组最多容纳 12 位成员。');return;}
        const fingerprint=JSON.stringify([target.kind,target.id,members]);
        if(mutation.current?.fingerprint!==fingerprint){const id=crypto.randomUUID(),name=members.map(id=>catalog.bots.find(b=>b.id===id)?.name).filter(Boolean).join('、').slice(0,80);mutation.current={fingerprint,command:target.kind==='bot'?{action:'create',id,name,botIds:members,defaultBotId:primaryId??null}:{action:'add-members',operationId:id,roomId:target.id,botIds:members}};}
        void runGroup(mutation.current.command);
      };
      const dragProps=row=>({
        draggable:row.kind==='bot'&&!busy,'data-drag-selected':selected.includes(row.id),'data-drop-zone':drop?.id===row.id?drop.zone:undefined,'data-drag-source':dragging.current?.includes(row.id)||undefined,'data-folder-arrived':arrived===row.id||undefined,
        onClickCapture:e=>{if(row.kind!=='bot'||!e.target.closest('.naumi-bot-open'))return;if(e.ctrlKey||e.metaKey||e.shiftKey){e.preventDefault();e.stopPropagation();const visible=rows.filter(r=>r.kind==='bot').map(r=>r.id);if(e.shiftKey&&anchor.current&&visible.includes(anchor.current)){const a=visible.indexOf(anchor.current),b=visible.indexOf(row.id);setSelected([...new Set([...selected,...visible.slice(Math.min(a,b),Math.max(a,b)+1)])]);}else{setSelected(v=>v.includes(row.id)?v.filter(id=>id!==row.id):[...v,row.id]);anchor.current=row.id;}}else setSelected([]);},
        onDragStart:e=>{if(row.kind!=='bot'||flight.current||e.target.closest('.naumi-bot-menu-toggle,.naumi-bot-history-toggle,.naumi-bot-current')){e.preventDefault();return;}const ids=selected.includes(row.id)?orderedIds.filter(id=>selected.includes(id)):[row.id];dragging.current=ids;if(selected.length<2)setSelected(ids);setDragNotice(ids.length>1?'拖动 '+ids.length+' 位 Bot':'');e.dataTransfer.effectAllowed='move';e.dataTransfer.setData('application/x-naumi-bots',JSON.stringify(ids));e.dataTransfer.setData('text/plain',row.name);const avatar=e.currentTarget.querySelector('.naumi-bot-avatar');if(avatar){const r=avatar.getBoundingClientRect();e.dataTransfer.setDragImage(avatar,r.width/2,r.height/2);}},
        onDragOver:e=>{const ids=dragging.current;if(!ids?.length||flight.current||row.kind==='bot'&&ids.includes(row.id))return;e.preventDefault();e.dataTransfer.dropEffect='move';const rect=e.currentTarget.getBoundingClientRect(),ratio=(e.clientY-rect.top)/rect.height,zone=row.kind==='group'?'group':ratio<.24?'before':ratio>.76?'after':'group',next={id:row.id,zone};dropRef.current=next;setDrop(v=>v?.id===next.id&&v.zone===next.zone?v:next);const scroller=surface?.querySelector('.naumi-bot-navigation');if(scroller){const r=scroller.getBoundingClientRect();if(e.clientY<r.top+32)scroller.scrollTop-=12;if(e.clientY>r.bottom-32)scroller.scrollTop+=12;}},
        onDragLeave:e=>{const r=e.currentTarget.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom){dropRef.current=null;setDrop(null);}},
        onDrop:e=>{const ids=dragging.current;if(!ids?.length||row.kind==='bot'&&ids.includes(row.id))return;e.preventDefault();e.stopPropagation();const r=e.currentTarget.getBoundingClientRect(),ratio=(e.clientY-r.top)/r.height,zone=row.kind==='group'?'group':ratio<.24?'before':ratio>.76?'after':'group';dragging.current=null;dropRef.current=null;setDrop(null);finishDrop(row,zone,ids);},
        onDragEnd:()=>{dragging.current=null;dropRef.current=null;setDrop(null);},
        onKeyDown:e=>{if(row.kind==='bot'&&e.altKey&&['ArrowUp','ArrowDown'].includes(e.key)){const i=orderedIds.indexOf(row.id),other=orderedIds[i+(e.key==='ArrowUp'?-1:1)];if(other){e.preventDefault();saveOrder(reorderBotIds(orderedIds,[row.id],other,e.key==='ArrowUp'));setDragNotice('顺序已保存');}}},
      });
      const folderPreview=row=>{
        if(drop?.id!==row.id||drop.zone!=='group'||!dragging.current?.length)return null;
        const ids=[...new Set([...(row.kind==='group'?row.room.members.map(m=>m.botId):[row.id]),...dragging.current])],members=ids.map(id=>catalog.bots.find(b=>b.id===id)).filter(Boolean);
        return h('span',{className:'naumi-folder-preview','aria-hidden':true,'data-preview-count':members.length},members.slice(0,4).map((bot,index)=>h('span',{key:bot.id,className:'naumi-folder-cell',style:{'--folder-index':index}},h(Avatar,{bot,staticPreview:true}))),members.length>4&&h('i',{className:'naumi-folder-count'},members.length));
      };
      const create=()=>{setError(null);if(!primaryBot(catalog)){void enterBotMode(ctx,catalog).catch(()=>setError('目录尚未读取，请重试。'));return;}window.dispatchEvent(new CustomEvent(CREATE_BOT_EVENT));};
      if(!surface)return null;
      return createPortal(h(React.Fragment,null,
        h('div',{className:'naumi-navigation-switch','data-naumi-navigation-owned':true,role:'group','aria-label':'导航模式'},h('button',{type:'button','aria-pressed':mode==='threads',onClick:()=>choose('threads'),title:'线程模式'},wide?'线程':h(Icon,{name:'chat',size:16})),h('button',{type:'button','aria-pressed':mode==='bot',onClick:()=>choose('bot'),title:'Bot 模式'},wide?'Bot':h(Icon,{name:'spark',size:16}))),
        mode==='threads'&&ownership.waiting&&h('div',{'data-naumi-navigation-owned':true,className:'naumi-bot-error',role:'status'},ownership.error?'会话分类读取失败':'正在读取会话…',ownership.error&&h('button',{type:'button',className:'naumi-bot-link',onClick:()=>{void source.refresh();void activity.refresh();void groups.refresh();}},'重试')),
        h('div',{className:'naumi-bot-navigation','data-naumi-navigation-owned':true,hidden:mode!=='bot'},h('div',{className:'naumi-bot-toolbar',ref:addRef},wide&&h('label',{className:'naumi-bot-search'},h(Icon,{name:'search',size:14}),h('input',{'aria-label':'搜索对话',placeholder:'搜索',value:search,onChange:e=>setSearch(e.target.value)})),h('button',{type:'button',className:'naumi-bot-add','aria-label':'新建对话','aria-haspopup':'menu','aria-expanded':adding,onClick:()=>setAdding(v=>!v)},'+'),adding&&h('div',{className:'naumi-chat-add-menu',role:'menu'},h('button',{type:'button',role:'menuitem',onClick:()=>{setAdding(false);create();}},'新增员工'),h('button',{type:'button',role:'menuitem',onClick:()=>{setAdding(false);if(primaryBot(catalog))groups.select(ctx,roomState.selected,{create:true});else enterBotMode(ctx,catalog);}},'新建群聊'),h('button',{type:'button',role:'menuitem',onClick:()=>{setAdding(false);setArchived(v=>!v);}},archived?'查看在岗 Bot':'查看已归档 Bot'))),
          catalog.status==='loading'&&catalog.bots.length===0&&h('p',{className:'naumi-bot-empty',role:'status'},wide?'读取中…':'…'),
          ['error','forbidden'].includes(catalog.status)&&h('div',{className:'naumi-bot-error',role:'alert'},wide?(catalog.status==='forbidden'?'请重新连接工作空间':'Bot 目录读取失败'):'!',h('button',{type:'button',className:'naumi-bot-link',onClick:()=>source.refresh()},'重试')),
          catalog.status==='ready'&&bots.length===0&&h('div',{className:'naumi-bot-empty',role:'status'},wide&&h('span',null,search?'没有匹配的 Bot':archived?'暂无已归档 Bot':'暂无 Bot'),!search&&!archived&&wide&&h('button',{type:'button',className:'naumi-bot-create',onClick:create},primaryBot(catalog)?'创建 Bot':'创建主 Bot')),
          (selected.length>1||busy)&&h('div',{className:'naumi-drag-selection'},h('span',null,busy?'正在保存…':'已选 '+selected.length+' 位'),!busy&&h('button',{type:'button',onClick:()=>finishDrop({kind:'bot',id:selected[0]},'group',selected)},'建群'),!busy&&h('button',{type:'button','aria-label':'取消选择',onClick:()=>setSelected([])},'×')),
          h('span',{className:'naumi-drag-notice',role:'status','aria-live':'polite'},dragNotice),
          retry&&h('button',{type:'button',className:'naumi-bot-link',disabled:busy,onClick:()=>runGroup(retry)},'重试保存'),
          roomState.status==='error'&&h('button',{type:'button',className:'naumi-bot-link',onClick:()=>groups.refresh()},'群列表重试'),
          rows.map(row=>row.kind==='bot'?h(BotRow,{key:row.id,bot:row.bot,props,pinned:row.pinned,onPin:pin,primary:row.id===catalog.primaryBotId,dragProps:dragProps(row),folderPreview:folderPreview(row)}):h('div',{key:row.id,className:'naumi-bot-entry naumi-group-entry',...dragProps(row),'data-group-id':row.id,'data-selected':panel===CHAT_PANEL&&roomState.selected===row.id,'data-bot-state':roomWorking(roomState.details[row.id])?'running':'idle'},h('button',{type:'button',className:'naumi-bot-open',onClick:()=>groups.select(ctx,row.id),'aria-label':row.name,title:row.name},h('span',{className:'naumi-group-avatar','aria-hidden':true},row.room.members.slice(0,4).map(m=>{const bot=catalog.bots.find(b=>b.id===m.botId);return bot?h(Avatar,{key:m.botId,bot,staticPreview:true}):null;})),h('span',{className:'naumi-bot-caption'},h('strong',null,row.name),h('span',null,roomPreview(row.room,catalog.bots,roomState.details[row.id]))),roomWorking(roomState.details[row.id])&&h('span',{className:'naumi-bot-state','aria-label':'正在协作'})),folderPreview(row))),error&&h('p',{className:'naumi-bot-error',role:'alert'},error))),surface);
  }
  // Additive overlay registration: the native workspace parent keeps sole ownership of all child slots.
  return ctx.slots.inject('shell.overlay',()=>ctx.slots.register({name:'shell.overlay',id:'naumi-navigation-modes',order:90},Navigation));
}
