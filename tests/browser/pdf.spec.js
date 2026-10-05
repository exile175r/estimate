import {test,expect} from '@playwright/test';
import {getDocument} from 'pdfjs-dist/legacy/build/pdf.mjs';
import {createCanvas} from '@napi-rs/canvas';
import {writeFile} from 'node:fs/promises';

test('한글·긴 설명·36개 항목 PDF: 본문 보존과 페이지 영역 검사',async({page})=>{
 test.setTimeout(90000);
 await page.goto('/');await page.locator('nav [data-page="admin"]').click();await page.locator('#root-group').click();await page.locator('#detail [data-field="name"]').fill('PDF 검증 그룹');await page.locator('#add-item').click();await page.locator('#detail [data-field="name"]').fill('한글 검증 항목');await page.locator('#detail [data-field="price"]').fill('12000');await page.locator('#detail [data-field="description"]').fill('개발 범위와 작업 내용을 안내합니다.');await page.locator('nav [data-page="compose"]').click();
 await page.locator('#paper [data-field="projectName"]').fill('한글 PDF 다중 페이지 검증 프로젝트');
 for(let i=1;i<=36;i++){
   await page.locator('[data-add]').click();if(i>1)await page.locator('[value="row"]').click();
   await expect(page.locator('.quote-line')).toHaveCount(i);
   await page.locator('.quote-line').last().locator('[data-field="name"]').fill(`검증항목${String(i).padStart(2,'0')}`);
 }
 const long=Array.from({length:90},(_,i)=>`상세문장${String(i+1).padStart(3,'0')} 한글 설명이 페이지를 넘어도 보존됩니다.`).join('\n');
 await page.locator('.quote-line').first().locator('[data-field="description"]').fill(long);
 await page.locator('#paper [data-field="notes"]').fill('최종비고확인: 한글 출력과 마지막 항목을 확인합니다.');
 // 브라우저 인쇄 버튼이 실제 출력 경로를 호출하는지 별도로 확인.
 await page.evaluate(()=>{window.__printCalls=0;window.print=()=>{window.__printCalls++;};});await page.locator('#print').click();expect(await page.evaluate(()=>window.__printCalls)).toBe(1);
 for(const format of ['A4','Letter']){
   const bytes=await page.pdf({path:`artifacts/qa/quote-${format}.pdf`,format,printBackground:true,margin:{top:'12mm',bottom:'12mm',left:'12mm',right:'12mm'}});
   const loadingTask=getDocument({data:new Uint8Array(bytes),useSystemFonts:true});
   const pdf=await loadingTask.promise;
   expect(pdf.numPages).toBeGreaterThan(3);let text='';const pages=[];
   for(let n=1;n<=pdf.numPages;n++){
     const pdfPage=await pdf.getPage(n),viewport=pdfPage.getViewport({scale:1});const content=await pdfPage.getTextContent();
     for(const item of content.items){if(!item.str?.trim())continue;text+=item.str+'\n';const x=item.transform[4],y=item.transform[5];expect(x).toBeGreaterThanOrEqual(0);expect(y).toBeGreaterThanOrEqual(0);expect(x+item.width).toBeLessThanOrEqual(viewport.width+2);expect(y).toBeLessThanOrEqual(viewport.height+2);}
     if(format==='A4'){
       const view=pdfPage.getViewport({scale:1.2});const canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height));await pdfPage.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;await writeFile(`artifacts/qa/pdf-page-${n}.png`,canvas.toBuffer('image/png'));pages.push({page:n,textItems:content.items.length});
     }
   }
   const compact=text.replaceAll(/\s/g,'');
   expect(compact).toContain('한글PDF다중페이지검증프로젝트');expect(compact).toContain('최종비고확인');expect(compact).toContain('432,000');
   for(let i=1;i<=36;i++)expect(compact).toContain(`검증항목${String(i).padStart(2,'0')}`);
   for(let i=1;i<=90;i++)expect(compact).toContain(`상세문장${String(i).padStart(3,'0')}`);
   for(const excluded of ['회사명','회사 로고','계좌정보','Drive 미연결','YOUR NEXT PROJECT'])expect(text).not.toContain(excluded);
   await writeFile(`artifacts/qa/pdf-${format}-text.txt`,text);
   await writeFile(`artifacts/qa/pdf-${format}-report.json`,JSON.stringify({format,pages:pdf.numPages,quoteItems:36,longDescriptionLines:90,boundsChecked:true},null,2));
   await loadingTask.destroy();
 }
 await expect(page.locator('#print-document')).toHaveCount(0);await expect(page.locator('.quote-line')).toHaveCount(36);
});

test('Drive용 한글 PDF 파일 생성·여러 페이지 렌더링',async({page})=>{
 await page.route('**/src/config.js',route=>route.fulfill({contentType:'text/javascript',body:'export const config={};'}));await page.goto('/');
 const bytes=await page.evaluate(async()=>{
  const {newQuote}=await import('/src/model.js'),{createQuotePdf}=await import('/src/pdf.js');const q=newQuote('견적 작업실 · 담당자');Object.assign(q,{companyName:'한글 검증 업체',projectName:'브랜드 웹사이트 구축',recipient:'수신 담당자',paymentTerms:'계약금 50%, 완료 후 잔금 50%',deliveryDate:'2026-11-01',discountMode:'individual',vatIncluded:false,notes:'검토 후 회신 부탁드립니다.'});
  q.items=Array.from({length:24},(_,i)=>({id:String(i),name:`작업 항목 ${i+1}`,description:i===0?'긴 설명과 한글 줄바꿈 검증입니다. '.repeat(80):'화면 제작과 검수',price:10000,quantity:3,unit:'건',discountType:'amount',discountValue:1000}));
  return Array.from(new Uint8Array(await (await createQuotePdf(q)).arrayBuffer()));
 });
 await writeFile('artifacts/qa/drive-quote.pdf',new Uint8Array(bytes));const task=getDocument({data:new Uint8Array(bytes)}),pdf=await task.promise;expect(pdf.numPages).toBeGreaterThan(3);
 for(const n of [1,pdf.numPages]){const p=await pdf.getPage(n),view=p.getViewport({scale:1.3}),canvas=createCanvas(Math.ceil(view.width),Math.ceil(view.height));await p.render({canvasContext:canvas.getContext('2d'),viewport:view}).promise;await writeFile(`artifacts/qa/drive-pdf-${n===1?'first':'last'}.png`,canvas.toBuffer('image/png'));}
 await task.destroy();
});
