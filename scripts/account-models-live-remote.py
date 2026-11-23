"""Pinned, short-lived real-supplier test process. Does not publish routes or restart services."""
import sys,json,pathlib,subprocess,hashlib,contextlib,fcntl,argparse,ipaddress,signal
p=argparse.ArgumentParser();p.add_argument('--run',required=True);p.add_argument('--bundle',required=True);p.add_argument('--sha',required=True);a=p.parse_args()
assert len(a.run)==36 and all(c in '0123456789abcdef-' for c in a.run)
bundle=pathlib.Path(a.bundle);assert bundle.name=='live-host.mjs';assert hashlib.sha256(bundle.read_bytes()).hexdigest()==a.sha
try:
 with contextlib.ExitStack() as stack:
  def timed_out(*_):raise TimeoutError('DEPLOYMENT_LOCK_BUSY')
  signal.signal(signal.SIGALRM,timed_out);signal.alarm(20)
  for f in ['/opt/naumi-staging/releases/deploy.lock','/opt/naumi-reverse-hub/releases/deploy.lock','/opt/reference-workbench/deploy.lock']:
   h=stack.enter_context(open(f,'a'));fcntl.flock(h,fcntl.LOCK_EX)
  signal.alarm(0)
  rows=subprocess.check_output(['docker','ps','--format','{{.Names}}']).decode().splitlines();webs=[n for n in rows if n.startswith('naumi47-web-')];assert len(webs)==1
  web=webs[0];info=json.loads(subprocess.check_output(['docker','inspect',web]))[0];targetHost=next(n['IPAddress'] for n in info['NetworkSettings']['Networks'].values() if n['IPAddress']);assert ipaddress.ip_address(targetHost).is_private
  print(json.dumps({'type':'transport','targetHost':targetHost}),flush=True)
  before={n:json.loads(subprocess.check_output(['docker','inspect',n]))[0]['State']['StartedAt'] for n in rows}
  gate=pathlib.Path('/etc/nginx/sites-available/reference-workbench');gatehash=hashlib.sha256(gate.read_bytes()).hexdigest();target='/tmp/naumi-account-models-live-'+a.run+'.mjs'
  subprocess.run(['docker','cp',str(bundle),web+':'+target],check=True,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
  try:
   r=subprocess.run(['docker','exec','-i','-e','NODE_OPTIONS=','-e','NAUMI_LIVE_RUN_ID='+a.run,'-e','NAUMI_LIVE_SUPPLIER_ACK=user-20261123',web,'node',target],stdin=sys.stdin,stdout=sys.stdout,stderr=sys.stderr)
  finally:
   subprocess.run(['docker','exec','-u','0',web,'rm','-f',target],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
   unchanged=all(json.loads(subprocess.check_output(['docker','inspect',n]))[0]['State']['StartedAt']==v for n,v in before.items())
   print(json.dumps({'type':'remote-cleanup','containersUnchanged':unchanged,'gatewayUnchanged':hashlib.sha256(gate.read_bytes()).hexdigest()==gatehash,'sourceWeb':web,'publicServiceDeployed':False}),flush=True)
  sys.exit(r.returncode)
except (BlockingIOError,TimeoutError):
 print(json.dumps({'type':'not-started','error':'DEPLOYMENT_LOCK_BUSY','lock':f,'modelCalls':0}),flush=True);sys.exit(75)
