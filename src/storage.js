import {calculateQuote} from './calculation.js';
import {validateWorkspace,quoteStatuses} from './workflow.js';
export function parseFolderId(input) {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)\/?$/);
    if (url.protocol === 'https:' && url.hostname === 'drive.google.com' && match) return match[1];
  } catch {}
  throw new Error('Google Drive 폴더 URL 또는 Folder ID를 입력해주세요.');
}
const APP='estimate-v1';
export function validateQuote(value) {
  if(!value || typeof value.id!=='string' || !/^[\w-]+$/.test(value.id) || typeof value.quoteNumber!=='string' || !['draft','saved'].includes(value.status) || !Array.isArray(value.items)) throw new Error('견적 파일 형식이 올바르지 않습니다.');
  for(const key of ['projectName','quoteDate','validUntil','notes','createdAt','updatedAt']) if(typeof value[key]!=='string') throw new Error('견적 필드가 올바르지 않습니다.');
  const ids=new Set();
  for(const item of value.items) {
    if(!item || typeof item.id!=='string' || !/^[\w-]+$/.test(item.id) || ids.has(item.id) || ['name','description','unit'].some(k=>typeof item[k]!=='string')) throw new Error('견적 항목 형식이 올바르지 않습니다.');
    ids.add(item.id);
  }
  if(value.calculationVersion){
    if(value.calculationVersion!==1)throw new Error('지원하지 않는 견적 계산 버전입니다. 원본을 보존해주세요.');
    for(const key of ['companyName','companyCode','recipient','issuer','deliveryDate','paymentTerms','projectId'])if(typeof value[key]!=='string')throw new Error('견적 추가 정보 형식 오류');
    if(typeof value.vatIncluded!=='boolean'||!Object.hasOwn(quoteStatuses,value.workflowStatus))throw new Error('견적 상태 형식 오류');
  }
  calculateQuote(value);return value;
}
export function validateCatalog(nodes) {
  if(!Array.isArray(nodes)) throw new Error('단가표 형식이 올바르지 않습니다.');
  const map=new Map(nodes.map(n=>[n?.id,n]));
  if(map.size!==nodes.length) throw new Error('단가표 ID가 중복되었습니다.');
  for(const n of nodes) {
    if(!n || typeof n.id!=='string' || !/^[\w-]+$/.test(n.id) || !['group','item'].includes(n.type) || typeof n.name!=='string' || typeof n.active!=='boolean' || !Number.isFinite(n.order)) throw new Error('단가표 항목 형식 오류');
    if(n.type==='item' && (!n.parentId || typeof n.unit!=='string' || typeof n.description!=='string' || !Number.isFinite(n.price) || n.price<0)) throw new Error('단가표 가격 또는 그룹 오류');
    const seen=new Set([n.id]);let parent=n.parentId;
    while(parent!==null){if(seen.has(parent)||map.get(parent)?.type!=='group')throw new Error('단가표 그룹 관계 오류');seen.add(parent);parent=map.get(parent).parentId;}
  }
  return nodes;
}
export class DriveStorage {
  constructor({getToken=()=>{throw new Error('Google 연결이 필요합니다.');},fetcher=(...args)=>globalThis.fetch(...args)}={}) {this.folderId='';this.getToken=getToken;this.fetcher=fetcher;this.busy=false;this.versions=new Map();}
  configure(input) {this.folderId='';this.versions.clear();this.folderId=parseFolderId(input);}
  async request(path,{method='GET',body,headers={},raw=false}={}) {
    if(!this.folderId) throw new Error('Google Drive 저장 위치가 설정되어 있지 않습니다. 관리자 페이지에서 저장 위치를 설정해주세요.');
    const response=await this.fetcher(`https://www.googleapis.com/${path}`,{method,cache:'no-store',headers:{Authorization:`Bearer ${this.getToken()}`,...headers},body});
    if(!response.ok){
      const hints={401:'Google 인증이 만료되었습니다. 다시 연결해주세요.',403:'Drive 접근·쓰기 권한이 없습니다. Google 연결과 폴더 선택을 확인해주세요.',404:'Drive 파일 또는 폴더에 접근할 수 없습니다. 폴더 선택에서 다시 허용해주세요.',412:'다른 곳에서 파일이 수정되었습니다. 다시 불러온 뒤 저장해주세요.'};
      const details=await response.json().catch(()=>({}));
      const reason=details.error?.errors?.[0]?.reason||details.error?.status||'';
      throw new Error((hints[response.status]||`Drive 요청 실패 (${response.status}). 작성 내용은 유지됩니다.`)+(reason?` [${reason}]`:''));
    }
    return raw?response:response.json();
  }
  async check() {
    const folder=await this.request(`drive/v3/files/${encodeURIComponent(this.folderId)}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`);
    if(folder.trashed || folder.mimeType!=='application/vnd.google-apps.folder' || !folder.capabilities?.canAddChildren) throw new Error('선택한 폴더에 저장할 수 없습니다. 쓰기 권한을 확인해주세요.');
    return folder;
  }
  async list(kind,id,parent=this.folderId) {
    const query=`'${parent}' in parents and trashed = false and appProperties has { key='app' and value='${APP}' } and appProperties has { key='kind' and value='${kind}' }`+(id?` and appProperties has { key='entityId' and value='${id}' }`:'');
    const files=[];let page='';
    do {
      const params=new URLSearchParams({q:query,fields:'nextPageToken,files(id,name,modifiedTime,appProperties)',pageSize:'100',orderBy:'modifiedTime desc',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
      if(page)params.set('pageToken',page);
      const result=await this.request(`drive/v3/files?${params}`);files.push(...(result.files||[]));page=result.nextPageToken;
    } while(page);
    return files;
  }
  async metadata(id,kind) {
    const response=await this.request(`drive/v3/files/${encodeURIComponent(id)}?fields=id,parents,trashed,appProperties,version,md5Checksum,mimeType,name&supportsAllDrives=true`,{raw:true});
    const meta=await response.json();
    if(meta.trashed || meta.appProperties?.app!==APP || meta.appProperties?.kind!==kind)throw new Error('현재 폴더의 견적 작업실 파일이 아닙니다.');
    if(!meta.parents?.includes(this.folderId)){
      if(!['quote','pdf'].includes(kind)||meta.parents?.length!==1)throw new Error('현재 폴더의 견적 작업실 파일이 아닙니다.');
      await this.metadata(meta.parents[0],'company');
    }
    const etag=response.headers.get('etag');
    // Drive version에는 다운로드/관리 정보 변경도 포함된다. 내용 체크섬을 우선한다.
    return {meta,etag,version:meta.md5Checksum?`md5:${meta.md5Checksum}`:meta.version?String(meta.version):etag};
  }
  async load(id,kind) {
    const before=await this.metadata(id,kind);
    const value=await this.request(`drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`);
    const after=await this.metadata(id,kind);
    if(!before.version||!after.version)throw new Error('Drive가 파일 체크섬과 버전을 반환하지 않았습니다. 저장 확인을 완료하지 못했습니다.');
    if(before.version!==after.version)throw new Error(`파일 내용이 조회 도중 변경되었습니다. 다시 불러와주세요. [Drive 버전 ${before.meta.version??'없음'} → ${after.meta.version??'없음'}]`);
    const valid=kind==='quote'?validateQuote(value):kind==='workspace'?validateWorkspace(value):validateCatalog(value);
    this.versions.set(id,after.version);return valid;
  }
  async exclusive(action) {
    if(this.busy)throw new Error('저장 작업이 진행 중입니다. 완료 후 다시 시도해주세요.');
    this.busy=true;try{return await action();}finally{this.busy=false;}
  }
  async companyFolder(quote){
    if(!quote.companyName?.trim())return this.folderId; // 기존 견적 호환
    const key=quote.companyName.trim().normalize('NFC')+'\n'+(quote.companyCode||'').trim();
    const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(key));
    const entityId=Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
    const folders=await this.list('company',entityId);
    if(folders.length>1)throw new Error('업체 폴더가 중복되어 있습니다. Drive에서 확인해주세요.');
    if(folders.length)return folders[0].id;
    const folder=await this.request('drive/v3/files?fields=id&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:quote.companyName.trim()+(quote.companyCode?` (${quote.companyCode})`:''),mimeType:'application/vnd.google-apps.folder',parents:[this.folderId],appProperties:{app:APP,kind:'company',entityId}})});
    return folder.id;
  }
  async persist(kind,entityId,value,name) {
    return this.exclusive(async()=>{
      await this.check();
      const matches=kind==='quote'?(await this.listQuotes()).filter(f=>f.appProperties.entityId===entityId):await this.list(kind,entityId);
      if(matches.length>1)throw new Error('동일 ID의 파일이 여러 개입니다. Drive에서 확인해주세요.');
      const existing=matches[0];let result;
      if(existing){
        const {etag,version}=await this.metadata(existing.id,kind),known=this.versions.get(existing.id);
        if(!known || known!==version){
          if(known)throw new Error('기존 파일을 먼저 다시 불러온 뒤 저장해주세요. 다른 변경을 덮어쓰지 않았습니다.');
          const remote=await this.load(existing.id,kind);
          if(JSON.stringify(remote)!==JSON.stringify(value)){
          // 충돌 확인용 읽기를 저장 승인으로 취급하지 않는다.
          this.versions.delete(existing.id);
          throw new Error('기존 파일을 먼저 다시 불러온 뒤 저장해주세요. 다른 변경을 덮어쓰지 않았습니다.');
          }
          result={id:existing.id};
        }else{
          result=await this.request(`upload/drive/v3/files/${existing.id}?uploadType=media&fields=id&supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},body:JSON.stringify(value)});
        }
      }else{
        const parent=kind==='quote'?await this.companyFolder(value):this.folderId;
        const metadata={name,mimeType:'application/json',parents:[parent],appProperties:{app:APP,kind,entityId}};
        const boundary=`estimate_${crypto.randomUUID()}`;
        const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(value)}\r\n--${boundary}--`;
        result=await this.request('upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
      }
      const confirmed=await this.load(result.id,kind);
      if(JSON.stringify(confirmed)!==JSON.stringify(value))throw new Error('저장 후 검증이 일치하지 않습니다. 다시 불러와 확인해주세요.');
      if(kind==='quote'&&value.companyName?.trim()){
        const parent=await this.companyFolder(value);await this.moveToFolder(result.id,'quote',parent);
      }
      return {fileId:result.id,value:confirmed};
    });
  }
  saveQuote(value) {const copy=structuredClone(validateQuote(value));return this.persist('quote',copy.id,copy,`${copy.quoteNumber}.json`);}
  saveCatalog(nodes) {const copy=structuredClone(validateCatalog(nodes));return this.persist('catalog','catalog',copy,'estimate-items.json');}
  async listQuotes() {const folders=await this.list('company');const groups=await Promise.all(folders.map(f=>this.list('quote',undefined,f.id)));return [...await this.list('quote'),...groups.flat()].sort((a,b)=>(b.modifiedTime||'').localeCompare(a.modifiedTime||''));}
  loadQuote(id) {return this.load(id,'quote');}
  async loadCatalog() {const files=await this.list('catalog','catalog');if(files.length>1)throw new Error('단가표 파일이 중복되어 있습니다.');return files.length?this.load(files[0].id,'catalog'):[];}
  saveWorkspace(value){return this.persist('workspace','workspace',structuredClone(validateWorkspace(value)),'estimate-workspace.json');}
  async moveToFolder(id,kind,parent){
    const before=await this.metadata(id,kind);
    if(before.meta.parents.includes(parent))return;
    if(this.versions.has(id)&&before.version!==this.versions.get(id))throw new Error('파일이 변경되었습니다. 다시 불러온 뒤 폴더를 이동해주세요.');
    const params=new URLSearchParams({addParents:parent,removeParents:before.meta.parents.join(','),fields:'id',supportsAllDrives:'true'});
    await this.request(`drive/v3/files/${id}?${params}`,{method:'PATCH',headers:{'Content-Type':'application/json',...(before.etag?{'If-Match':before.etag}:{})},body:'{}'});
    const after=await this.metadata(id,kind);if(!after.meta.parents.includes(parent))throw new Error('견적은 저장됐지만 업체 폴더 이동 확인에 실패했습니다.');this.versions.set(id,after.version);
  }
  async loadWorkspace(){const files=await this.list('workspace','workspace');if(files.length>1)throw new Error('업무 파일이 중복되어 있습니다.');return files.length?this.load(files[0].id,'workspace'):null;}
  async savePdf(quote,fileId,blob){return this.exclusive(async()=>{
    const {meta}=await this.metadata(fileId,'quote'),parent=meta.parents[0];
    const folders=await this.list('company');const groups=await Promise.all([this.list('pdf',quote.id),...folders.map(f=>this.list('pdf',quote.id,f.id))]);
    const matches=groups.flat();if(matches.length>1)throw new Error('PDF 파일이 중복되어 있습니다.');
    let id=matches[0]?.id;
    if(!id){const result=await this.request('drive/v3/files?fields=id&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:`${quote.quoteNumber}_${quote.projectName||'견적서'}.pdf`,mimeType:'application/pdf',parents:[parent],appProperties:{app:APP,kind:'pdf',entityId:quote.id}})});id=result.id;}
    await this.moveToFolder(id,'pdf',parent);
    await this.request(`upload/drive/v3/files/${id}?uploadType=media&fields=id&supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/pdf'},body:blob});
    const response=await this.request(`drive/v3/files/${id}?alt=media&supportsAllDrives=true`,{raw:true});
    const expected=new Uint8Array(await blob.arrayBuffer()),actual=new Uint8Array(await response.arrayBuffer());
    if(expected.length!==actual.length||expected.some((b,i)=>b!==actual[i]))throw new Error('PDF 저장 후 내용 확인에 실패했습니다.');
    this.versions.set(id,(await this.metadata(id,'pdf')).version);
    return id;
  });}
  async deleteQuote(id) {return this.exclusive(async()=>{const {etag,version}=await this.metadata(id,'quote');if(!version||this.versions.get(id)!==version)throw new Error('견적을 다시 불러온 뒤 삭제해주세요.');await this.request(`drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed&supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json',...(etag?{'If-Match':etag}:{})},body:JSON.stringify({trashed:true})});this.versions.delete(id);});}
}
