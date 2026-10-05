import {newQuote,copyQuote,snapshot,children,createNode,moveNode,deleteNode,duplicateItem} from './model.js';
import {calculateQuote,formatAmount,parseAmount} from './calculation.js';
import {DriveStorage} from './storage.js';
import {GoogleAuth} from './google-auth.js';
import {emptyWorkspace,validateWorkspace,ensureProject,progress,calendarEntries,quoteStatuses,taskStatuses} from './workflow.js';
import {loadRecovery,saveRecovery} from './recovery.js';
import {createQuotePdf} from './pdf.js';
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
const touchQuote = () => {quoteDirty=true;quote.updatedAt=new Date().toISOString();scheduleRecovery();};
const auth=new GoogleAuth(config);
const collapsed = new Set(), storage = new DriveStorage({getToken:()=>auth.getToken()});
let savedSignature='', pdfSignature='', activeFileId='', uiBusy=false;
let workspace=emptyWorkspace(),recoveryTimer,workspaceSignature='',localSavedAt='',archive=[],recoveryBlocked=false;
const signature=()=>JSON.stringify(quote);
const updateSavedState=()=>{const label=$('.document-heading small');if(label)label.textContent=savedSignature===signature()?(pdfSignature===signature()?'Drive JSON·PDF 저장됨':'Drive JSON 저장됨 · PDF 확인 필요'):'현재 작업본 · Drive 저장 안 됨';const local=$('#local-state');if(local)local.textContent=recoveryBlocked?'자동 복구 중지 · 기존 데이터 확인 필요':localSavedAt?`이 브라우저에 임시 저장됨 ${new Date(localSavedAt).toLocaleTimeString('ko-KR')}`:'임시 저장 대기';const work=$('#workspace-state');if(work)work.textContent=workspaceSignature===JSON.stringify(workspace)?'업무·설정 Drive 저장됨':'업무·설정 Drive 저장 필요';};
const message = (text,error = false) => { const el=ui.message; el.hidden=false; el.textContent=text; el.className=error?'error':'info'; };
const run = async fn => { try { await fn(); } catch(error) { message(error.message,true); } };
const input = (label,key,value,type='text',extra='') => `<label>${label}<input type="${type}" data-field="${key}" value="${escape(value)}" ${extra}></label>`;
const select=(label,key,value,options,extra='')=>`<label>${label}<select data-field="${key}" ${extra}>${Object.entries(options).map(([v,text])=>`<option value="${v}" ${v===value?'selected':''}>${text}</option>`).join('')}</select></label>`;
function persistRecovery(){
  clearTimeout(recoveryTimer);
  if(recoveryBlocked)return;
  try{saveRecovery({quote,nodes,workspace,folderId:storage.folderId,savedSignature,pdfSignature,activeFileId,workspaceSignature});localSavedAt=new Date().toISOString();updateSavedState();}
  catch(error){localSavedAt='';$('#local-state').textContent='임시 저장 실패';message(`자동 복구용 저장 실패: ${error.message}`,true);}
}
function scheduleRecovery(){clearTimeout(recoveryTimer);recoveryTimer=setTimeout(persistRecovery,400);}
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
  const modern=Boolean(quote.calculationVersion),individual=quote.discountMode==='individual';
  ui.paper.innerHTML=`<div class="document-heading"><h2>견 적 서</h2><span>${escape(quote.quoteNumber)}<small></small></span></div>
  <div class="quote-meta">${input('업체명','companyName',quote.companyName,'text','list="company-names"')}${input('업체 구분 코드 (동명 업체만)','companyCode',quote.companyCode)}${input('프로젝트명','projectName',quote.projectName)}${input('수신처','recipient',quote.recipient)}${input('발행자 정보','issuer',quote.issuer)}${input('견적일','quoteDate',quote.quoteDate,'date')}${input('유효기간','validUntil',quote.validUntil,'date')}${input('납기','deliveryDate',quote.deliveryDate,'date')}${input('결제 조건','paymentTerms',quote.paymentTerms)}</div>
  <div class="calculation-settings">${modern?`${select('할인 방식','discountMode',quote.discountMode,{none:'할인 없음',global:'전체 할인',individual:'개별 할인'})}${input('전체 할인율 (%)','globalDiscount',quote.globalDiscount,'number',`min="0" max="100" step="any" ${quote.discountMode==='global'?'':'disabled'}`)}<label class="checkbox"><input type="checkbox" data-field="vatIncluded" ${quote.vatIncluded?'checked':''}> 입력 단가에 VAT 포함</label><p>VAT 미포함 시 세액 10%를 추가합니다. 할인 적용 단가·품목 금액·세액은 원 단위 반올림합니다.</p>`:'<p>기존 계산 방식으로 금액을 보존 중입니다.</p><button id="upgrade-calculation">할인·VAT 계산 사용</button>'}</div>
  <div class="quote-lines">${quote.items.length?quote.items.map((item,i)=>`<section class="quote-line" data-line="${item.id}"><div class="line-title"><span class="line-index">${String(i+1).padStart(2,'0')}</span>${input('항목명','name',item.name)}<button data-remove="${item.id}" aria-label="${escape(item.name)} 삭제">삭제</button></div><label>설명<textarea data-field="description" rows="2">${escape(item.description)}</textarea></label><div class="line-numbers">${input('단가','price',Number.isFinite(item.price)?formatAmount(item.price):'','text','inputmode="decimal"')}${input('수량','quantity',item.quantity,'number','min="0" step="any"')}${input('단위','unit',item.unit)}<div class="line-amount"><span>항목 금액</span><strong data-amount="${i}"></strong></div></div>${modern?`<div class="line-discount">${select('개별 할인','discountType',item.discountType||'none',{none:'없음',percent:'비율 (%)',amount:'개당 금액 (원)'},individual?'':'disabled')}${input('할인값','discountValue',item.discountValue??0,'text',`inputmode="decimal" ${individual&&item.discountType&&item.discountType!=='none'?'':'disabled'}`)}<span>적용 단가 <strong data-unit="${i}"></strong></span></div>`:''}</section>`).join(''):'<div class="empty"><h3>첫 항목을 추가해주세요</h3><p>오른쪽 단가표에서 항목을 선택하면 이곳에 반영됩니다.</p></div>'}</div>
  <div id="breakdown"></div><div class="total"><span>최종 합계</span><strong id="total"></strong></div><label class="notes">비고<textarea data-field="notes" rows="3">${escape(quote.notes)}</textarea></label><footer class="quote-footer">발행일 <span id="footer-date">${escape(quote.quoteDate)}</span> · ${escape(quote.quoteNumber)}</footer>`;
  updateAmounts();
  updateSavedState();renderManagement();
  resizeQuoteTextareas();
}
function updateAmounts() {
  const totalElement=$('#total'), amountElements=$$('[data-amount]');
  try {const result=calculateQuote(quote);result.amounts.forEach((a,i)=>amountElements[i].textContent=formatAmount(a));$$('[data-unit]').forEach((el,i)=>el.textContent=formatAmount(result.units[i])+' 원');totalElement.textContent=`${formatAmount(result.total)} 원`;$('#breakdown').innerHTML=result.supply!==undefined?`<p>할인 전 ${formatAmount(result.original)}원 · 할인액 ${formatAmount(result.discount)}원</p><p>공급가액 <strong>${formatAmount(result.supply)}원</strong> · 세액 <strong>${formatAmount(result.tax)}원</strong></p>`:'';}
  catch(error) {totalElement.textContent='입력값 확인 필요';$('#breakdown').textContent=error.message;amountElements.forEach(el=>el.textContent='—');$$('[data-unit]').forEach(el=>el.textContent='—');}
}
ui['paper'].addEventListener('input',event=>{
  const field=event.target.dataset.field; if(!field)return;
  const line=event.target.closest('[data-line]'); const target=line?quote.items.find(i=>i.id===line.dataset.line):quote;
  target[field]=event.target.type==='checkbox'?event.target.checked:['price','quantity','globalDiscount','discountValue'].includes(field)?parseAmount(event.target.value):event.target.value;
  touchQuote(); updateAmounts(); updateSavedState();
  if(field==='quoteDate')$('#footer-date').textContent=quote.quoteDate;
  if(['discountMode','discountType'].includes(field))renderQuote();
  if(event.target.tagName==='TEXTAREA') resizeQuoteTextareas();
});
ui['paper'].addEventListener('click',event=>{const id=event.target.dataset.remove;if(id){quote.items=quote.items.filter(i=>i.id!==id);touchQuote();renderQuote();}if(event.target.id==='upgrade-calculation'&&confirm('기존 금액에 VAT 별도 계산을 적용합니다. 새 계산 방식을 사용할까요?')){Object.assign(quote,{calculationVersion:1,discountMode:'none',globalDiscount:0,vatIncluded:false,taxRate:0.1,companyName:quote.companyName||'',companyCode:quote.companyCode||'',recipient:quote.recipient||'',issuer:quote.issuer||'',deliveryDate:quote.deliveryDate||'',paymentTerms:quote.paymentTerms||'',projectId:quote.projectId||crypto.randomUUID(),workflowStatus:quote.workflowStatus||'draft'});touchQuote();renderQuote();}});
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
  ui['detail'].innerHTML=node?`<div class="panel-heading"><h2>${node.type==='group'?'그룹':'항목'} 상세</h2><p>변경은 현재 세션에 반영됩니다. 영구 보관에는 Drive 저장이 필요합니다.</p></div><div class="detail-form">${input('이름','name',node.name)}${node.type==='item'?`${input('기본 단가','price',node.price,'text','inputmode="decimal"')}${input('단위','unit',node.unit)}<label>설명<textarea data-field="description" rows="4">${escape(node.description)}</textarea></label><label class="checkbox"><input type="checkbox" data-field="active" ${node.active?'checked':''}> 신규 견적에 사용</label>`:'<p class="hint">그룹 사용 여부 변경은 하위 항목 전파 정책 결정 후 연결합니다.</p>'}<div class="actions"><button id="rename">트리에서 이름 변경</button>${node.type==='item'?'<button id="duplicate-node">항목 복제</button>':''}<button id="delete-node" class="danger">삭제</button></div></div>`:'<div class="empty"><h2>편집할 대상을 선택하세요</h2><p>폴더는 그룹, 파일은 견적 항목입니다.</p></div>';
}
function renderAdmin(){renderTree();renderDetail();renderCatalog();scheduleRecovery();}
ui['detail'].addEventListener('input',event=>{const key=event.target.dataset.field;if(!key)return;const node=nodes.find(n=>n.id===selected);if(key==='price'&&!Number.isFinite(parseAmount(event.target.value))){event.target.setCustomValidity('0 이상의 단가를 입력해주세요.');event.target.reportValidity();return;}event.target.setCustomValidity('');node[key]=event.target.type==='checkbox'?event.target.checked:key==='price'?parseAmount(event.target.value):event.target.value;renderTree();renderCatalog();scheduleRecovery();});
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
$('#new-quote').onclick=()=>{if(quoteDirty&&!confirm('현재 견적은 저장되지 않았습니다. 새 견적을 작성할까요?'))return;quote=newQuote(workspace.issuer);quoteDirty=false;savedSignature='';activeFileId='';renderQuote();scheduleRecovery();};
$('#copy-quote').onclick=()=>{quote=copyQuote(quote);quoteDirty=true;savedSignature='';activeFileId='';renderQuote();scheduleRecovery();message('새 ID와 견적번호로 작업본을 복사했습니다. 프로젝트 업무는 기존 연결을 유지합니다.');};
async function busy(action) {
  if(uiBusy){message('작업이 진행 중입니다. 잠시 기다려주세요.',true);return;}
  uiBusy=true;const controls=[...$$('button,input,textarea,select')];const disabled=controls.map(el=>el.disabled);controls.forEach(el=>el.disabled=true);try{await action();}catch(error){message(error.message,true);}finally{controls.forEach((el,i)=>el.disabled=disabled[i]);uiBusy=false;updateSavedState();}
}
for(const [id,status] of [['draft','draft'],['save','saved']])$('#'+id).onclick=()=>busy(async()=>{
  calculateQuote(quote);
  if(!quote.companyName?.trim())throw new Error('업체명을 입력해주세요. 브라우저 임시 저장은 유지됩니다.');
  message('Drive 견적 저장 중…');
  const before=signature(),pending={...structuredClone(quote),status};
  const result=await storage.saveQuote(pending);
  const unchanged=before===signature();
  if(unchanged){quote=result.value;activeFileId=result.fileId;savedSignature=signature();quoteDirty=false;updateSavedState();}
  persistRecovery();
  try{await storage.savePdf(pending,result.fileId,await createQuotePdf(pending));if(unchanged)pdfSignature=signature();persistRecovery();}
  catch(error){throw new Error(`견적 JSON은 저장됨 · PDF 저장 실패: ${error.message}`);}
  message(unchanged?'업체 폴더에 견적 JSON과 PDF를 저장하고 내용을 확인했습니다. 업무·일정은 별도 저장 버튼을 사용해주세요.':'Drive에 저장했습니다. 저장 중 추가 수정한 내용은 다시 저장해주세요.');
});
$('#save-catalog').onclick=()=>busy(async()=>{await storage.saveCatalog(nodes);message('단가표를 Drive에 저장하고 내용을 확인했습니다.');});
$('#load-catalog').onclick=()=>busy(async()=>{
  if(nodes.length&&!confirm('현재 단가표를 Drive의 단가표로 바꿀까요? 저장하지 않은 변경은 사라집니다.'))return;
  const loaded=await storage.loadCatalog();nodes=loaded;selected=null;renderAdmin();message('Drive 단가표를 불러왔습니다.');
});
async function refreshQuotes(){
  const files=await storage.listQuotes();
  const loaded=[];for(const file of files){try{loaded.push({file,quote:await storage.loadQuote(file.id)});}catch(error){loaded.push({file,error:error.message});}}
  archive=loaded;renderArchive();
}
function renderArchive(){
  const query=$('#archive-search').value.trim().toLowerCase(),status=$('#archive-status').value;
  const rows=archive.filter(row=>row.error||(!status||(row.quote.workflowStatus||'draft')===status)&&`${row.quote.companyName} ${row.quote.projectName} ${row.quote.quoteNumber}`.toLowerCase().includes(query));
  ui['quote-list'].innerHTML=rows.length?rows.map(({file,quote:q,error})=>error?`<p>${escape(file.name)}: ${escape(error)}</p>`:`<div class="saved-row"><strong>${escape(q.companyName||'업체 미지정')} · ${escape(q.projectName||'이름 없음')}</strong><span>${escape(q.quoteNumber)} · ${escape(q.quoteDate)} · ${formatAmount(calculateQuote(q).total)}원</span><span>${quoteStatuses[q.workflowStatus||'draft']} · ${progress(workspace.projects.find(p=>p.id===q.projectId))}</span><div class="actions"><button data-load="${escape(file.id)}">불러오기 / 상태·업무</button><button data-trash="${escape(file.id)}">휴지통으로 이동</button></div></div>`).join(''):'<p>조건에 맞는 저장된 견적이 없습니다.</p>';
  $('#company-names').innerHTML=[...new Set(archive.filter(r=>r.quote).map(r=>r.quote.companyName).filter(Boolean))].map(name=>`<option value="${escape(name)}">`).join('');
}
$('#refresh').onclick=()=>busy(refreshQuotes);
ui['quote-list'].onclick=event=>busy(async()=>{
  const id=event.target.dataset.load,trash=event.target.dataset.trash;
  if(id){
    if(quoteDirty&&!confirm('저장하지 않은 현재 견적을 바꿀까요?'))return;
    const loaded=await storage.loadQuote(id);quote=loaded;activeFileId=id;savedSignature=signature();pdfSignature='';quoteDirty=false;renderQuote();persistRecovery();showPage('compose');message('Drive 견적을 불러왔습니다.');
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
async function checkFolder(){const folder=await storage.check();ui['folder-result'].textContent=folder.name+' · 접근 및 저장 권한 확인됨';connection.textContent='Drive 연결됨';persistRecovery();}
$('#check-drive').onclick=()=>busy(async()=>{if(storage.folderId!==ui['folder'].value)storage.configure(ui['folder'].value);ui['folder-result'].textContent='폴더 접근·쓰기 권한 확인 중';await checkFolder();});
$('#connect-drive').onclick=()=>busy(async()=>{await auth.authorize();message('Google 연결 완료. 폴더 선택에서 저장 폴더를 허용해주세요.');});
$('#pick-folder').onclick=()=>busy(async()=>{const id=await auth.pickFolder();storage.configure(id);ui['folder'].value=id;savedSignature='';activeFileId='';updateSavedState();await checkFolder();});
$('#disconnect-drive').onclick=()=>{auth.disconnect();storage.versions.clear();connection.textContent='Drive 미연결';ui['folder-result'].textContent='연결을 해제했습니다.';message('Google 연결을 해제했습니다. 작성 내용은 유지됩니다.');};

auth.prepare().catch(error=>{ui['folder-result'].textContent=error.message;});
window.addEventListener('pagehide',persistRecovery);
document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='hidden')persistRecovery();});
$('#print').onclick=()=>run(()=>{calculateQuote(quote);window.print();});
// 인쇄 시 입력 컨트롤을 일반 텍스트로 바꿔 긴 이름·설명도 줄바꿈한다.
let printDocument=null;
function clearPrintDocument(){printDocument?.remove();printDocument=null;}
window.addEventListener('beforeprint',()=>{
  clearPrintDocument();
  const copy=ui.paper.cloneNode(true);copy.id='print-document';printDocument=copy;
  copy.querySelectorAll('input,textarea,select').forEach(field=>{if(field.disabled){field.closest('label')?.remove();return;}const text=document.createElement('div');text.className='print-value';text.textContent=field.type==='checkbox'?(field.checked?'포함':'별도'):field.tagName==='SELECT'?field.selectedOptions[0]?.textContent:field.value||'—';field.replaceWith(text);});
  document.body.append(copy);
});
window.addEventListener('afterprint',clearPrintDocument);

