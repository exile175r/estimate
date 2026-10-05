import test from 'node:test';
import assert from 'node:assert/strict';
import {DriveStorage,validateCatalog} from '../src/storage.js';
import {newQuote,createNode} from '../src/model.js';
function harness({etag=true}={}){
 const files=new Map();let next=0,fail=0,delay;
 const calls=[];
 const fetcher=async(url,options)=>{
  calls.push({url,options});if(delay)await delay;if(fail)return new Response('{}',{status:fail});
  const u=new URL(url),id=u.pathname.split('/').at(-1),file=files.get(id);
  const json=(v,status=200,etag)=>new Response(JSON.stringify(v),{status,headers:{'Content-Type':'application/json',...(etag?{etag}: {})}});
  if(id==='folder')return json({id,name:'견적',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}});
  if(id==='files'&&options.method==='POST'&&!u.pathname.includes('/upload/')){
   const meta=JSON.parse(options.body),id='file'+(++next);files.set(id,{...meta,id,version:1});return json({id});
  }
  if(u.pathname.includes('/upload/')&&options.method==='POST'){
   const parts=options.body.split('\r\n\r\n'),meta=JSON.parse(parts[1].split('\r\n--')[0]),value=JSON.parse(parts[2].split('\r\n--')[0]);
   const id='file'+(++next);files.set(id,{...meta,id,value,version:1});return json({id});
  }
  if(id==='files'){
   const q=u.searchParams.get('q'),kind=q.match(/key='kind' and value='([^']+)'/)[1],entity=q.match(/key='entityId' and value='([^']+)'/),parent=q.match(/^'([^']+)' in parents/)[1];
   return json({files:[...files.values()].filter(f=>!f.trashed&&f.parents?.includes(parent)&&f.appProperties.kind===kind&&(!entity||f.appProperties.entityId===entity[1])).map(({value,version,...meta})=>meta)});
  }
  if(!file)return json({},404);
  if(options.method==='PATCH'){
   if(options.headers['If-Match']&&options.headers['If-Match']!==String(file.version))return json({},412);
   if(u.pathname.includes('/upload/'))file.value=options.body instanceof Blob?options.body:JSON.parse(options.body);else Object.assign(file,JSON.parse(options.body));
   if(u.searchParams.has('addParents'))file.parents=[u.searchParams.get('addParents')];
   file.version++;return json({id,trashed:file.trashed});
  }
  if(u.searchParams.get('alt')==='media'&&file.value instanceof Blob)return new Response(file.value);
  return json(u.searchParams.get('alt')==='media'?file.value:{id,parents:file.parents,appProperties:file.appProperties,trashed:file.trashed,version:String(file.version)},200,etag?String(file.version):undefined);
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
 const h=harness(),q=newQuote();const {fileId}=await h.storage.saveQuote(q);h.files.get(fileId).version++;await assert.rejects(h.storage.saveQuote(q),/다시 불러온/);h.storage.versions.clear();q.projectName='덮어쓰기 시도';await assert.rejects(h.storage.saveQuote(q),/다시 불러온/);
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

test('ETag 없는 실제 v3 형태 응답도 version으로 신규·수정·재조회 확인',async()=>{
 const h=harness({etag:false}),q=newQuote();q.companyName='가나다';const first=await h.storage.saveQuote(q);q.notes='수정';await h.storage.saveQuote(q);assert.equal((await h.storage.loadQuote(first.fileId)).notes,'수정');assert.equal((await h.storage.listQuotes()).length,1);
 h.files.get(first.fileId).version++;q.notes='충돌';await assert.rejects(h.storage.saveQuote(q),/다시 불러온/);
});
test('업체 폴더 재사용·다른 업체 분리·PDF 재저장·업무 왕복',async()=>{
 const h=harness({etag:false}),a=newQuote();a.companyName='가나다';const b=newQuote();b.companyName='가나다';const c=newQuote();c.companyName='라마바';
 const first=await h.storage.saveQuote(a);await h.storage.saveQuote(b);await h.storage.saveQuote(c);
 assert.equal([...h.files.values()].filter(f=>f.appProperties.kind==='company').length,2);assert.equal((await h.storage.listQuotes()).length,3);
 const pdf=new Blob(['%PDF-1.4 test'],{type:'application/pdf'});await h.storage.savePdf(a,first.fileId,pdf);await h.storage.savePdf(a,first.fileId,pdf);
 assert.equal([...h.files.values()].filter(f=>f.appProperties.kind==='pdf').length,1);
 const w={projects:[],events:[{id:'e',date:'2026-10-05',title:'연락',projectId:''}],issuer:'발행자'};await h.storage.saveWorkspace(w);assert.deepEqual(await h.storage.loadWorkspace(),w);
});
test('업로드 후 동일 내용 재시도는 중복 파일을 만들지 않고 확인만 수행',async()=>{
 const h=harness({etag:false}),q=newQuote();const first=await h.storage.saveQuote(q);h.storage.versions.clear();const writes=h.calls.filter(c=>c.options.method==='POST'||c.options.method==='PATCH').length;
 assert.equal((await h.storage.saveQuote(q)).fileId,first.fileId);assert.equal(h.calls.filter(c=>c.options.method==='POST'||c.options.method==='PATCH').length,writes);
});
test('기존 견적의 업체 변경은 JSON·PDF를 새 업체 폴더로 이동',async()=>{
 const h=harness({etag:false}),q=newQuote();q.companyName='업체 A';const {fileId}=await h.storage.saveQuote(q);const blob=new Blob(['%PDF-test']);const pdfId=await h.storage.savePdf(q,fileId,blob),oldParent=h.files.get(fileId).parents[0];
 q.companyName='업체 B';await h.storage.saveQuote(q);await h.storage.savePdf(q,fileId,blob);assert.notEqual(h.files.get(fileId).parents[0],oldParent);assert.deepEqual(h.files.get(fileId).parents,h.files.get(pdfId).parents);
});
