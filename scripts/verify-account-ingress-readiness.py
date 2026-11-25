import ast,threading,http.server,tempfile,pathlib,json,os,time,urllib.request,urllib.error
source=pathlib.Path('scripts/deploy-account-models47.py').read_text(encoding='utf8');module=ast.parse(source);functions=[x for x in module.body if isinstance(x,ast.FunctionDef) and x.name in ['atomic','request','wait_public_health']];assert len(functions)==3;ns=globals();exec(compile(ast.Module(body=functions,type_ignores=[]),'exact-deploy-functions','exec'),ns)
class H(http.server.BaseHTTPRequestHandler):
 count=0
 def do_GET(self):
  H.count+=1;self.send_response(404 if H.count==1 else 200);self.end_headers();self.wfile.write(b'<html>old route</html>' if H.count==1 else b'{"product":"Naumi Account Models","protocol":1}')
 def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(('127.0.0.1',0),H);threading.Thread(target=server.serve_forever,daemon=True).start()
try:
 with tempfile.TemporaryDirectory() as d:
  wait_public_health('http://127.0.0.1:'+str(server.server_port),pathlib.Path(d));v=json.loads((pathlib.Path(d)/'PUBLIC_HEALTH_READINESS.json').read_text());assert v['observations']==[{'status':404,'validJSON':False},{'status':200,'validJSON':True}];print('INGRESS_READINESS_PASS html404_then_json200 readOnlyGET=2 writesReplayed=0')
finally:server.shutdown();server.server_close()
