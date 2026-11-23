import {fault} from './registry.mjs';
/** The provider's protocol terminal frame, not socket EOF, ends a model operation.
 * No terminal is synthesized: incomplete/error streams remain UNKNOWN. */
export class AccountModelStream{
 constructor(api){if(!['openai-completions','openai-responses','anthropic-messages'].includes(api))throw fault('ACCOUNT_MODEL_PROTOCOL_INVALID');this.api=api;this.decoder=new TextDecoder();this.pending='';this.data=[];this.event='';this.complete=false;this.bytes=0;this.frameBytes=0;}
 push(chunk){this.bytes+=chunk.length;if(this.bytes>32*1024*1024)throw fault('ACCOUNT_MODEL_RESPONSE_TOO_LARGE',502);this.pending+=this.decoder.decode(chunk,{stream:true});if(this.pending.length>2*1024*1024)throw fault('ACCOUNT_MODEL_RESPONSE_TOO_LARGE',502);
 for(;;){const i=this.pending.indexOf('\n');if(i<0||this.complete)break;let line=this.pending.slice(0,i);this.pending=this.pending.slice(i+1);if(line.endsWith('\r'))line=line.slice(0,-1);this.frameBytes+=line.length;if(this.frameBytes>2*1024*1024)throw fault('ACCOUNT_MODEL_RESPONSE_TOO_LARGE',502);if(!line){this.dispatch();this.data=[];this.event='';this.frameBytes=0;continue;}if(line.startsWith(':'))continue;const colon=line.indexOf(':'),field=colon<0?line:line.slice(0,colon);let value=colon<0?'':line.slice(colon+1);if(value.startsWith(' '))value=value.slice(1);if(field==='data')this.data.push(value);else if(field==='event')this.event=value;}
 return this.complete;
 }
 dispatch(){if(!this.data.length)return;const text=this.data.join('\n');if(this.event==='error')throw fault('ACCOUNT_MODEL_UPSTREAM_INVALID',502);if(this.api==='openai-completions'&&text.trim()==='[DONE]'){this.complete=true;return;}let value;try{value=JSON.parse(text);}catch{throw fault('ACCOUNT_MODEL_UPSTREAM_INVALID',502);}if(value.error||['error','response.failed','response.incomplete'].includes(value.type))throw fault('ACCOUNT_MODEL_UPSTREAM_INVALID',502);if(this.api==='anthropic-messages'&&value.type==='message_stop'||this.api==='openai-responses'&&value.type==='response.completed'){if(value.response?.status&&value.response.status!=='completed')throw fault('ACCOUNT_MODEL_UPSTREAM_INVALID',502);this.complete=true;}}
 finish(){if(!this.complete)throw fault('ACCOUNT_MODEL_UPSTREAM_INCOMPLETE',502);}
}
