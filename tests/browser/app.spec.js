import {test,expect} from '@playwright/test';
const admin = page => page.locator('nav [data-page="admin"]').click();
const compose = page => page.locator('nav [data-page="compose"]').click();
async function group(page,name,child=false){await page.locator(child?'#child-group':'#root-group').click();await page.locator('#detail [data-field="name"]').fill(name);}
async function item(page,name='로그인 기능',price='300000',description='이메일 로그인 화면과 입력 검증을 구현합니다.'){
 await page.locator('#add-item').click();await page.locator('#detail [data-field="name"]').fill(name);await page.locator('#detail [data-field="price"]').fill(price);await page.locator('#detail [data-field="description"]').fill(description);
}
async function setup(page){await admin(page);await group(page,'웹사이트');await group(page,'페이지',true);await item(page);await compose(page);}
async function noOverflow(page){expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);}
test.beforeEach(async({page})=>{await page.route('**/src/config.js',route=>route.fulfill({contentType:'text/javascript',body:'export const config={};'}));page.on('pageerror',error=>{throw error;});await page.goto('/');});
test('관리자 생성·이름 변경·취소·복제·삭제·접기',async({page})=>{
 await admin(page);await page.locator('#add-item').click();await expect(page.locator('#message')).toContainText('그룹을 먼저');
 await group(page,'웹사이트');await group(page,'페이지',true);await item(page);
 await page.locator('#rename').click();await page.getByRole('textbox',{name:'이름 변경',exact:true}).fill('로그인');await page.keyboard.press('Enter');await expect(page.locator('#detail [data-field="name"]')).toHaveValue('로그인');
 await page.locator('#rename').click();await page.getByRole('textbox',{name:'이름 변경',exact:true}).fill('취소할 이름');await page.keyboard.press('Escape');await expect(page.locator('#detail [data-field="name"]')).toHaveValue('로그인');
 await page.locator('#duplicate-node').click();await expect(page.locator('#detail [data-field="price"]')).toHaveValue('300000');await expect(page.locator('.node-name')).toHaveCount(4);
 await page.locator('#delete-node').click();await expect(page.locator('.node-name')).toHaveCount(3);
 await page.getByRole('button',{name:'페이지',exact:true}).click();await page.locator('#delete-node').click();await expect(page.locator('#message')).toContainText('미결정');
 await page.locator('[data-toggle]').first().click();await expect(page.locator('.node-name')).toHaveCount(1);await page.locator('[data-toggle]').first().click();await expect(page.locator('.node-name')).toHaveCount(3);
 await page.screenshot({path:'artifacts/qa/admin-desktop.png',fullPage:true});
});
test('견적 편집·계산·스냅샷·비활성화·원본 삭제',async({page})=>{
 await setup(page);await page.locator('[data-add]').click();await page.locator('#paper [data-field="projectName"]').fill('한글 웹사이트 제작');await page.locator('#paper [data-field="quantity"]').fill('2');await expect(page.locator('#total')).toHaveText('660,000 원');
 await page.locator('#paper [data-field="name"]').fill('프로젝트 전용 로그인');await page.locator('#paper [data-field="unit"]').fill('페이지');await page.locator('#paper [data-field="description"]').fill('수정된 설명');
 await admin(page);await expect(page.locator('#detail [data-field="name"]')).toHaveValue('로그인 기능');await page.locator('#detail [data-field="price"]').fill('400000');await page.locator('#detail [data-field="active"]').uncheck();await compose(page);await expect(page.locator('[data-add]')).toHaveCount(0);await expect(page.locator('#total')).toHaveText('660,000 원');
 await admin(page);await page.locator('#delete-node').click();await compose(page);await expect(page.locator('#paper [data-field="name"]')).toHaveValue('프로젝트 전용 로그인');await expect(page.locator('#paper [data-field="description"]')).toHaveValue('수정된 설명');
 await page.locator('#paper [data-field="quantity"]').fill('-1');await expect(page.locator('#total')).toContainText('확인 필요');await page.locator('#save').click();await expect(page.locator('#message')).toContainText('0 이상');
 await page.locator('#paper [data-field="quantity"]').fill('2');await page.locator('[data-remove]').click();await expect(page.locator('#total')).toHaveText('0 원');
});
test('중복 선택: 수량 증가·새 행·Escape 취소',async({page})=>{
 await setup(page);await page.locator('[data-add]').click();await page.locator('[data-add]').click();await page.locator('[value="quantity"]').click();await expect(page.locator('#paper [data-field="quantity"]')).toHaveValue('2');
 await page.locator('[data-add]').click();await page.keyboard.press('Escape');await expect(page.locator('#duplicate-dialog')).not.toBeVisible();await expect(page.locator('#paper [data-field="quantity"]')).toHaveValue('2');
 await page.locator('[data-add]').click();await page.locator('[value="row"]').click();await expect(page.locator('.quote-line')).toHaveCount(2);
 await page.locator('[data-add]').click();await page.locator('[value="cancel"]').click();await expect(page.locator('.quote-line')).toHaveCount(2);
});
test('견적 복사 내용 보존·신규 작성 취소/확인',async({page})=>{
 await setup(page);await page.locator('[data-add]').click();await page.locator('#paper [data-field="quoteDate"]').fill('2025-01-03');const number=await page.locator('.document-heading>span').innerText();await page.locator('#copy-quote').click();await expect(page.locator('.document-heading>span')).not.toHaveText(number);await expect(page.locator('#paper [data-field="quoteDate"]')).toHaveValue('2025-01-03');
 page.once('dialog',dialog=>dialog.dismiss());await page.locator('#new-quote').click();await expect(page.locator('.quote-line')).toHaveCount(1);
 page.once('dialog',dialog=>dialog.accept());await page.locator('#new-quote').click();await expect(page.locator('.quote-line')).toHaveCount(0);
});
test('실제 드래그 정렬·그룹 이동·루트 이동·순환 차단',async({page})=>{
 await admin(page);await group(page,'그룹 A');await group(page,'하위 A',true);await item(page,'항목 A');await item(page,'항목 B');
 const row = name=>page.locator('.tree-row').filter({has:page.getByRole('button',{name,exact:true})});
 await row('항목 B').dragTo(row('항목 A'));await expect(page.locator('.node-name')).toHaveText(['그룹 A','하위 A','항목 B','항목 A']);
 await row('그룹 A').dragTo(row('하위 A').locator('[data-into]'));await expect(page.locator('#message')).toContainText('하위 그룹');
 await group(page,'그룹 B');await row('항목 A').dragTo(row('그룹 B').locator('[data-into]'));await expect(page.locator('.node-name')).toHaveText(['그룹 A','하위 A','항목 B','그룹 B','항목 A']);
 await row('하위 A').dragTo(page.locator('#root-drop'));await expect(page.locator('#tree > [role="treeitem"]')).toHaveCount(3);
 await row('항목 A').dragTo(page.locator('#root-drop'));await expect(page.locator('#message')).toContainText('그룹 안');
});
test('저장 실패·잘못된 폴더·미연결 안내와 작성 내용 유지',async({page})=>{
 await setup(page);await page.locator('[data-add]').click();await page.locator('[data-field="companyName"]').fill('저장 오류 검증');for(const button of ['#draft','#save']){await page.locator(button).click();await expect(page.locator('#message')).toContainText('설정되어 있지');await expect(page.locator('.quote-line')).toHaveCount(1);}
 await admin(page);await page.locator('#link-setting').click();await page.locator('#folder').fill('/tmp/견적');await page.locator('#check-drive').click();await expect(page.locator('#message')).toContainText('폴더 URL');
 await page.locator('#folder').fill('https://drive.google.com/drive/folders/test-folder');await page.locator('#check-drive').click();await expect(page.locator('#folder-result')).toContainText('확인 중');await expect(page.locator('#message')).toContainText('연결이 필요');
 await page.keyboard.press('Escape');await page.locator('#save-catalog').click();await expect(page.locator('#message')).toContainText('연결이 필요');await page.locator('nav [data-page="saved"]').click();await page.locator('#refresh').click();await expect(page.locator('#message')).toContainText('연결이 필요');await expect(page.locator('.connection')).toHaveText('Drive 미연결');
 await compose(page);await expect(page.locator('.quote-line')).toHaveCount(1);await page.screenshot({path:'artifacts/qa/save-failure.png',fullPage:true});
});
for(const width of [1440,768,390,320])test(`화면 ${width}px: 내용·반응형·가로 넘침 검사`,async({page})=>{
 await page.setViewportSize({width,height:1000});await setup(page);await page.locator('[data-add]').click();await page.locator('#paper [data-field="projectName"]').fill('브랜드 웹사이트 제작');await page.locator('#paper [data-field="notes"]').fill('검토 후 작업 범위와 일정을 협의합니다.');await noOverflow(page);await page.screenshot({path:`artifacts/qa/compose-${width}.png`,fullPage:true});
 await admin(page);await noOverflow(page);await page.screenshot({path:`artifacts/qa/admin-${width}.png`,fullPage:true});await page.locator('nav [data-page="saved"]').click();await noOverflow(page);
});
test('긴 설명은 다른 항목 추가 후에도 화면에서 잘리지 않음',async({page})=>{
 await setup(page);await page.locator('[data-add]').click();const description=Array.from({length:16},(_,i)=>`설명 ${i+1}: 한글 상세 요구사항`).join('\n');await page.locator('#paper [data-field="description"]').fill(description);
 await page.locator('[data-add]').click();await page.locator('[value="row"]').click();expect(await page.locator('#paper textarea').first().evaluate(el=>el.clientHeight>=el.scrollHeight-2)).toBe(true);
});
test('날짜만 수정한 견적도 신규 작성 전 확인',async({page})=>{
 await page.locator('#paper [data-field="validUntil"]').fill('2027-01-15');let confirmed=false;page.once('dialog',async dialog=>{confirmed=true;await dialog.dismiss();});await page.locator('#new-quote').click();expect(confirmed).toBe(true);await expect(page.locator('#paper [data-field="validUntil"]')).toHaveValue('2027-01-15');
});
test('폴더 입력 변경은 이전 확인 결과를 해제',async({page})=>{
 await admin(page);await page.locator('#link-setting').click();await page.locator('#folder').fill('old-folder');await page.locator('#check-drive').click();await page.locator('#folder').fill('/wrong/folder');await expect(page.locator('#folder-result')).toContainText('연결 확인이 필요');await page.locator('#check-drive').click();await expect(page.locator('#message')).toContainText('폴더 URL');await page.keyboard.press('Escape');await page.locator('.brand').click();await expect(page.locator('#compose')).toBeVisible();await page.locator('[data-field="companyName"]').fill('검증 업체');await page.locator('#save').click();await expect(page.locator('#message')).toContainText('설정되어 있지');
});
test('긴 설명의 화면 전환·폭 변경 후 높이와 HTML 입력 처리',async({page})=>{
 await setup(page);await page.locator('[data-add]').click();await page.locator('#paper [data-field="name"]').fill('<img src=x onerror=alert(1)>');await page.locator('#paper [data-field="description"]').fill('아주 긴 설명입니다. '.repeat(100));
 await page.locator('[data-add]').click();await page.locator('[value="row"]').click();await expect(page.locator('.quote-line')).toHaveCount(2);await admin(page);await page.setViewportSize({width:390,height:850});await compose(page);expect(await page.locator('#paper textarea').first().evaluate(el=>el.clientHeight>=el.scrollHeight-2)).toBe(true);await expect(page.locator('#paper img')).toHaveCount(0);await expect(page.locator('#paper [data-field="name"]').first()).toHaveValue('<img src=x onerror=alert(1)>');
 await page.screenshot({path:'artifacts/qa/long-description-mobile.png',fullPage:true});
});
test('트리 컨텍스트 추가·키보드·아이콘·인쇄 재진입',async({page})=>{
 await admin(page);
 const tree=page.locator('#tree'),menu=page.getByRole('menu',{name:'트리 작업'});
 await tree.click({button:'right'});await expect(menu.getByRole('menuitem',{name:'항목 추가',exact:true})).toBeDisabled();
 await menu.getByRole('menuitem',{name:'루트 그룹 추가'}).click();await page.locator('#detail [data-field="name"]').fill('디자인');
 await page.getByRole('button',{name:'디자인',exact:true}).click({button:'right'});
 await menu.getByRole('menuitem',{name:'하위 그룹 추가'}).click();await page.locator('#detail [data-field="name"]').fill('화면');
 await page.getByRole('button',{name:'화면',exact:true}).click({button:'right'});
 await menu.getByRole('menuitem',{name:'항목 추가',exact:true}).click();await page.locator('#detail [data-field="name"]').fill('시안');
 const itemButton=page.getByRole('button',{name:'시안',exact:true});await itemButton.focus();await page.keyboard.press('Shift+F10');await expect(menu).toBeVisible();
 await menu.getByRole('menuitem',{name:'항목 추가',exact:true}).click();await expect(page.locator('.node-name')).toHaveText(['디자인','화면','시안','새 항목']);
 await itemButton.click({button:'right'});await page.keyboard.press('Escape');await expect(menu).toBeHidden();await expect(itemButton).toBeFocused();
 await page.getByRole('button',{name:'Drive Link 설정',exact:true}).click();await expect(page.locator('.settings-wrap')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('.settings-wrap')).toBeHidden();
 await page.setViewportSize({width:320,height:700});await itemButton.click({button:'right'});const bounds=await menu.boundingBox();expect(bounds.x).toBeGreaterThanOrEqual(0);expect(bounds.x+bounds.width).toBeLessThanOrEqual(320);
 await page.screenshot({path:'artifacts/qa/context-menu-320.png',fullPage:true});await page.keyboard.press('Escape');
 await compose(page);await page.evaluate(()=>{dispatchEvent(new Event('beforeprint'));dispatchEvent(new Event('beforeprint'));});await expect(page.locator('#print-document')).toHaveCount(1);await page.evaluate(()=>dispatchEvent(new Event('afterprint')));await expect(page.locator('#print-document')).toHaveCount(0);
});

