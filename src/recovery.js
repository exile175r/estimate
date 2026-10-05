const KEY='estimate-recovery-v2';
// 토큰은 저장하지 않는다. NaN 입력도 0/null로 바뀌지 않게 보존한다.
export function saveRecovery(value,storage=globalThis.localStorage){storage.setItem(KEY,JSON.stringify({...value,recoveredAt:new Date().toISOString()},(_,v)=>typeof v==='number'&&!Number.isFinite(v)?{invalidNumber:true}:v));}
export function loadRecovery(storage=globalThis.localStorage){const raw=storage.getItem(KEY);if(!raw)return null;const value=JSON.parse(raw,(_,v)=>v?.invalidNumber===true?NaN:v);if(!value?.quote?.id||!Array.isArray(value.quote.items)||!Array.isArray(value.nodes))throw new Error('복구 데이터 형식 오류. 브라우저 데이터를 삭제하지 말고 확인해주세요.');return value;}
