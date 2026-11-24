'use strict';
const {contextBridge,ipcRenderer,webUtils}=require('electron');
// Native composer contract: only resolve paths from Chromium-backed File objects.
// No arbitrary path lookup, file reads or broad IPC surface is exposed.
contextBridge.exposeInMainWorld('__DSH_HOST_PATHS__',{pathFor:file=>{try{return webUtils.getPathForFile(file);}catch{return '';}}});
const subscribe=(channel,listener)=>{const handler=(_event,value)=>listener(value);ipcRenderer.on(channel,handler);return()=>ipcRenderer.removeListener(channel,handler);};
const browser={
  manage:input=>ipcRenderer.invoke('naumi:browser-manager',input),
  acquire:workspace=>ipcRenderer.invoke('naumi:browser-acquire',workspace),
  release:lease=>ipcRenderer.invoke('naumi:browser-release',lease),
  onOpenRequested:(lease,listener)=>subscribe('naumi:browser-open',value=>{if(value?.lease===lease)listener(value.url);})
};
contextBridge.exposeInMainWorld('naumiDesktop',{
  appVersion:process.argv.find(v=>v.startsWith('--naumi-desktop-version='))?.slice('--naumi-desktop-version='.length)??'',
  runtimeInfo:()=>ipcRenderer.invoke('naumi:runtime-info'),
  version:1,protocolVersion:1,browser,engine:'chromium',
  bindBrowser:value=>ipcRenderer.invoke('naumi:browser-bind',value),
  onBrowserIssue:listener=>subscribe('naumi:browser-issue',listener),
  onToolRequest:listener=>subscribe('naumi:browser-tool-request',listener),
  retry:()=>ipcRenderer.invoke('naumi:retry'),
  connectEnterprise:origin=>ipcRenderer.invoke('naumi:enterprise-connect',origin),
  loginEnterprise:()=>ipcRenderer.invoke('naumi:enterprise-login'),
  connectionState:()=>ipcRenderer.invoke('naumi:connection-state'),
  connectionSettings:()=>ipcRenderer.invoke('naumi:connection-settings'),
  cancelConnection:()=>ipcRenderer.invoke('naumi:connection-cancel'),
  resumeWorkspace:()=>ipcRenderer.invoke('naumi:connection-resume'),
  updateState:()=>ipcRenderer.invoke('naumi:update-state'),
  checkUpdates:()=>ipcRenderer.invoke('naumi:update-check'),
  installUpdate:()=>ipcRenderer.invoke('naumi:update-install'),
  onUpdateState:listener=>subscribe('naumi:update-state',listener),
  openIdentityRegistration:origin=>ipcRenderer.invoke('naumi:identity-register',origin),
  identityState:()=>ipcRenderer.invoke('naumi:identity-state'),
  loginIdentity:value=>ipcRenderer.invoke('naumi:identity-login',value),
  openIdentity:()=>ipcRenderer.invoke('naumi:identity-open'),
  logoutIdentity:()=>ipcRenderer.invoke('naumi:identity-logout'),
  resumeIdentity:()=>ipcRenderer.invoke('naumi:identity-resume'),
  cloud:value=>ipcRenderer.invoke('naumi:cloud',value),
  creation:value=>ipcRenderer.invoke('naumi:creation',value),
  product:'Naumi'
});
