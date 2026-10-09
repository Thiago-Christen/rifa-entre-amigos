import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const ctx={window:{}};
vm.runInNewContext(await readFile(new URL('../public/config.js',import.meta.url),'utf8'),ctx);
const c=ctx.window.RIFA_CONFIG;
for(const [path,method,body] of [['/rest/v1/rpc/get_numbers','POST',{}],['/auth/v1/settings','GET']]) {
  const res=await fetch(c.supabaseUrl+path,{method,headers:{apikey:c.supabasePublicKey,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await res.json();
  if(path.endsWith('get_numbers')) console.log(JSON.stringify({endpoint:path,status:res.status,numbers:Array.isArray(data)?data.length:null,states:Array.isArray(data)?[...new Set(data.map(r=>r.status))]:null,error:data.message}));
  else if(path.endsWith('settings')) console.log(JSON.stringify({endpoint:path,status:res.status,settings:data}));
}
