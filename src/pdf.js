import {calculateQuote,formatAmount} from './calculation.js';

// 브라우저 글꼴로 한글을 렌더링하고 페이지마다 JPEG를 PDF에 포함한다.
// 인쇄용 텍스트 PDF는 기존 브라우저 인쇄 경로에서도 제공한다.
export async function createQuotePdf(quote){
  await document.fonts.ready;
  const result=calculateQuote(quote),pages=[];
  const width=1240,height=1754,margin=80;
  let canvas,ctx,y;
  function page(){canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,width,height);ctx.fillStyle='#24342f';y=margin;}
  function finish(){ctx.font='20px sans-serif';ctx.fillText(`발행일 ${quote.quoteDate}  ·  ${quote.quoteNumber}  ·  ${pages.length+1}`,margin,height-45);pages.push(canvas.toDataURL('image/jpeg',0.92));}
  function line(text,size=25){
    const step=size*1.65;
    for(const paragraph of String(text||'—').split('\n')){
      let row='';
      const flush=()=>{if(y+step>height-100){finish();page();}ctx.font=`${size}px sans-serif`;ctx.fillText(row||' ',margin,y+size);y+=step;row='';};
      ctx.font=`${size}px sans-serif`;
      for(const char of paragraph){if(ctx.measureText(row+char).width>width-margin*2)flush();row+=char;}
      flush();
    }
  }
  page();line('견 적 서',48);line(quote.quoteNumber,22);line(`업체: ${quote.companyName||'—'}`);line(`프로젝트: ${quote.projectName||'—'}`);
  line(`수신처: ${quote.recipient||'—'}`);line(`발행자: ${quote.issuer||'—'}`);line(`납기: ${quote.deliveryDate||'—'} / 유효기간: ${quote.validUntil||'—'}`);line(`결제 조건: ${quote.paymentTerms||'—'}`);
  if(quote.calculationVersion)line(`VAT ${quote.vatIncluded?'포함':'별도'} · ${quote.discountMode==='global'?`전체 할인 ${quote.globalDiscount}%`:quote.discountMode==='individual'?'품목별 할인':'할인 없음'}`,22);
  quote.items.forEach((item,i)=>{
    y+=20;line(`${i+1}. ${item.name}`,29);if(item.description)line(item.description,23);
    line(`기준 단가 ${formatAmount(item.price)}원 × ${item.quantity} ${item.unit}`,23);
    if(quote.discountMode==='individual'&&item.discountType&&item.discountType!=='none')line(`개당 할인 ${formatAmount(item.discountValue)}${item.discountType==='percent'?'%':'원'}`,23);
    line(`적용 단가 ${formatAmount(result.units?.[i]??item.price)}원 / 금액 ${formatAmount(result.amounts[i])}원`,23);
  });
  y+=25;
  if(result.supply!==undefined){line(`할인액: ${formatAmount(result.discount)}원`);line(`공급가액: ${formatAmount(result.supply)}원`);line(`세액: ${formatAmount(result.tax)}원`);}
  line(`최종 합계: ${formatAmount(result.total)}원`,34);if(quote.notes){line('비고',27);line(quote.notes,23);}finish();
  return encodePdf(pages,width,height);
}

export function encodePdf(dataUrls,width,height){
  const encoder=new TextEncoder(),parts=[],offsets=[0];let length=0;
  const push=value=>{const bytes=typeof value==='string'?encoder.encode(value):value;parts.push(bytes);length+=bytes.length;};
  const object=(id,body)=>{offsets[id]=length;push(`${id} 0 obj\n`);push(body);push('\nendobj\n');};
  push('%PDF-1.4\n');object(1,'<< /Type /Catalog /Pages 2 0 R >>');
  object(2,`<< /Type /Pages /Count ${dataUrls.length} /Kids [${dataUrls.map((_,i)=>`${3+i*3} 0 R`).join(' ')}] >>`);
  dataUrls.forEach((url,i)=>{
    const id=3+i*3,raw=atob(url.split(',')[1]),bytes=Uint8Array.from(raw,c=>c.charCodeAt(0));
    object(id,`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595.28 841.89] /Resources << /XObject << /Im${i} ${id+1} 0 R >> >> /Contents ${id+2} 0 R >>`);
    offsets[id+1]=length;push(`${id+1} 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${bytes.length} >>\nstream\n`);push(bytes);push('\nendstream\nendobj\n');
    const command=`q 595.28 0 0 841.89 0 0 cm /Im${i} Do Q\n`;object(id+2,`<< /Length ${encoder.encode(command).length} >>\nstream\n${command}endstream`);
  });
  const start=length;push(`xref\n0 ${offsets.length}\n0000000000 65535 f \n`);for(const offset of offsets.slice(1))push(`${String(offset).padStart(10,'0')} 00000 n \n`);
  push(`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF`);
  return new Blob(parts,{type:'application/pdf'});
}