test('초기 빈 상태와 저장 목록 안내 화면',async({page})=>{
 await expect(page.locator('#paper')).toContainText('첫 항목');await page.screenshot({path:'artifacts/qa/empty-desktop.png',fullPage:true});
 for(const width of [1440,390]){await page.setViewportSize({width,height:1000});await page.locator('nav [data-page="saved"]').click();await expect(page.locator('#saved')).toContainText('Google Drive 연결이 필요');await noOverflow(page);await page.screenshot({path:`artifacts/qa/saved-${width}.png`,fullPage:true});}
});

test('할인 모드·쉼표·VAT·발행 정보·새로고침 복구',async({page})=>{
 await setup(page);await page.locator('[data-add]').click();
 await page.locator('[data-field="companyName"]').fill('검증 업체');await page.locator('[data-field="recipient"]').fill('수신 담당자');await page.locator('[data-field="issuer"]').fill('발행 업체');await page.locator('[data-field="paymentTerms"]').fill('계약금 50%');
 await page.locator('#paper [data-field="price"]').fill('10,000');await page.locator('[data-field="quantity"]').fill('3');
 await page.locator('[data-field="discountMode"]').selectOption('individual');await page.locator('[data-field="discountType"]').selectOption('amount');await page.locator('[data-field="discountValue"]').fill('1,000');await page.locator('[data-field="vatIncluded"]').check();await expect(page.locator('#total')).toHaveText('27,000 원');
 await page.locator('[data-field="discountMode"]').selectOption('global');await page.locator('[data-field="globalDiscount"]').fill('20');await expect(page.locator('[data-field="discountType"]')).toBeDisabled();await expect(page.locator('#total')).toHaveText('24,000 원');
 await page.locator('[data-field="discountMode"]').selectOption('individual');await expect(page.locator('#total')).toHaveText('27,000 원');await page.locator('[data-field="vatIncluded"]').uncheck();await expect(page.locator('#total')).toHaveText('29,700 원');
 await page.locator('[data-field="quoteDate"]').fill('2026-10-02');await expect(page.locator('#footer-date')).toHaveText('2026-10-02');
 await page.reload();await expect(page.locator('#total')).toHaveText('29,700 원');await expect(page.locator('[data-field="companyName"]')).toHaveValue('검증 업체');await expect(page.locator('[data-field="paymentTerms"]')).toHaveValue('계약금 50%');await expect(page.locator('#catalog [data-add]')).toHaveCount(1);
 await page.locator('[data-field="globalDiscount"]').isDisabled();await page.screenshot({path:'artifacts/qa/features-compose.png',fullPage:true});
});

