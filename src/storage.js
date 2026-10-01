import {calculate} from './calculation.js';
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
  calculate(value.items);return value;
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
    const response=await this.fetcher(`https://www.googleapis.com/${path}`,{method,headers:{Authorization:`Bearer ${this.getToken()}`,...headers},body});
    if(!response.ok){
      const hints={401:'Google 인증이 만료되었습니다. 다시 연결해주세요.',403:'Drive 접근·쓰기 권한이 없습니다. Google 연결과 폴더 선택을 확인해주세요.',404:'Drive 파일 또는 폴더에 접근할 수 없습니다. 폴더 선택에서 다시 허용해주세요.',412:'다른 곳에서 파일이 수정되었습니다. 다시 불러온 뒤 저장해주세요.'};
      throw new Error(hints[response.status]||`Drive 요청 실패 (${response.status}). 작성 내용은 유지됩니다.`);
    }
    return raw?response:response.json();
  }
  async check() {
    const folder=await this.request(`drive/v3/files/${encodeURIComponent(this.folderId)}?fields=id,name,mimeType,trashed,capabilities(canAddChildren)&supportsAllDrives=true`);
    if(folder.trashed || folder.mimeType!=='application/vnd.google-apps.folder' || !folder.capabilities?.canAddChildren) throw new Error('선택한 폴더에 저장할 수 없습니다. 쓰기 권한을 확인해주세요.');
    return folder;
  }
  async list(kind,id) {
    const query=`'${this.folderId}' in parents and trashed = false and appProperties has { key='app' and value='${APP}' } and appProperties has { key='kind' and value='${kind}' }`+(id?` and appProperties has { key='entityId' and value='${id}' }`:'');
    const files=[];let page='';
    do {
      const params=new URLSearchParams({q:query,fields:'nextPageToken,files(id,name,modifiedTime,appProperties)',pageSize:'100',orderBy:'modifiedTime desc',supportsAllDrives:'true',includeItemsFromAllDrives:'true'});
      if(page)params.set('pageToken',page);
      const result=await this.request(`drive/v3/files?${params}`);files.push(...(result.files||[]));page=result.nextPageToken;
    } while(page);
    return files;
  }
  async metadata(id,kind) {
    const response=await this.request(`drive/v3/files/${encodeURIComponent(id)}?fields=id,parents,trashed,appProperties&supportsAllDrives=true`,{raw:true});
    const meta=await response.json();
    if(meta.trashed || !meta.parents?.includes(this.folderId) || meta.appProperties?.app!==APP || meta.appProperties?.kind!==kind)throw new Error('현재 폴더의 견적 작업실 파일이 아닙니다.');
    return {meta,etag:response.headers.get('etag')};
  }
  async load(id,kind) {
    const before=await this.metadata(id,kind);
    const value=await this.request(`drive/v3/files/${encodeURIComponent(id)}?alt=media&supportsAllDrives=true`);
    const after=await this.metadata(id,kind);
    if(!after.etag || before.etag!==after.etag)throw new Error('파일이 변경되었습니다. 다시 불러와주세요.');
    const valid=kind==='quote'?validateQuote(value):validateCatalog(value);
    this.versions.set(id,after.etag);return valid;
  }
  async exclusive(action) {
    if(this.busy)throw new Error('저장 작업이 진행 중입니다. 완료 후 다시 시도해주세요.');
    this.busy=true;try{return await action();}finally{this.busy=false;}
  }
  async persist(kind,entityId,value,name) {
    return this.exclusive(async()=>{
      await this.check();
      const matches=await this.list(kind,entityId);
      if(matches.length>1)throw new Error('동일 ID의 파일이 여러 개입니다. Drive에서 확인해주세요.');
      const existing=matches[0];let result;
      if(existing){
        const {etag}=await this.metadata(existing.id,kind),known=this.versions.get(existing.id);
        if(!known || known!==etag)throw new Error('기존 파일을 먼저 다시 불러온 뒤 저장해주세요. 다른 변경을 덮어쓰지 않았습니다.');
        result=await this.request(`upload/drive/v3/files/${existing.id}?uploadType=media&fields=id&supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':known},body:JSON.stringify(value)});
      }else{
        const metadata={name,mimeType:'application/json',parents:[this.folderId],appProperties:{app:APP,kind,entityId}};
        const boundary=`estimate_${crypto.randomUUID()}`;
        const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(value)}\r\n--${boundary}--`;
        result=await this.request('upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true',{method:'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body});
      }
      const confirmed=await this.load(result.id,kind);
      if(JSON.stringify(confirmed)!==JSON.stringify(value))throw new Error('저장 후 검증이 일치하지 않습니다. 다시 불러와 확인해주세요.');
      return {fileId:result.id,value:confirmed};
    });
  }
  saveQuote(value) {const copy=structuredClone(validateQuote(value));return this.persist('quote',copy.id,copy,`${copy.quoteNumber}.json`);}
  saveCatalog(nodes) {const copy=structuredClone(validateCatalog(nodes));return this.persist('catalog','catalog',copy,'estimate-items.json');}
  listQuotes() {return this.list('quote');}
  loadQuote(id) {return this.load(id,'quote');}
  async loadCatalog() {const files=await this.list('catalog','catalog');if(files.length>1)throw new Error('단가표 파일이 중복되어 있습니다.');return files.length?this.load(files[0].id,'catalog'):[];}
  async deleteQuote(id) {return this.exclusive(async()=>{const {etag}=await this.metadata(id,'quote');if(!etag)throw new Error('파일 버전을 확인할 수 없습니다.');await this.request(`drive/v3/files/${encodeURIComponent(id)}?fields=id,trashed&supportsAllDrives=true`,{method:'PATCH',headers:{'Content-Type':'application/json','If-Match':etag},body:JSON.stringify({trashed:true})});this.versions.delete(id);});}
}
