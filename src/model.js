export const uid = () => crypto.randomUUID();
export function newQuote(issuer='') {
  const now = new Date().toISOString();
  const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Seoul'}).format(new Date());
  return {id: uid(), quoteNumber: `Q-${date.replaceAll('-','')}-${uid().slice(0,8)}`, createdAt: now, updatedAt: now, status: 'draft', quoteDate: date, projectName: '', validUntil: '', notes: '', items: [],companyName:'',companyCode:'',recipient:'',issuer,deliveryDate:'',paymentTerms:'',workflowStatus:'draft',projectId:uid(),calculationVersion:1,discountMode:'none',globalDiscount:0,vatIncluded:false,taxRate:0.1};
}
export function copyQuote(quote) {
  const {id,quoteNumber,createdAt,updatedAt,status} = newQuote();
  return {...structuredClone(quote),id,quoteNumber,createdAt,updatedAt,status,workflowStatus:'draft',items:quote.items.map(item=>({...item,id:uid()}))};
}
export function snapshot(item) { return {id: uid(), sourceItemId: item.id, name: item.name, price: item.price, quantity: 1, unit: item.unit, description: item.description}; }
export const children = (nodes, parentId) => nodes.filter(n => n.parentId === parentId).sort((a,b) => a.order-b.order);
const normalizeOrder = (nodes,parentId) => children(nodes,parentId).forEach((node,index)=>node.order=index);
export function createNode(nodes, type, parentId = null) {
  if (type === 'item' && !parentId) throw new Error('항목을 추가할 그룹을 선택해주세요.');
  if (parentId && !nodes.some(n => n.id === parentId && n.type === 'group')) throw new Error('대상 그룹이 없습니다.');
  normalizeOrder(nodes,parentId);
  const node = {id: uid(), type, parentId, name: type === 'group' ? '새 그룹' : '새 항목', order: children(nodes,parentId).length, active: true};
  if (type === 'item') Object.assign(node, {price: 0, unit: '건', description: ''});
  nodes.push(node); return node;
}
export function moveNode(nodes, id, parentId, beforeId = null) {
  const node = nodes.find(n => n.id === id);
  if (!node) throw new Error('이동할 대상이 없습니다.');
  if (node.type === 'item' && !parentId) throw new Error('항목은 그룹 안에 있어야 합니다.');
  let cursor = parentId;
  const visited = new Set();
  while (cursor) {
    if (cursor === id || visited.has(cursor)) throw new Error('자신 또는 하위 그룹으로 이동할 수 없습니다.');
    visited.add(cursor);
    const parent = nodes.find(n => n.id === cursor && n.type === 'group');
    if (!parent) throw new Error('대상 그룹이 없습니다.');
    cursor = parent.parentId;
  }
  const siblings = children(nodes,parentId).filter(n => n.id !== id);
  const index = beforeId ? siblings.findIndex(n => n.id === beforeId) : siblings.length;
  if (index < 0) throw new Error('삽입 위치가 올바르지 않습니다.');
  const oldParentId = node.parentId;
  node.parentId = parentId;
  siblings.splice(index,0,node); siblings.forEach((n,i) => n.order=i);
  if (oldParentId !== parentId) normalizeOrder(nodes,oldParentId);
}
export function deleteNode(nodes,id) {
  if (nodes.some(n => n.parentId === id)) throw new Error('비어 있지 않은 그룹의 삭제 정책은 미결정입니다. 먼저 하위 항목을 이동해주세요.');
  const parentId = nodes.find(n=>n.id===id)?.parentId;
  const remaining = nodes.filter(n => n.id !== id);
  normalizeOrder(remaining,parentId);
  return remaining;
}
export function duplicateItem(nodes,id) {
  const source = nodes.find(n => n.id === id);
  if (!source || source.type !== 'item') throw new Error('그룹 전체 복제 범위는 미결정입니다. 항목만 복제할 수 있습니다.');
  normalizeOrder(nodes,source.parentId);
  const copy = {...source,id:uid(),name:`${source.name} 복사`,order:children(nodes,source.parentId).length}; nodes.push(copy); return copy;
}
