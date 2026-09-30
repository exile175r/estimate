import {newQuote,copyQuote,snapshot,children,createNode,moveNode,deleteNode,duplicateItem} from './model.js';
import {calculate,formatAmount} from './calculation.js';
import {DriveStorage} from './storage.js';
const $ = selector => document.querySelector(selector);
const escape = value => String(value ?? '').replace(/[&<>"']/g,c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let nodes = [], quote = newQuote(), selected = null, pendingItem = null, quoteDirty = false;
const touchQuote = () => {quoteDirty=true;quote.updatedAt=new Date().toISOString();};
const collapsed = new Set(), storage = new DriveStorage();
const message = (text,error = false) => { const el=$('#message'); el.hidden=false; el.textContent=text; el.className=error?'error':'info'; };
const run = async fn => { try { await fn(); } catch(error) { message(error.message,true); } };
const input = (label,key,value,type='text',extra='') => `<label>${label}<input type="${type}" data-field="${key}" value="${escape(value)}" ${extra}></label>`;
function resizeQuoteTextareas() {
  if ($('#compose').hidden) return;
  $('#paper').querySelectorAll('textarea').forEach(field=>{
    field.style.height='auto';
    field.style.height=String(field.scrollHeight+2)+'px';
  });
}
window.addEventListener('resize',resizeQuoteTextareas);
document.fonts.ready.then(resizeQuoteTextareas);
function renderQuote() {
  $('#paper').innerHTML=`<div class="document-heading"><h2>견 적 서</h2><span>${escape(quote.quoteNumber)}<small>현재 작업본 · Drive 저장 안 됨</small></span></div><div class="quote-meta">${input('프로젝트명','projectName',quote.projectName)}${input('견적일','quoteDate',quote.quoteDate,'date')}${input('유효기간','validUntil',quote.validUntil,'date')}</div><div class="quote-lines">${quote.items.length?quote.items.map((item,i)=>`<section class="quote-line" data-line="${item.id}"><div class="line-title"><span class="line-index">${String(i+1).padStart(2,'0')}</span>${input('항목명','name',item.name)}<button data-remove="${item.id}" aria-label="${escape(item.name)} 삭제">삭제</button></div><label>설명<textarea data-field="description" rows="2">${escape(item.description)}</textarea></label><div class="line-numbers">${input('단가','price',item.price,'number','min="0" step="any"')}${input('수량','quantity',item.quantity,'number','min="0" step="any"')}${input('단위','unit',item.unit)}<div class="line-amount"><span>항목 금액</span><strong data-amount="${i}"></strong></div></div></section>`).join(''):'<div class="empty"><h3>첫 항목을 추가해주세요</h3><p>오른쪽 단가표에서 항목을 선택하면 이곳에 반영됩니다.</p></div>'}</div><div class="total"><span>합계 <small>임시 계산</small></span><strong id="total"></strong></div><label class="notes">비고<textarea data-field="notes" rows="3">${escape(quote.notes)}</textarea></label>`;
  updateAmounts();
  resizeQuoteTextareas();
}
function updateAmounts() {
  try {const {amounts,total}=calculate(quote.items); amounts.forEach((a,i)=>$(`[data-amount="${i}"]`).textContent=formatAmount(a)); $('#total').textContent=`${formatAmount(total)} 원`;}
  catch(error) {$('#total').textContent='입력값 확인 필요'; document.querySelectorAll('[data-amount]').forEach(el=>el.textContent='—');}
}
$('#paper').addEventListener('input',event=>{
  const field=event.target.dataset.field; if(!field)return;
  const line=event.target.closest('[data-line]'); const target=line?quote.items.find(i=>i.id===line.dataset.line):quote;
  target[field]=event.target.type==='number'?(event.target.value===''?NaN:Number(event.target.value)):event.target.value;
  touchQuote(); updateAmounts();
  if(event.target.tagName==='TEXTAREA') resizeQuoteTextareas();
});
$('#paper').addEventListener('click',event=>{const id=event.target.dataset.remove;if(id){quote.items=quote.items.filter(i=>i.id!==id);touchQuote();renderQuote();}});
function renderCatalog() {
  function branch(parentId) {return children(nodes,parentId).map(node=>node.type==='group'?`<details open><summary>${escape(node.name)}${node.active?'':' · 비활성 그룹'}</summary>${branch(node.id)}</details>`:node.active?`<button class="catalog-item" data-add="${node.id}"><span>${escape(node.name)}<small>${escape(node.description || node.unit)}</small></span><strong>${formatAmount(node.price)} <span>+</span></strong></button>`:'').join('');}
  $('#catalog').innerHTML=nodes.length?branch(null):'<div class="empty"><h3>단가표가 비어 있습니다</h3><p>단가표 관리에서 그룹과 항목을 만들어주세요.</p><button data-page="admin">단가표 만들기 →</button></div>';
}
$('#catalog').addEventListener('click',event=>{const button=event.target.closest('[data-add]');if(!button)return;const item=nodes.find(n=>n.id===button.dataset.add);if(quote.items.some(i=>i.sourceItemId===item.id)){pendingItem=item;$('#duplicate-dialog').returnValue='cancel';$('#duplicate-dialog').showModal();}else{quote.items.push(snapshot(item));touchQuote();renderQuote();}});
$('#duplicate-dialog').addEventListener('close',()=>{const choice=$('#duplicate-dialog').returnValue;if(choice==='row')quote.items.push(snapshot(pendingItem));if(choice==='quantity')quote.items.find(i=>i.sourceItemId===pendingItem.id).quantity+=1;if(choice==='row'||choice==='quantity')touchQuote();pendingItem=null;renderQuote();});
function renderTree() {
  function branch(parentId) {return children(nodes,parentId).map(node=>`<div role="treeitem" aria-selected="${selected===node.id}" ${node.type==='group'?`aria-expanded="${!collapsed.has(node.id)}"`:''}><div class="tree-row ${selected===node.id?'selected':''}" draggable="true" data-node="${node.id}">${node.type==='group'?`<button data-toggle="${node.id}" aria-label="접기 또는 펼치기">${collapsed.has(node.id)?'▸':'▾'}</button>`:'<span class="file-icon">▤</span>'}<button class="node-name" data-select="${node.id}">${escape(node.name)}${node.active?'':' (비활성)'}</button>${node.type==='group'?`<span class="into" data-into="${node.id}">안으로</span>`:''}</div>${node.type==='group'&&!collapsed.has(node.id)?`<div class="tree-children" role="group">${branch(node.id)}</div>`:''}</div>`).join('');}
  $('#tree').innerHTML=branch(null)||'<p class="empty">루트 그룹을 추가해 시작하세요.</p>';
}
function renderDetail() {
  const node=nodes.find(n=>n.id===selected);
  $('#detail').innerHTML=node?`<div class="panel-heading"><h2>${node.type==='group'?'그룹':'항목'} 상세</h2><p>변경은 현재 세션에 반영됩니다. 영구 보관에는 Drive 저장이 필요합니다.</p></div><div class="detail-form">${input('이름','name',node.name)}${node.type==='item'?`${input('기본 단가','price',node.price,'number','min="0" step="any"')}${input('단위','unit',node.unit)}<label>설명<textarea data-field="description" rows="4">${escape(node.description)}</textarea></label><label class="checkbox"><input type="checkbox" data-field="active" ${node.active?'checked':''}> 신규 견적에 사용</label>`:'<p class="hint">그룹 사용 여부 변경은 하위 항목 전파 정책 결정 후 연결합니다.</p>'}<div class="actions"><button id="rename">트리에서 이름 변경</button>${node.type==='item'?'<button id="duplicate-node">항목 복제</button>':''}<button id="delete-node" class="danger">삭제</button></div></div>`:'<div class="empty"><h2>편집할 대상을 선택하세요</h2><p>폴더는 그룹, 파일은 견적 항목입니다.</p></div>';
}
function renderAdmin(){renderTree();renderDetail();renderCatalog();}
$('#detail').addEventListener('input',event=>{const key=event.target.dataset.field;if(!key)return;const node=nodes.find(n=>n.id===selected);if(key==='price'&&(event.target.value===''||!Number.isFinite(Number(event.target.value))||Number(event.target.value)<0)){event.target.setCustomValidity('0 이상의 단가를 입력해주세요.');event.target.reportValidity();return;}event.target.setCustomValidity('');node[key]=event.target.type==='checkbox'?event.target.checked:event.target.type==='number'?Number(event.target.value):event.target.value;renderTree();renderCatalog();});
$('#detail').addEventListener('click',event=>run(()=>{
  if(event.target.id==='delete-node'){nodes=deleteNode(nodes,selected);selected=null;renderAdmin();}
  if(event.target.id==='duplicate-node'){selected=duplicateItem(nodes,selected).id;renderAdmin();}
  if(event.target.id==='rename'){
    const node=nodes.find(n=>n.id===selected),button=$(`[data-select="${selected}"]`),field=document.createElement('input');field.value=node.name;field.setAttribute('aria-label','이름 변경');button.replaceWith(field);field.focus();field.select();let done=false;
    const finish=save=>{if(done)return;done=true;if(save&&field.value.trim())node.name=field.value.trim();renderAdmin();};field.addEventListener('keydown',e=>{if(e.key==='Enter')finish(true);if(e.key==='Escape')finish(false);});field.addEventListener('blur',()=>finish(true));
  }
}));
$('#tree').addEventListener('click',event=>{const toggle=event.target.dataset.toggle,id=event.target.dataset.select;if(toggle){collapsed.has(toggle)?collapsed.delete(toggle):collapsed.add(toggle);renderTree();}if(id){selected=id;renderAdmin();}});
$('#tree').addEventListener('dragstart',event=>{const row=event.target.closest('[data-node]');if(row)event.dataTransfer.setData('text/plain',row.dataset.node);});
for(const el of [$('#tree'),$('#root-drop')]){el.addEventListener('dragover',e=>{e.preventDefault();e.dataTransfer.dropEffect='move';});el.addEventListener('drop',event=>{event.preventDefault();run(()=>{const id=event.dataTransfer.getData('text/plain'),into=event.target.closest('[data-into]'),row=event.target.closest('[data-node]');if(into)moveNode(nodes,id,into.dataset.into);else if(row){const target=nodes.find(n=>n.id===row.dataset.node);if(target.id===id)return;moveNode(nodes,id,target.parentId,target.id);}else if(el.id==='root-drop')moveNode(nodes,id,null);renderAdmin();});});}
function add(type,root=false){run(()=>{const current=nodes.find(n=>n.id===selected);const parentId=root?null:current?.type==='group'?current.id:current?.parentId;if(!root&&!parentId)throw new Error('그룹을 먼저 선택해주세요.');selected=createNode(nodes,type,parentId).id;if(parentId)collapsed.delete(parentId);renderAdmin();});}
$('#root-group').onclick=()=>add('group',true);$('#child-group').onclick=()=>add('group');$('#add-item').onclick=()=>add('item');
document.addEventListener('click',event=>{const page=event.target.closest('[data-page]')?.dataset.page;if(!page)return;document.querySelectorAll('.page').forEach(el=>el.hidden=el.id!==page);document.querySelectorAll('nav button').forEach(el=>el.classList.toggle('active',el.dataset.page===page));resizeQuoteTextareas();});
$('#new-quote').onclick=()=>{if(quoteDirty&&!confirm('현재 견적은 저장되지 않았습니다. 새 견적을 작성할까요?'))return;quote=newQuote();quoteDirty=false;renderQuote();};
$('#copy-quote').onclick=()=>{quote=copyQuote(quote);quoteDirty=true;renderQuote();message('새 ID와 견적번호로 작업본을 복사했습니다. Drive에는 저장되지 않았습니다.');};
for(const [id,status] of [['draft','draft'],['save','saved']])$('#'+id).onclick=()=>run(async()=>{calculate(quote.items);await storage.saveQuote({...quote,status});});
$('#save-catalog').onclick=()=>run(()=>storage.saveCatalog(nodes));$('#refresh').onclick=()=>run(()=>storage.listQuotes());
$('#folder').addEventListener('input',()=>{storage.folderId='';$('#folder-result').textContent='입력값이 변경되었습니다. 연결 확인이 필요합니다.';});
$('#check-drive').onclick=()=>run(async()=>{storage.configure($('#folder').value);$('#folder-result').textContent=`폴더 ID 형식 확인: ${storage.folderId} · 실제 접근·쓰기 권한은 확인되지 않았습니다.`;await storage.check();});
$('#print').onclick=()=>run(()=>{calculate(quote.items);window.print();});
renderQuote();renderAdmin();
// 인쇄 시 입력 컨트롤을 일반 텍스트로 바꿔 긴 이름·설명도 줄바꿈한다.
window.addEventListener('beforeprint',()=>{
  document.querySelector('#print-document')?.remove();
  const copy=$('#paper').cloneNode(true);copy.id='print-document';
  copy.querySelectorAll('input,textarea').forEach(field=>{const text=document.createElement('div');text.className='print-value';text.textContent=field.value||'—';field.replaceWith(text);});
  document.body.append(copy);
});
window.addEventListener('afterprint',()=>$('#print-document')?.remove());
