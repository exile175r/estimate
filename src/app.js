import {newQuote,copyQuote,snapshot,children,createNode,moveNode,deleteNode,duplicateItem} from './model.js';
import {calculate,formatAmount} from './calculation.js';
import {DriveStorage} from './storage.js';
import {GoogleAuth} from './google-auth.js';
// Local credentials stay outside Git; the public editor also works without them.
const {config} = await import('./config.js').catch(()=>({config:{}}));
const $ = selector => document.querySelector(selector);
const $$ = selector => document.querySelectorAll(selector);
// Cache stable containers; query replaced children only after rendering.
const ui = Object.fromEntries(['paper','compose','catalog','duplicate-dialog','tree','detail','root-drop','folder','folder-result','quote-list','message','contextmenu'].map(id=>[id,$('#'+id)]));
const pages=$$('.page'), navButtons=$$('nav button'), connection=$('.connection');
function showPage(page){pages.forEach(el=>el.hidden=el.id!==page);navButtons.forEach(el=>el.classList.toggle('active',el.dataset.page===page));resizeQuoteTextareas();}
const escape = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let nodes = [], quote = newQuote(), selected = null, pendingItem = null, quoteDirty = false;
const touchQuote = () => {quoteDirty=true;quote.updatedAt=new Date().toISOString();};
const auth=new GoogleAuth(config);
const collapsed = new Set(), storage = new DriveStorage({getToken:()=>auth.getToken()});
let savedSignature='', activeFileId='', uiBusy=false;
const signature=()=>JSON.stringify(quote);
const updateSavedState=()=>{const label=$('.document-heading small');if(label)label.textContent=savedSignature===signature()?'Drive 저장됨':'현재 작업본 · Drive 저장 안 됨';};
const message = (text,error = false) => { const el=ui.message; el.hidden=false; el.textContent=text; el.className=error?'error':'info'; };
const run = async fn => { try { await fn(); } catch(error) { message(error.message,true); } };
const input = (label,key,value,type='text',extra='') => `<label>${label}<input type="${type}" data-field="${key}" value="${escape(value)}" ${extra}></label>`;
function resizeQuoteTextareas() {
  if (ui.compose.hidden) return;
  ui.paper.querySelectorAll('textarea').forEach(field=>{
    field.style.height='auto';
    field.style.height=String(field.scrollHeight+2)+'px';
  });
}
window.addEventListener('resize',()=>{resizeQuoteTextareas();closeContext();});
document.fonts.ready.then(resizeQuoteTextareas);
function renderQuote() {
  ui['paper'].innerHTML=`<div class="document-heading"><h2>견 적 서</h2><span>${escape(quote.quoteNumber)}<small>현재 작업본 · Drive 저장 안 됨</small></span></div><div class="quote-meta">${input('프로젝트명','projectName',quote.projectName)}${input('견적일','quoteDate',quote.quoteDate,'date')}${input('유효기간','validUntil',quote.validUntil,'date')}</div><div class="quote-lines">${quote.items.length?quote.items.map((item,i)=>`<section class="quote-line" data-line="${item.id}"><div class="line-title"><span class="line-index">${String(i+1).padStart(2,'0')}</span>${input('항목명','name',item.name)}<button data-remove="${item.id}" aria-label="${escape(item.name)} 삭제">삭제</button></div><label>설명<textarea data-field="description" rows="2">${escape(item.description)}</textarea></label><div class="line-numbers">${input('단가','price',item.price,'number','min="0" step="any"')}${input('수량','quantity',item.quantity,'number','min="0" step="any"')}${input('단위','unit',item.unit)}<div class="line-amount"><span>항목 금액</span><strong data-amount="${i}"></strong></div></div></section>`).join(''):'<div class="empty"><h3>첫 항목을 추가해주세요</h3><p>오른쪽 단가표에서 항목을 선택하면 이곳에 반영됩니다.</p></div>'}</div><div class="total"><span>합계 <small>임시 계산</small></span><strong id="total"></strong></div><label class="notes">비고<textarea data-field="notes" rows="3">${escape(quote.notes)}</textarea></label>`;
  updateAmounts();
  resizeQuoteTextareas();
}
function updateAmounts() {
  const totalElement=$('#total'), amountElements=$$('[data-amount]');
  try {const {amounts,total}=calculate(quote.items); amounts.forEach((a,i)=>amountElements[i].textContent=formatAmount(a)); totalElement.textContent=`${formatAmount(total)} 원`;}
  catch(error) {totalElement.textContent='입력값 확인 필요'; amountElements.forEach(el=>el.textContent='—');}
}
ui['paper'].addEventListener('input',event=>{
  const field=event.target.dataset.field; if(!field)return;
  const line=event.target.closest('[data-line]'); const target=line?quote.items.find(i=>i.id===line.dataset.line):quote;
  target[field]=event.target.type==='number'?(event.target.value===''?NaN:Number(event.target.value)):event.target.value;
  touchQuote(); updateAmounts(); updateSavedState();
  if(event.target.tagName==='TEXTAREA') resizeQuoteTextareas();
});
ui['paper'].addEventListener('click',event=>{const id=event.target.dataset.remove;if(id){quote.items=quote.items.filter(i=>i.id!==id);touchQuote();renderQuote();}});
function renderCatalog() {
  function branch(parentId) {return children(nodes,parentId).map(node=>node.type==='group'?`<details open><summary>${escape(node.name)}${node.active?'':' · 비활성 그룹'}</summary>${branch(node.id)}</details>`:node.active?`<button class="catalog-item" data-add="${node.id}"><span>${escape(node.name)}<small>${escape(node.description || node.unit)}</small></span><strong>${formatAmount(node.price)} <span>+</span></strong></button>`:'').join('');}
  ui['catalog'].innerHTML=nodes.length?branch(null):'<div class="empty"><h3>단가표가 비어 있습니다</h3><p>단가표 관리에서 그룹과 항목을 만들어주세요.</p><button data-page="admin">단가표 만들기 →</button></div>';
}
ui['catalog'].addEventListener('click',event=>{const button=event.target.closest('[data-add]');if(!button)return;const item=nodes.find(n=>n.id===button.dataset.add);if(quote.items.some(i=>i.sourceItemId===item.id)){pendingItem=item;ui['duplicate-dialog'].returnValue='cancel';ui['duplicate-dialog'].showModal();}else{quote.items.push(snapshot(item));touchQuote();renderQuote();}});
ui['duplicate-dialog'].addEventListener('close',()=>{const choice=ui['duplicate-dialog'].returnValue;if(choice==='row')quote.items.push(snapshot(pendingItem));if(choice==='quantity')quote.items.find(i=>i.sourceItemId===pendingItem.id).quantity+=1;if(choice==='row'||choice==='quantity')touchQuote();pendingItem=null;renderQuote();});
function renderTree() {
  function branch(parentId) {return children(nodes,parentId).map(node=>`<div role="treeitem" aria-selected="${selected===node.id}" ${node.type==='group'?`aria-expanded="${!collapsed.has(node.id)}"`:''}><div class="tree-row ${selected===node.id?'selected':''}" draggable="true" data-node="${node.id}">${node.type==='group'?`<button data-toggle="${node.id}" aria-label="접기 또는 펼치기">${collapsed.has(node.id)?'▸':'▾'}</button>`:'<span class="file-icon">▤</span>'}<button class="node-name" data-select="${node.id}">${escape(node.name)}${node.active?'':' (비활성)'}</button>${node.type==='group'?`<span class="into" data-into="${node.id}">안으로</span>`:''}</div>${node.type==='group'&&!collapsed.has(node.id)?`<div class="tree-children" role="group">${branch(node.id)}</div>`:''}</div>`).join('');}
  ui['tree'].innerHTML=branch(null)||'<p class="empty">루트 그룹을 추가해 시작하세요.</p>';
}
function renderDetail() {
  const node=nodes.find(n=>n.id===selected);
  ui['detail'].innerHTML=node?`<div class="panel-heading"><h2>${node.type==='group'?'그룹':'항목'} 상세</h2><p>변경은 현재 세션에 반영됩니다. 영구 보관에는 Drive 저장이 필요합니다.</p></div><div class="detail-form">${input('이름','name',node.name)}${node.type==='item'?`${input('기본 단가','price',node.price,'number','min="0" step="any"')}${input('단위','unit',node.unit)}<label>설명<textarea data-field="description" rows="4">${escape(node.description)}</textarea></label><label class="checkbox"><input type="checkbox" data-field="active" ${node.active?'checked':''}> 신규 견적에 사용</label>`:'<p class="hint">그룹 사용 여부 변경은 하위 항목 전파 정책 결정 후 연결합니다.</p>'}<div class="actions"><button id="rename">트리에서 이름 변경</button>${node.type==='item'?'<button id="duplicate-node">항목 복제</button>':''}<button id="delete-node" class="danger">삭제</button></div></div>`:'<div class="empty"><h2>편집할 대상을 선택하세요</h2><p>폴더는 그룹, 파일은 견적 항목입니다.</p></div>';
}
function renderAdmin(){renderTree();renderDetail();renderCatalog();}
ui['detail'].addEventListener('input',event=>{const key=event.target.dataset.field;if(!key)return;const node=nodes.find(n=>n.id===selected);if(key==='price'&&(event.target.value===''||!Number.isFinite(Number(event.target.value))||Number(event.target.value)<0)){event.target.setCustomValidity('0 이상의 단가를 입력해주세요.');event.target.reportValidity();return;}event.target.setCustomValidity('');node[key]=event.target.type==='checkbox'?event.target.checked:event.target.type==='number'?Number(event.target.value):event.target.value;renderTree();renderCatalog();});
ui['detail'].addEventListener('click',event=>run(()=>{
  if(event.target.id==='delete-node'){nodes=deleteNode(nodes,selected);selected=null;renderAdmin();}
  if(event.target.id==='duplicate-node'){selected=duplicateItem(nodes,selected).id;renderAdmin();}
  if(event.target.id==='rename'){
    const node=nodes.find(n=>n.id===selected),button=$(`[data-select="${selected}"]`),field=document.createElement('input');field.value=node.name;field.setAttribute('aria-label','이름 변경');button.replaceWith(field);field.focus();field.select();let done=false;
    const finish=save=>{if(done)return;done=true;if(save&&field.value.trim())node.name=field.value.trim();renderAdmin();};field.addEventListener('keydown',e=>{if(e.key==='Enter')finish(true);if(e.key==='Escape')finish(false);});field.addEventListener('blur',()=>finish(true));
  }
}));
ui['tree'].addEventListener('click',event=>{const toggle=event.target.dataset.toggle,id=event.target.dataset.select;if(toggle){collapsed.has(toggle)?collapsed.delete(toggle):collapsed.add(toggle);renderTree();}if(id){selected=id;renderAdmin();}});
let dragId=null, dropTarget=null;
function clearDrop(){if(dropTarget){dropTarget.classList.remove('drop-before','drop-inside');dropTarget=null;}}
ui.tree.addEventListener('dragstart',event=>{const row=event.target.closest('[data-node]');if(!row||uiBusy){event.preventDefault();return;}closeContext();dragId=row.dataset.node;event.dataTransfer.effectAllowed='move';event.dataTransfer.setData('text/plain',dragId);row.classList.add('dragging');});
ui.tree.addEventListener('dragend',()=>{dragId=null;clearDrop();ui.tree.querySelector('.dragging')?.classList.remove('dragging');});
for(const el of [ui.tree,ui['root-drop']]){
  el.addEventListener('dragover',event=>{if(!dragId||uiBusy)return;const into=event.target.closest('[data-into]'),row=event.target.closest('[data-node]');const target=into||row||(el===ui['root-drop']?el:null);clearDrop();if(!target)return;event.preventDefault();event.dataTransfer.dropEffect='move';dropTarget=target;target.classList.add(into||target===ui['root-drop']?'drop-inside':'drop-before');});
  el.addEventListener('dragleave',event=>{if(!el.contains(event.relatedTarget))clearDrop();});
  el.addEventListener('drop',event=>{event.preventDefault();clearDrop();if(!dragId||uiBusy)return;const id=dragId;dragId=null;run(()=>{const into=event.target.closest('[data-into]'),row=event.target.closest('[data-node]');if(into){moveNode(nodes,id,into.dataset.into);collapsed.delete(into.dataset.into);}else if(row){const target=nodes.find(n=>n.id===row.dataset.node);if(target.id===id)return;moveNode(nodes,id,target.parentId,target.id);}else if(el===ui['root-drop'])moveNode(nodes,id,null);selected=id;renderAdmin();});});
}
function add(type,root=false){run(()=>{const current=nodes.find(n=>n.id===selected);const parentId=root?null:current?.type==='group'?current.id:current?.parentId;if(!root&&!parentId)throw new Error('그룹을 먼저 선택해주세요.');selected=createNode(nodes,type,parentId).id;if(parentId)collapsed.delete(parentId);renderAdmin();});}
$('#root-group').onclick=()=>add('group',true);$('#child-group').onclick=()=>add('group');$('#add-item').onclick=()=>add('item');
document.addEventListener('click',event=>{if(!ui.contextmenu.contains(event.target))closeContext();const page=event.target.closest('[data-page]')?.dataset.page;if(page)showPage(page);});
$('#new-quote').onclick=()=>{if(quoteDirty&&!confirm('현재 견적은 저장되지 않았습니다. 새 견적을 작성할까요?'))return;quote=newQuote();quoteDirty=false;savedSignature='';activeFileId='';renderQuote();};
$('#copy-quote').onclick=()=>{quote=copyQuote(quote);quoteDirty=true;savedSignature='';activeFileId='';renderQuote();message('새 ID와 견적번호로 작업본을 복사했습니다. Drive에는 저장되지 않았습니다.');};
async function busy(action) {
  if(uiBusy){message('작업이 진행 중입니다. 잠시 기다려주세요.',true);return;}
  uiBusy=true;const controls=[...$$('button,input,textarea')];const disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);try{await action();}catch(error){message(error.message,true);}finally{controls.forEach((el,i)=>el.disabled=disabled[i]);uiBusy=false;}
}
for(const [id,status] of [['draft','draft'],['save','saved']])$('#'+id).onclick=()=>busy(async()=>{
  calculate(quote.items);
  const before=signature(),pending={...structuredClone(quote),status};
  const result=await storage.saveQuote(pending);
  const unchanged=before===signature();
  if(unchanged){quote=result.value;activeFileId=result.fileId;savedSignature=signature();quoteDirty=false;updateSavedState();}
  message(unchanged?'Drive에 저장하고 내용을 확인했습니다.':'Drive에 저장했습니다. 저장 중 추가 수정한 내용은 다시 저장해주세요.');
});
$('#save-catalog').onclick=()=>busy(async()=>{await storage.saveCatalog(nodes);message('단가표를 Drive에 저장하고 내용을 확인했습니다.');});
$('#load-catalog').onclick=()=>busy(async()=>{
  if(nodes.length&&!confirm('현재 단가표를 Drive의 단가표로 바꿀까요? 저장하지 않은 변경은 사라집니다.'))return;
  const loaded=await storage.loadCatalog();nodes=loaded;selected=null;renderAdmin();message('Drive 단가표를 불러왔습니다.');
});
async function refreshQuotes(){
  const files=await storage.listQuotes();
  ui['quote-list'].innerHTML=files.length?files.map(f=>'<div class="saved-row"><strong>'+escape(f.name)+'</strong><span>'+escape(f.modifiedTime)+'</span><div class="actions"><button data-load="'+escape(f.id)+'">불러오기</button><button data-trash="'+escape(f.id)+'">휴지통으로 이동</button></div></div>').join(''):'<p>이 폴더에 저장된 견적이 없습니다.</p>';
}
$('#refresh').onclick=()=>busy(refreshQuotes);
ui['quote-list'].onclick=event=>busy(async()=>{
  const id=event.target.dataset.load,trash=event.target.dataset.trash;
  if(id){
    if(quoteDirty&&!confirm('저장하지 않은 현재 견적을 바꿀까요?'))return;
    const loaded=await storage.loadQuote(id);quote=loaded;activeFileId=id;savedSignature=signature();quoteDirty=false;renderQuote();showPage('compose');message('Drive 견적을 불러왔습니다.');
  }
  if(trash){const saved=await storage.loadQuote(trash);if(!confirm(saved.quoteNumber+' · '+saved.projectName+' 견적을 Drive 휴지통으로 이동할까요?'))return;await storage.deleteQuote(trash);if(activeFileId===trash){activeFileId='';savedSignature='';quoteDirty=true;updateSavedState();}await refreshQuotes();message('Drive 휴지통으로 이동했습니다.');}
});

