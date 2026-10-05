// 옵션 없는 호출은 기존 견적의 계산을 보존한다.
export function calculate(items, options) {
  const mode=options?.discountMode||'none', rate=options?.globalDiscount??0;
  if(!['none','global','individual'].includes(mode))throw new Error('할인 방식을 확인해주세요.');
  const validRate=value=>{if(!Number.isFinite(value)||value<0||value>100)throw new Error('할인율은 0~100%로 입력해주세요.');};
  if(mode==='global')validRate(rate);
  const units=[];
  const amounts = items.map(({price,quantity,discountType='none',discountValue=0}) => {
    if (!Number.isFinite(price) || !Number.isFinite(quantity) || price < 0 || quantity < 0) throw new Error('단가와 수량은 0 이상의 유효한 숫자로 입력해주세요.');
    let unit=price;
    if(mode==='global')unit=price*(1-rate/100);
    if(mode==='individual'){
      if(discountType==='percent'){validRate(discountValue);unit=price*(1-discountValue/100);}
      else if(discountType==='amount'){
        if(!Number.isFinite(discountValue)||discountValue<0||discountValue>price)throw new Error('개당 할인 금액은 0원부터 단가까지 입력해주세요.');
        unit=price-discountValue;
      }else if(discountType!=='none')throw new Error('품목 할인 방식을 확인해주세요.');
    }
    if(options)unit=Math.round(unit);
    units.push(unit);
    const amount = options?Math.round(unit*quantity):unit*quantity;
    if (!Number.isFinite(amount)) throw new Error('계산 가능한 금액 범위를 초과했습니다.');
    return amount;
  });
  const total = amounts.reduce((a,b) => a+b,0);
  if (!Number.isFinite(total)) throw new Error('계산 가능한 합계 범위를 초과했습니다.');
  if(!options)return {amounts,total};
  if(!Number.isSafeInteger(total))throw new Error('계산 가능한 합계 범위를 초과했습니다.');
  const taxRate=options.taxRate??0.1;
  if(!Number.isFinite(taxRate)||taxRate<0||taxRate>1)throw new Error('세율을 확인해주세요.');
  const supply=options.vatIncluded?Math.round(total/(1+taxRate)):total;
  const tax=options.vatIncluded?total-supply:Math.round(supply*taxRate);
  const original=items.reduce((sum,item)=>sum+Math.round(item.price*item.quantity),0);
  if(!Number.isSafeInteger(supply+tax)||!Number.isSafeInteger(original))throw new Error('계산 가능한 합계 범위를 초과했습니다.');
  return {amounts,units,subtotal:total,original,discount:original-total,supply,tax,total:supply+tax};
}
export function parseAmount(value){
  const text=String(value).trim();
  if(!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(text))return NaN;
  return Number(text.replaceAll(',',''));
}
export const calculateQuote=quote=>calculate(quote.items,quote.calculationVersion?quote:undefined);
export const formatAmount = value => value.toLocaleString('ko-KR',{maximumFractionDigits:20});
