// 명시적인 임시 가정: 단가 × 수량, 항목 금액의 합. VAT/할인/반올림 정책 없음.
export function calculate(items) {
  const amounts = items.map(({price,quantity}) => {
    if (!Number.isFinite(price) || !Number.isFinite(quantity) || price < 0 || quantity < 0) throw new Error('단가와 수량은 0 이상의 유효한 숫자로 입력해주세요.');
    const amount = price * quantity;
    if (!Number.isFinite(amount)) throw new Error('계산 가능한 금액 범위를 초과했습니다.');
    return amount;
  });
  const total = amounts.reduce((a,b) => a+b,0);
  if (!Number.isFinite(total)) throw new Error('계산 가능한 합계 범위를 초과했습니다.');
  return {amounts,total};
}
export const formatAmount = value => value.toLocaleString('ko-KR',{maximumFractionDigits:20});