const $settingsWrap = $('.settings-wrap'), $linkSetting=$('#link-setting');
$linkSetting.onclick=() => {
  if($settingsWrap.hidden) $settingsWrap.hidden = false;
}

$settingsWrap.onclick=({target})=>{
  if(target.className != 'settings-wrap') return;
  if(!$settingsWrap.hidden) $settingsWrap.hidden = true;
}

const $contextmenu = ui.contextmenu;
let contextNode=null;
function closeContext(restore=false){$contextmenu.hidden=true;if(restore)(ui.tree.querySelector(`[data-select="${contextNode}"]`)||ui.tree).focus();}
function openContext(event){
  if(uiBusy)return;
  event.preventDefault();
  const row=event.target.closest('[data-node]');contextNode=row?.dataset.node||null;selected=contextNode;renderAdmin();
  const node=nodes.find(n=>n.id===contextNode),hasParent=node?.type==='group'||Boolean(node?.parentId);
  $contextmenu.innerHTML=`<p>${escape(node?.name||'단가표')}</p><button role="menuitem" data-create="root">루트 그룹 추가</button><button role="menuitem" data-create="group" ${hasParent?'':'disabled'}>하위 그룹 추가</button><button role="menuitem" data-create="item" ${hasParent?'':'disabled'}>항목 추가</button>`;
  $contextmenu.hidden=false;
  const anchor=ui.tree.querySelector(`[data-node="${contextNode}"]`)?.getBoundingClientRect()||ui.tree.getBoundingClientRect();
  const x=event.type==='keydown'?anchor.left:event.clientX,y=event.type==='keydown'?anchor.bottom:event.clientY;
  $contextmenu.style.left=Math.max(8,Math.min(x,innerWidth-$contextmenu.offsetWidth-8))+'px';
  $contextmenu.style.top=Math.max(8,Math.min(y,innerHeight-$contextmenu.offsetHeight-8))+'px';
  $contextmenu.querySelector('button:not(:disabled)').focus({preventScroll:true});
}
ui.tree.addEventListener('contextmenu',openContext);
ui.tree.addEventListener('keydown',event=>{if(event.key==='ContextMenu'||event.shiftKey&&event.key==='F10')openContext(event);});
$contextmenu.addEventListener('click',event=>{const button=event.target.closest('[data-create]');if(!button||button.disabled)return;const type=button.dataset.create;selected=contextNode;closeContext();add(type==='item'?'item':'group',type==='root');ui.tree.querySelector(`[data-select="${selected}"]`)?.focus();});
$contextmenu.addEventListener('keydown',event=>{const buttons=[...$contextmenu.querySelectorAll('button:not(:disabled)')],index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){event.preventDefault();const next=event.key==='Home'?0:event.key==='End'?buttons.length-1:(index+(event.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length;buttons[next].focus();}if(event.key==='Tab')closeContext();});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){if(!$contextmenu.hidden)closeContext(true);if(!$settingsWrap.hidden){$settingsWrap.hidden=true;$linkSetting.focus();}}});