let selectedProject='',selectedDay='';
function renderManagement(){
  const project=workspace.projects.find(p=>p.id===quote.projectId);
  $('#management').innerHTML=`<h2>견적·프로젝트 관리</h2>${select('견적 상태','workflowStatus',quote.workflowStatus||'draft',quoteStatuses)}<p>상태는 직접 변경한 뒤 견적을 저장해주세요.</p><label>연결 프로젝트<select id="quote-project"><option value="">새 프로젝트로 연결</option>${workspace.projects.map(p=>`<option value="${escape(p.id)}" ${p.id===quote.projectId?'selected':''}>${escape(p.companyName)} · ${escape(p.name||'이름 없음')}</option>`).join('')}</select></label><p>${progress(project)}</p><button id="open-project">프로젝트 업무 관리</button>`;
}
$('#management').addEventListener('change',event=>{
  if(event.target.dataset.field==='workflowStatus')quote.workflowStatus=event.target.value;
  if(event.target.id==='quote-project')quote.projectId=event.target.value||crypto.randomUUID();
  touchQuote();updateSavedState();renderManagement();
});
$('#management').addEventListener('click',event=>{
  if(event.target.id!=='open-project')return;
  const project=ensureProject(workspace,quote);selectedProject=project.id;scheduleRecovery();renderWorkflow();showPage('calendar');
});
function renderWorkflow(){
  $('#issuer-default').value=workspace.issuer;
  const project=workspace.projects.find(p=>p.id===selectedProject)||workspace.projects[0];selectedProject=project?.id||'';
  $('#project-manager').innerHTML=`<label>프로젝트<select id="manage-project"><option value="">프로젝트 선택</option>${workspace.projects.map(p=>`<option value="${escape(p.id)}" ${p.id===selectedProject?'selected':''}>${escape(p.companyName)} · ${escape(p.name||'이름 없음')}</option>`).join('')}</select></label>${project?`<div class="project-fields"><label>프로젝트명<input data-project-field="name" value="${escape(project.name)}"></label><label>업체명<input data-project-field="companyName" value="${escape(project.companyName)}"></label></div><p id="task-progress">${progress(project)}</p><form id="task-form" class="actions"><label>새 업무<input id="task-title" required></label><button type="submit">업무 추가</button></form><div id="task-list">${project.tasks.map((t,i)=>`<div class="task-row" data-task="${escape(t.id)}"><label class="checkbox"><input type="checkbox" data-task-key="complete" ${t.status==='done'?'checked':''}>완료</label><label>업무명<input data-task-key="title" value="${escape(t.title)}"></label><label>상태<select data-task-key="status">${Object.entries(taskStatuses).map(([key,label])=>`<option value="${key}" ${t.status===key?'selected':''}>${label}</option>`).join('')}</select></label><label>마감일<input type="date" data-task-key="dueDate" value="${escape(t.dueDate)}"></label><label>메모<input data-task-key="notes" value="${escape(t.notes)}"></label><div class="actions"><button data-task-action="up" ${i?'':'disabled'} aria-label="업무 위로">↑</button><button data-task-action="down" ${i<project.tasks.length-1?'':'disabled'} aria-label="업무 아래로">↓</button><button data-task-action="delete">업무 삭제</button></div></div>`).join('')}</div>`:'<p>견적 작성 화면에서 프로젝트 업무 관리를 눌러 시작하세요.</p>'}`;
  const previous=$('#event-project').value;
  $('#event-project').innerHTML='<option value="">일반 일정</option>'+workspace.projects.map(p=>`<option value="${escape(p.id)}">${escape(p.companyName)} · ${escape(p.name||'이름 없음')}</option>`).join('');
  $('#event-project').value=previous||selectedProject;
  renderCalendar();updateSavedState();
}
$('#project-manager').addEventListener('submit',event=>{
  if(event.target.id!=='task-form')return;event.preventDefault();const title=$('#task-title').value.trim();if(!title)return;
  workspace.projects.find(p=>p.id===selectedProject).tasks.push({id:crypto.randomUUID(),title,status:'todo',dueDate:'',notes:''});scheduleRecovery();renderWorkflow();$('#task-title').focus();
});
$('#project-manager').addEventListener('change',event=>{
  if(event.target.id==='manage-project'){selectedProject=event.target.value;renderWorkflow();return;}
  const project=workspace.projects.find(p=>p.id===selectedProject);if(!project)return;
  const field=event.target.dataset.projectField,key=event.target.dataset.taskKey;
  if(field)project[field]=event.target.value;
  if(key){const task=project.tasks.find(t=>t.id===event.target.closest('[data-task]').dataset.task);if(key==='complete')task.status=event.target.checked?'done':'todo';else task[key]=event.target.value;}
  if(field||key){scheduleRecovery();renderWorkflow();renderManagement();}
});
$('#project-manager').addEventListener('input',event=>{
  const project=workspace.projects.find(p=>p.id===selectedProject);if(!project)return;
  const field=event.target.dataset.projectField,key=event.target.dataset.taskKey;
  if(field)project[field]=event.target.value;
  if(['title','dueDate','notes'].includes(key))project.tasks.find(t=>t.id===event.target.closest('[data-task]').dataset.task)[key]=event.target.value;
  if(field||key)scheduleRecovery();
});
$('#project-manager').addEventListener('click',event=>{
  const action=event.target.dataset.taskAction;if(!action)return;const tasks=workspace.projects.find(p=>p.id===selectedProject).tasks;
  const index=tasks.findIndex(t=>t.id===event.target.closest('[data-task]').dataset.task);
  if(action==='delete'){if(!confirm('이 업무를 삭제할까요?'))return;tasks.splice(index,1);}else{const next=index+(action==='up'?-1:1);if(next<0||next>=tasks.length)return;[tasks[index],tasks[next]]=[tasks[next],tasks[index]];}
  scheduleRecovery();renderWorkflow();renderManagement();
});
function renderCalendar(){
  const month=$('#calendar-month').value;if(!/^\d{4}-\d{2}$/.test(month))return;
  const [year,m]=month.split('-').map(Number),days=new Date(year,m,0).getDate(),start=new Date(year,m-1,1).getDay(),entries=calendarEntries(workspace);
  $('#calendar-grid').innerHTML=['일','월','화','수','목','금','토'].map(day=>`<strong>${day}</strong>`).join('')+'<span></span>'.repeat(start)+Array.from({length:days},(_,i)=>{const date=`${month}-${String(i+1).padStart(2,'0')}`,count=entries.filter(e=>e.date===date).length;return `<button data-day="${date}" class="${selectedDay===date?'active':''}">${i+1}<small>${count?`${count}건`:''}</small></button>`;}).join('');
  const filtered=entries.filter(e=>selectedDay?e.date===selectedDay:e.date.startsWith(month)).sort((a,b)=>a.date.localeCompare(b.date));
  $('#event-list').innerHTML=`<div class="actions"><h3>${escape(selectedDay||month)} 일정</h3><button id="all-month">월 전체 보기</button></div>`+(filtered.length?filtered.map(e=>`<div class="event-row" data-event="${escape(e.id)}"><span>${escape(e.kind)}</span>${e.kind==='후속 연락'?`<label>날짜<input type="date" data-event-field="date" value="${escape(e.date)}"></label><label>내용<input data-event-field="title" value="${escape(e.title)}"></label><button data-delete-event="${escape(e.id)}">일정 삭제</button>`:`<span>${escape(e.date)} · ${escape(e.title)}</span>`}${e.projectId?`<button data-open-project="${escape(e.projectId)}">${escape(workspace.projects.find(p=>p.id===e.projectId)?.name||'프로젝트')} 업무 보기</button>`:''}</div>`).join(''):'<p>등록된 일정이 없습니다.</p>');
}
$('#calendar-month').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date()).slice(0,7);
$('#event-date').value=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
$('#calendar-month').onchange=()=>{selectedDay='';renderCalendar();};
$('#calendar-grid').onclick=event=>{const day=event.target.closest('[data-day]')?.dataset.day;if(day){selectedDay=day;$('#event-date').value=day;renderCalendar();}};
$('#event-form').onsubmit=event=>{event.preventDefault();const title=$('#event-title').value.trim(),date=$('#event-date').value;if(!title||!date)return;workspace.events.push({id:crypto.randomUUID(),title,date,projectId:$('#event-project').value});$('#calendar-month').value=date.slice(0,7);selectedDay=date;$('#event-title').value='';scheduleRecovery();renderCalendar();};
$('#event-list').addEventListener('change',event=>{const key=event.target.dataset.eventField;if(!key)return;const entry=workspace.events.find(e=>e.id===event.target.closest('[data-event]').dataset.event);if(!event.target.value.trim()){renderCalendar();return;}entry[key]=event.target.value;scheduleRecovery();renderCalendar();});
$('#event-list').onclick=event=>{if(event.target.id==='all-month'){selectedDay='';renderCalendar();}const id=event.target.dataset.deleteEvent;if(id&&confirm('이 일정을 삭제할까요?')){workspace.events=workspace.events.filter(e=>e.id!==id);scheduleRecovery();renderCalendar();}const project=event.target.dataset.openProject;if(project){selectedProject=project;renderWorkflow();$('#project-manager').scrollIntoView({behavior:'smooth'});}};
$('#issuer-default').oninput=event=>{workspace.issuer=event.target.value;scheduleRecovery();updateSavedState();};
$('#save-workspace').onclick=()=>busy(async()=>{const pending=structuredClone(workspace);message('업무·설정 Drive 저장 중…');await storage.saveWorkspace(pending);workspaceSignature=JSON.stringify(pending);persistRecovery();message('업무·일정·발행자 기본 정보를 Drive에 저장하고 확인했습니다.');});
$('#load-workspace').onclick=()=>busy(async()=>{if(workspaceSignature!==JSON.stringify(workspace)&&!confirm('현재 업무·일정·설정을 Drive 데이터로 바꿀까요? 저장하지 않은 변경은 사라집니다.'))return;const loaded=await storage.loadWorkspace();workspace=loaded||emptyWorkspace();workspaceSignature=JSON.stringify(workspace);renderWorkflow();renderManagement();persistRecovery();message(loaded?'Drive 업무·설정을 불러왔습니다.':'Drive에 저장된 업무·설정이 없습니다.');});
$('#archive-search').oninput=renderArchive;$('#archive-status').onchange=renderArchive;
$('#download-pdf').onclick=()=>busy(async()=>{const blob=await createQuotePdf(quote),url=URL.createObjectURL(blob),link=document.createElement('a');link.href=url;link.download=`${quote.quoteNumber}.pdf`;link.click();setTimeout(()=>URL.revokeObjectURL(url),10000);message('PDF를 내려받았습니다. Drive 저장과는 별개입니다.');});
document.addEventListener('focusout',event=>{if(event.target.dataset.field==='price'&&event.target.closest('#paper')){const value=parseAmount(event.target.value);if(Number.isFinite(value))event.target.value=formatAmount(value);}});
try{
  const recovered=loadRecovery();
  if(recovered){quote=recovered.quote;nodes=recovered.nodes;workspace=validateWorkspace(recovered.workspace||emptyWorkspace());savedSignature=recovered.savedSignature||'';pdfSignature=recovered.pdfSignature||'';activeFileId=recovered.activeFileId||'';workspaceSignature=recovered.workspaceSignature||'';if(recovered.folderId){storage.configure(recovered.folderId);ui.folder.value=recovered.folderId;}localSavedAt=recovered.recoveredAt;quoteDirty=savedSignature!==signature();message('이 브라우저의 작업을 복구했습니다. Drive 작업은 Google 재연결 후 진행해주세요.');}
}catch(error){recoveryBlocked=true;message(`복구 실패: ${error.message} 원본 보호를 위해 자동 임시 저장을 중지했습니다.`,true);}
renderQuote();renderAdmin();renderWorkflow();
