import test from 'node:test';
import assert from 'node:assert/strict';
import {createNode,moveNode,deleteNode,duplicateItem,snapshot,newQuote,copyQuote,children} from '../src/model.js';
import {calculate,calculateQuote,parseAmount} from '../src/calculation.js';
import {emptyWorkspace,ensureProject,calendarEntries,progress} from '../src/workflow.js';
import {saveRecovery,loadRecovery} from '../src/recovery.js';
import {DriveStorage,parseFolderId} from '../src/storage.js';
test('무제한 하위 그룹과 순환 이동 방지',()=>{const nodes=[];const root=createNode(nodes,'group');let parent=root;for(let i=0;i<30;i++)parent=createNode(nodes,'group',parent.id);assert.throws(()=>moveNode(nodes,root.id,parent.id),/하위/);assert.equal(root.parentId,null);assert.throws(()=>moveNode(nodes,root.id,root.id),/자신/);});
test('그룹 간 이동과 정렬을 JSON 왕복 후 유지',()=>{const nodes=[];const a=createNode(nodes,'group'),b=createNode(nodes,'group');const x=createNode(nodes,'item',a.id),y=createNode(nodes,'item',b.id);moveNode(nodes,x.id,b.id,y.id);const restored=JSON.parse(JSON.stringify(nodes));assert.deepEqual(children(restored,b.id).map(n=>n.id),[x.id,y.id]);assert.throws(()=>moveNode(nodes,x.id,null),/그룹/);});
test('견적 스냅샷은 기본값 수정·비활성화·삭제와 독립',()=>{let nodes=[];const group=createNode(nodes,'group');const item=createNode(nodes,'item',group.id);Object.assign(item,{name:'로그인',price:300000,description:'이메일 로그인',unit:'건'});const line=snapshot(item);item.price=400000;item.active=false;nodes=deleteNode(nodes,item.id);assert.equal(line.price,300000);assert.equal(line.name,'로그인');line.name='견적 수정';assert.equal(item.name,'로그인');assert.equal(nodes.length,1);});
test('항목 복제와 견적 복사에 별도 ID 발급',()=>{const nodes=[];const group=createNode(nodes,'group');const item=createNode(nodes,'item',group.id);const duplicate=duplicateItem(nodes,item.id);assert.notEqual(item.id,duplicate.id);const quote=newQuote();quote.items.push(snapshot(item));quote.projectName='프로젝트';const copy=copyQuote(quote);assert.notEqual(copy.id,quote.id);assert.notEqual(copy.quoteNumber,quote.quoteNumber);assert.notEqual(copy.items[0].id,quote.items[0].id);assert.equal(copy.projectName,quote.projectName);copy.items[0].price=20;assert.equal(quote.items[0].price,0);});
test('미결정 그룹 삭제·복제를 실행하지 않음',()=>{const nodes=[];const group=createNode(nodes,'group');createNode(nodes,'item',group.id);assert.throws(()=>deleteNode(nodes,group.id),/미결정/);assert.throws(()=>duplicateItem(nodes,group.id),/미결정/);assert.equal(nodes.length,2);});
test('임시 계산과 잘못된 입력 차단',()=>{assert.deepEqual(calculate([{price:300000,quantity:2},{price:50000,quantity:3}]),{amounts:[600000,150000],total:750000});assert.equal(calculate([]).total,0);for(const price of [-1,NaN,Infinity])assert.throws(()=>calculate([{price,quantity:1}]));assert.throws(()=>calculate([{price:Number.MAX_VALUE,quantity:2}]));});
test('Drive 폴더 입력 검증',()=>{assert.equal(parseFolderId('https://drive.google.com/drive/folders/abc_123?usp=sharing'),'abc_123');assert.equal(parseFolderId('abc-123'),'abc-123');for(const value of ['', '/tmp/folder','https://example.com/drive/folders/abc','https://drive.google.com/file/d/abc'])assert.throws(()=>parseFolderId(value));});
test('연결 전 저장은 반드시 실패하고 견적을 보존',async()=>{const storage=new DriveStorage(),quote=newQuote(),original=structuredClone(quote);await assert.rejects(storage.saveQuote(quote),/설정되어 있지/);storage.configure('folder-id');await assert.rejects(storage.check(),/연결이 필요/);await assert.rejects(storage.saveQuote(quote),/연결이 필요/);assert.deepEqual(quote,original);assert.equal(quote.status,'draft');});
test('견적 복사 시 사용자가 지정한 견적일 유지',()=>{const quote=newQuote();quote.quoteDate='2025-01-03';assert.equal(copyQuote(quote).quoteDate,'2025-01-03');});
test('중간 항목 삭제 후 생성·복제 순서가 중복되지 않음',()=>{let nodes=[];const g=createNode(nodes,'group');const a=createNode(nodes,'item',g.id);const b=createNode(nodes,'item',g.id);const c=createNode(nodes,'item',g.id);nodes=deleteNode(nodes,b.id);createNode(nodes,'item',g.id);duplicateItem(nodes,a.id);const orders=children(nodes,g.id).map(n=>n.order);assert.equal(new Set(orders).size,orders.length);assert.equal(children(nodes,g.id)[1].id,c.id);});
test('잘못된 폴더 재설정 시 이전 폴더를 계속 사용하지 않음',()=>{const storage=new DriveStorage();storage.configure('old-folder');assert.throws(()=>storage.configure('/wrong/path'));assert.equal(storage.folderId,'');});

