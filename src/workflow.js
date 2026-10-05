export const quoteStatuses={draft:'작성 중',sent:'발송',approved:'승인',rejected:'거절',expired:'만료'};
export const taskStatuses={todo:'예정',doing:'진행 중',done:'완료'};
export const emptyWorkspace=()=>({projects:[],events:[],issuer:''});
export function validateWorkspace(value){
  if(!value||!Array.isArray(value.projects)||!Array.isArray(value.events)||typeof value.issuer!=='string')throw new Error('업무 데이터 형식 오류');
  const ids=new Set();
  for(const p of value.projects){
    if(!p||typeof p.id!=='string'||ids.has(p.id)||typeof p.name!=='string'||typeof p.companyName!=='string'||!Array.isArray(p.tasks))throw new Error('프로젝트 데이터 형식 오류');
    ids.add(p.id);const tasks=new Set();
    for(const t of p.tasks){if(!t||typeof t.id!=='string'||tasks.has(t.id)||typeof t.title!=='string'||typeof t.notes!=='string'||typeof t.dueDate!=='string'||!Object.hasOwn(taskStatuses,t.status))throw new Error('업무 데이터 형식 오류');tasks.add(t.id);}
  }
  for(const e of value.events)if(!e||typeof e.id!=='string'||typeof e.date!=='string'||typeof e.title!=='string'||typeof e.projectId!=='string')throw new Error('일정 데이터 형식 오류');
  return value;
}
export function ensureProject(workspace,quote){
  quote.projectId ||= crypto.randomUUID();
  let project=workspace.projects.find(p=>p.id===quote.projectId);
  if(!project){project={id:quote.projectId,name:quote.projectName,companyName:quote.companyName||'',tasks:[]};workspace.projects.push(project);}
  return project;
}
export function progress(project){const tasks=project?.tasks||[];return tasks.length?`완료 ${tasks.filter(t=>t.status==='done').length} / 전체 ${tasks.length}`:'등록된 업무 없음';}
export function calendarEntries(workspace){return [...workspace.events.map(e=>({...e,kind:'후속 연락'})),...workspace.projects.flatMap(p=>p.tasks.filter(t=>t.dueDate).map(t=>({id:t.id,date:t.dueDate,title:t.title,projectId:p.id,kind:`업무 · ${taskStatuses[t.status]}`})))];}