ui['folder'].value=config.folderId||'';
if(config.folderId)storage.configure(config.folderId);
ui['folder'].addEventListener('input',()=>{storage.folderId='';storage.versions.clear();savedSignature='';updateSavedState();connection.textContent='Drive 미연결';ui['folder-result'].textContent='입력값이 변경되었습니다. 연결 확인이 필요합니다.';});
async function checkFolder(){const folder=await storage.check();ui['folder-result'].textContent=folder.name+' · 접근 및 저장 권한 확인됨';connection.textContent='Drive 연결됨';}
$('#check-drive').onclick=()=>busy(async()=>{if(storage.folderId!==ui['folder'].value)storage.configure(ui['folder'].value);ui['folder-result'].textContent='폴더 접근·쓰기 권한 확인 중';await checkFolder();});
$('#connect-drive').onclick=()=>busy(async()=>{await auth.authorize();message('Google 연결 완료. 폴더 선택에서 저장 폴더를 허용해주세요.');});
$('#pick-folder').onclick=()=>busy(async()=>{const id=await auth.pickFolder();storage.configure(id);ui['folder'].value=id;savedSignature='';activeFileId='';updateSavedState();await checkFolder();});
$('#disconnect-drive').onclick=()=>{auth.disconnect();storage.versions.clear();connection.textContent='Drive 미연결';ui['folder-result'].textContent='연결을 해제했습니다.';message('Google 연결을 해제했습니다. 작성 내용은 유지됩니다.');};
auth.prepare().catch(error=>{ui['folder-result'].textContent=error.message;});
window.addEventListener('beforeunload',event=>{if(quoteDirty){event.preventDefault();event.returnValue='';}});
$('#print').onclick=()=>run(()=>{calculate(quote.items);window.print();});
renderQuote();renderAdmin();
// 인쇄 시 입력 컨트롤을 일반 텍스트로 바꿔 긴 이름·설명도 줄바꿈한다.
let printDocument=null;
function clearPrintDocument(){printDocument?.remove();printDocument=null;}
window.addEventListener('beforeprint',()=>{
  clearPrintDocument();
  const copy=ui.paper.cloneNode(true);copy.id='print-document';printDocument=copy;
  copy.querySelectorAll('input,textarea').forEach(field=>{const text=document.createElement('div');text.className='print-value';text.textContent=field.value||'—';field.replaceWith(text);});
  document.body.append(copy);
});
window.addEventListener('afterprint',clearPrintDocument);