test('업무·일정·발행자 기본값·견적 수동 상태 복구와 모바일',async({page})=>{
 await page.locator('[data-field="projectName"]').fill('웹 제작');await page.locator('[data-field="companyName"]').fill('업체 A');await page.locator('[data-field="workflowStatus"]').selectOption('approved');await page.locator('#open-project').click();
 await page.locator('#issuer-default').fill('내 회사 010-0000-0000');await page.locator('#task-title').fill('디자인');await page.locator('#task-form button').click();await page.locator('[data-task-key="status"]').selectOption('doing');await page.locator('[data-task-key="dueDate"]').fill('2026-10-08');await page.locator('[data-task-key="notes"]').fill('시안 검토');await page.locator('[data-task-key="complete"]').check();await expect(page.locator('#task-progress')).toHaveText('완료 1 / 전체 1');
 await page.locator('#event-date').fill('2026-10-08');await page.locator('#event-title').fill('후속 연락');await page.locator('#event-form button').click();await expect(page.locator('#event-list')).toContainText('후속 연락');await expect(page.locator('[data-day="2026-10-08"]')).toContainText('2건');
 await page.reload();await expect(page.locator('[data-field="workflowStatus"]')).toHaveValue('approved');await page.locator('nav [data-page="calendar"]').click();await expect(page.locator('#task-progress')).toHaveText('완료 1 / 전체 1');await expect(page.locator('[data-task-key="notes"]')).toHaveValue('시안 검토');
 await page.locator('#calendar-month').fill('2026-10');await page.locator('[data-day="2026-10-08"]').click();await expect(page.locator('#event-list')).toContainText('후속 연락');
 await page.setViewportSize({width:390,height:900});await noOverflow(page);await page.screenshot({path:'artifacts/qa/features-calendar.png',fullPage:true});
 await compose(page);await page.locator('#copy-quote').click();await page.locator('#open-project').click();await expect(page.locator('[data-task]')).toHaveCount(1);
 await compose(page);page.once('dialog',dialog=>dialog.accept());await page.locator('#new-quote').click();await expect(page.locator('[data-field="issuer"]')).toHaveValue('내 회사 010-0000-0000');
});

