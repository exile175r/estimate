const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const scripts = new Map();
function loadScript(src) {
  if (!scripts.has(src)) scripts.set(src,new Promise((resolve,reject)=>{
    const script=document.createElement('script'); script.src=src; script.async=true;
    const timer=setTimeout(()=>{scripts.delete(src);script.remove();reject(new Error('Google 연결 시간이 초과되었습니다. 다시 시도해주세요.'));},20000);
    script.onload=()=>{clearTimeout(timer);resolve();};
    script.onerror=()=>{clearTimeout(timer);scripts.delete(src);script.remove();reject(new Error('Google 인증 모듈을 불러오지 못했습니다.'));};
    document.head.append(script);
  }));
  return scripts.get(src);
}
export class GoogleAuth {
  constructor(config) { this.config=config; this.token=''; this.expires=0; }
  validateClient() {
    if(!this.config.clientId)throw new Error('Google 로그인 설정이 없습니다. src/config.js가 포함된 빌드 결과를 배포해주세요.');
  }
  async prepare() {
    this.validateClient();
    await loadScript('https://accounts.google.com/gsi/client');
  }
  async preparePicker() {
    if(!this.config.apiKey||!this.config.appId)throw new Error('폴더 선택 설정(API 키·프로젝트 ID)이 없습니다. 설정을 포함해 다시 빌드해주세요.');
    await loadScript('https://apis.google.com/js/api.js');
    await new Promise((resolve,reject)=>gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('폴더 선택창을 불러오지 못했습니다.')),timeout:20000,ontimeout:()=>reject(new Error('폴더 선택창 연결 시간 초과'))}));
  }
  authorize() {
    this.validateClient();
    if(!globalThis.google?.accounts?.oauth2) throw new Error('Google 로그인 모듈이 로드되지 않았습니다. 네트워크·차단 확장 프로그램을 확인하고 다시 연결해주세요.');
    return new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initTokenClient({client_id:this.config.clientId,scope:SCOPE,
        callback:response=>{
          if(response.error || !google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE)) {reject(new Error('Drive 파일 접근 동의가 필요합니다.'));return;}
          this.token=response.access_token;this.expires=Date.now()+Number(response.expires_in)*1000-60000;resolve();
        },error_callback:error=>reject(new Error(error?.type==='popup_failed_to_open'?'로그인 팝업을 열지 못했습니다. 이 사이트의 팝업 허용 여부를 확인해주세요.':error?.type==='popup_closed'?'Google 로그인 창을 닫았습니다. 다시 연결해주세요.':'Google 로그인 창을 여는 중 오류가 발생했습니다.'))});
      client.requestAccessToken({prompt:''});
    });
  }
  getToken() {
    if(!this.token || Date.now()>=this.expires) throw new Error('Google 연결이 필요하거나 만료되었습니다. 관리자에서 Google 연결을 눌러주세요.');
    return this.token;
  }
  disconnect() {this.token='';this.expires=0;}
  async pickFolder() {
    const token=this.getToken();
    await this.preparePicker();
    return new Promise((resolve,reject)=>{
      const view=new google.picker.DocsView(google.picker.ViewId.FOLDERS).setIncludeFolders(true).setSelectFolderEnabled(true);
      const picker=new google.picker.PickerBuilder().setDeveloperKey(this.config.apiKey).setAppId(this.config.appId)
        .setOAuthToken(token).setOrigin(location.origin).addView(view).setTitle('견적서를 저장할 폴더 선택')
        .setCallback(data=>{
          if(data.action===google.picker.Action.PICKED){picker.dispose();resolve(data.docs[0].id);}
          if(data.action===google.picker.Action.CANCEL){picker.dispose();reject(new Error('폴더 선택을 취소했습니다.'));}
        }).build();
      picker.setVisible(true);
    });
  }
}