test('쉼표 입력·전체/개별 할인 배타 적용·개당 금액 할인·VAT',()=>{
 assert.equal(parseAmount('1,000'),1000);assert.ok(Number.isNaN(parseAmount('1,00')));assert.ok(Number.isNaN(parseAmount('')));
 const q=newQuote();q.items=[{price:10000,quantity:3,discountType:'amount',discountValue:1000}];q.discountMode='individual';q.vatIncluded=true;
 assert.equal(calculateQuote(q).total,27000);q.discountMode='global';q.globalDiscount=20;assert.equal(calculateQuote(q).total,24000);
 q.items=[{price:110000,quantity:1}];q.discountMode='none';assert.deepEqual([calculateQuote(q).supply,calculateQuote(q).tax,calculateQuote(q).total],[100000,10000,110000]);
 q.vatIncluded=false;assert.deepEqual([calculateQuote(q).supply,calculateQuote(q).tax,calculateQuote(q).total],[110000,11000,121000]);
 q.discountMode='global';q.globalDiscount=101;assert.throws(()=>calculateQuote(q));q.globalDiscount=100;assert.equal(calculateQuote(q).total,0);
});
test('기존 견적 금액 보존·원 단위 반올림·과도한 할인 차단',()=>{
 assert.equal(calculateQuote({items:[{price:100.5,quantity:2}]}).total,201);
 const q=newQuote();q.items=[{price:101,quantity:3,discountType:'amount',discountValue:102}];q.discountMode='individual';assert.throws(()=>calculateQuote(q));
 q.discountMode='global';q.globalDiscount=50;q.vatIncluded=true;assert.equal(calculateQuote(q).total,153);
});
test('견적 복사 시 업무 중복 없음·캘린더 마감일과 연락 일정·복구',()=>{
 const w=emptyWorkspace(),q=newQuote('발행자');q.projectName='프로젝트';const p=ensureProject(w,q);p.tasks.push({id:'t',title:'디자인',status:'done',dueDate:'2026-10-06',notes:''});w.events.push({id:'e',date:'2026-10-05',title:'연락',projectId:p.id});
 ensureProject(w,copyQuote(q));assert.equal(w.projects.length,1);assert.equal(progress(p),'완료 1 / 전체 1');assert.equal(calendarEntries(w).length,2);
 let raw;const storage={setItem:(_,value)=>raw=value,getItem:()=>raw};q.items=[{price:NaN}];saveRecovery({quote:q,nodes:[],workspace:w},storage);const restored=loadRecovery(storage);assert.ok(Number.isNaN(restored.quote.items[0].price));assert.deepEqual(restored.workspace,w);assert.equal(restored.quote.issuer,'발행자');
});