test('모의 Drive API: 업체별 JSON·PDF 저장, 부분 실패 재시도, 목록·업무 재조회',async({page})=>{
 const files=new Map();let sequence=0,failPdf=false;
 await page.route('**/src/google-auth.js',route=>route.fulfill({contentType:'text/javascript',body:`export class GoogleAuth {prepare(){return Promise.resolve();} authorize(){return Promise.resolve();} getToken(){return 'test-only-token';} pickFolder(){return Promise.resolve('test-folder');} disconnect(){}}`}));
 await page.route('https://www.googleapis.com/**',async route=>{
  const req=route.request(),u=new URL(req.url()),id=u.pathname.split('/').at(-1),method=req.method(),upload=u.pathname.includes('/upload/');
  const reply=(value,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(id==='test-folder')return reply({id,name:'검증 루트',mimeType:'application/vnd.google-apps.folder',capabilities:{canAddChildren:true}});
  if(id==='files'&&method==='POST'){
   let meta,value;if(upload){const parts=req.postData().split('\r\n\r\n');meta=JSON.parse(parts[1].split('\r\n--')[0]);value=JSON.parse(parts[2].split('\r\n--')[0]);}else meta=req.postDataJSON();
   const fileId='f'+(++sequence);files.set(fileId,{...meta,id:fileId,value,version:1});return reply({id:fileId});
  }
  if(id==='files'){
   const q=u.searchParams.get('q'),parent=q.match(/^'([^']+)'/)[1],kind=q.match(/key='kind' and value='([^']+)'/)[1],entity=q.match(/key='entityId' and value='([^']+)'/);
   return reply({files:[...files.values()].filter(f=>!f.trashed&&f.parents.includes(parent)&&f.appProperties.kind===kind&&(!entity||f.appProperties.entityId===entity[1])).map(({value,...f})=>f)});
  }
  const file=files.get(id);if(!file)return reply({},404);
  if(method==='PATCH'){
   if(upload&&file.appProperties.kind==='pdf'){if(failPdf)return reply({error:{status:'TEST_FAILURE'}},500);file.value=req.postDataBuffer();}
   else if(upload)file.value=req.postDataJSON();else Object.assign(file,req.postDataJSON());
   if(u.searchParams.has('addParents'))file.parents=[u.searchParams.get('addParents')];file.version++;return reply({id});
  }
  if(u.searchParams.get('alt')==='media'){if(file.appProperties.kind==='pdf')return route.fulfill({contentType:'application/pdf',body:file.value});return reply(file.value);}
  return reply({id,parents:file.parents,appProperties:file.appProperties,version:String(file.version),trashed:file.trashed});
 });
 await page.reload();await setup(page);await page.locator('[data-add]').click();await page.locator('[data-field="companyName"]').fill('API 검증 업체');await page.locator('[data-field="projectName"]').fill('저장 검증');
 await admin(page);await page.locator('#link-setting').click();await page.locator('#pick-folder').click();await expect(page.locator('.connection')).toHaveText('Drive 연결됨');await page.keyboard.press('Escape');await compose(page);
 failPdf=true;await page.locator('#save').click();await expect(page.locator('#message')).toContainText('JSON은 저장됨 · PDF 저장 실패');
 expect([...files.values()].filter(f=>f.appProperties.kind==='quote')).toHaveLength(1);failPdf=false;await page.locator('#save').click();await expect(page.locator('#message')).toContainText('JSON과 PDF');
 expect([...files.values()].filter(f=>f.appProperties.kind==='company')).toHaveLength(1);expect([...files.values()].filter(f=>f.appProperties.kind==='pdf')).toHaveLength(1);
 await page.locator('[data-field="workflowStatus"]').selectOption('sent');await page.locator('#save').click();await expect(page.locator('#message')).toContainText('JSON과 PDF');
 await page.locator('#open-project').click();await page.locator('#task-title').fill('개발');await page.locator('#task-form button').click();await page.locator('#save-workspace').click();await expect(page.locator('#workspace-state')).toContainText('Drive 저장됨');
 await page.locator('nav [data-page="saved"]').click();await page.locator('#refresh').click();await expect(page.locator('#quote-list')).toContainText('API 검증 업체');await expect(page.locator('#quote-list')).toContainText('발송');await expect(page.locator('#quote-list')).toContainText('전체 1');
 await page.locator('[data-load]').click();await expect(page.locator('[data-field="workflowStatus"]')).toHaveValue('sent');await expect(page.locator('.document-heading small')).toHaveText('Drive JSON 저장됨 · PDF 확인 필요');
 await page.locator('nav [data-page="calendar"]').click();await page.locator('#load-workspace').click();await expect(page.locator('[data-task-key="title"]')).toHaveValue('개발');
});
