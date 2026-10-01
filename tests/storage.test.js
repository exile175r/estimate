import test from 'node:test';
import assert from 'node:assert/strict';
import {DriveStorage,validateCatalog} from '../src/storage.js';
import {newQuote,createNode} from '../src/model.js';
function harness(){
 const files=new Map();let next=0,fail=0,delay;
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});if(delay)await delay;if(fail)return new Response('{}',{status:fail});
  const u=new URL(url),id=u.pathname.split('/').at(-1),file=files.get(id);
  const json=(v,status=200,etag)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json',...(etag?{etag}: {})}});
  if(id==='folder')return json({id,name:'견적',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}});
  if(u.pathname.includes('/upload/')&&options.method==='POST'){
   const parts=options.body.split('\r\n\r\n'),meta=JSON.parse(parts[1].split('\r\n--')[0]),value=JSON.parse(parts[2].split('\r\n--')[0]);
   const id='file'+(++next);files.set(id,{...meta,id,value,version:1});return json({id});
  }
  if(id==='files'){
   const q=u.searchParams.get('q');const kind=q.includes("value='quote'")?'quote':'catalog';const entity=q.match(/key='entityId' and value='([^']+)'/);
   return json({files:[...files.values()].filter(f=>!f.trashed&&f.appProperties.kind===kind&&(!entity||f.appProperties.entityId===entity[1])).map(({value,version,...meta})=>meta)});
  }
  if(!file)return json({},404);
  if(options.method==='PATCH'){
   if(options.headers['If-Match']!==String(file.version))return json({},412);
   if(u.pathname.includes('/upload/'))file.value=JSON.parse(options.body);else Object.assign(file,JSON.parse(options.body));
   file.version++;return json({id,trashed:file.trashed});
  }
  return json(u.searchParams.get('alt')==='media'?file.value:{id,parents:file.parents,appProperties:file.appProperties,trashed:file.trashed},200,String(file.version));
 };
 const storage=new DriveStorage({getToken:()=> 'test-token',fetcher});storage.configure('folder');
 return {storage,files,calls,setFail:n=>fail=n,setDelay:p=>delay=p};
}
test('Drive 신규 저장·재조회·수정은 같은 파일을 사용',async()=>{
 const h=harness(),q=newQuote();q.projectName='검증 견적';const first=await h.storage.saveQuote(q);assert.equal(h.files.size,1);assert.deepEqual(await h.storage.loadQuote(first.fileId),q);
 q.projectName='수정';q.status='saved';await h.storage.saveQuote(q);assert.equal(h.files.size,1);assert.equal((await h.storage.loadQuote(first.fileId)).projectName,'수정');assert.equal((await h.storage.listQuotes()).length,1);
});
test('저장 실패는 원본 견적 보존, 성공으로 반환하지 않음',async()=>{for(const code of [401,403,500]){const h=harness(),q=newQuote(),copy=structuredClone(q);h.setFail(code);await assert.rejects(h.storage.saveQuote(q));assert.deepEqual(q,copy);assert.equal(h.files.size,0);}});
test('다른 세션의 수정 또는 불러오지 않은 파일 덮어쓰기 차단',async()=>{
 const h=harness(),q=newQuote();const {fileId}=await h.storage.saveQuote(q);h.files.get(fileId).version++;await assert.rejects(h.storage.saveQuote(q),/다시 불러온/);h.storage.versions.clear();await assert.rejects(h.storage.saveQuote(q),/다시 불러온/);
});
test('단가표 트리 저장 왕복과 휴지통 이동',async()=>{
 const h=harness(),nodes=[];const root=createNode(nodes,'group');createNode(nodes,'item',root.id);await h.storage.saveCatalog(nodes);assert.deepEqual(await h.storage.loadCatalog(),nodes);
 const {fileId}=await h.storage.saveQuote(newQuote());await h.storage.deleteQuote(fileId);assert.equal(h.files.get(fileId).trashed,true);assert.equal((await h.storage.listQuotes()).length,0);
});
test('앱 외부 파일·손상된 트리 차단',async()=>{
 const h=harness();h.files.set('foreign',{id:'foreign',parents:['folder'],appProperties:{app:'other',kind:'quote'},version:1});await assert.rejects(h.storage.loadQuote('foreign'),/파일이 아닙니다/);
 assert.throws(()=>validateCatalog([{id:'x',type:'group',name:'x',active:true,order:0,parentId:'x'}]),/그룹 관계/);
});
test('중복 저장 요청 차단',async()=>{
 const h=harness();let release;h.setDelay(new Promise(resolve=>release=resolve));const first=h.storage.saveQuote(newQuote());await assert.rejects(h.storage.saveQuote(newQuote()),/진행 중/);release();await first;
});
