const SCOPE = 'https://www.googleapis.com/auth/drive.file';
const scripts = new Map();
function loadScript(src) {
  if (!scripts.has(src)) scripts.set(src,new Promise((resolve,reject)=>{
    const script=document.createElement('script'); script.src=src; script.async=true;
    const timer=setTimeout(()=>reject(new Error('Google 연결 시간이 초과되었습니다. 다시 시도해주세요.')),20000);
    script.onload=()=>{clearTimeout(timer);resolve();};
    script.onerror=()=>{clearTimeout(timer);scripts.delete(src);script.remove();reject(new Error('Google 인증 모듈을 불러오지 못했습니다.'));};
    document.head.append(script);
  }));
  return scripts.get(src);
}
export class GoogleAuth {
  constructor(config) { this.config=config; this.token=''; this.expires=0; }
  async prepare() {
    if(!this.config.clientId || !this.config.apiKey) throw new Error('Google 인증 설정이 아직 준비되지 않았습니다.');
    await Promise.all([loadScript('https://accounts.google.com/gsi/client'),loadScript('https://apis.google.com/js/api.js')]);
    await new Promise((resolve,reject)=>gapi.load('picker',{callback:resolve,onerror:()=>reject(new Error('폴더 선택창을 불러오지 못했습니다.')),timeout:20000,ontimeout:()=>reject(new Error('폴더 선택창 연결 시간 초과'))}));
  }
  authorize() {
    if(!globalThis.google?.accounts?.oauth2) throw new Error('Google 인증을 준비 중입니다. 잠시 후 다시 연결해주세요.');
    return new Promise((resolve,reject)=>{
      const client=google.accounts.oauth2.initTokenClient({client_id:this.config.clientId,scope:SCOPE,
        callback:response=>{
          if(response.error || !google.accounts.oauth2.hasGrantedAllScopes(response,SCOPE)) {reject(new Error('Drive 파일 접근 동의가 필요합니다.'));return;}
          this.token=response.access_token;this.expires=Date.now()+Number(response.expires_in)*1000-60000;resolve();
        },error_callback:()=>reject(new Error('Google 로그인이 취소되었거나 팝업이 차단되었습니다.'))});
      client.requestAccessToken({prompt:''});
    });
  }
  getToken() {
    if(!this.token || Date.now()>=this.expires) throw new Error('Google 연결이 필요하거나 만료되었습니다. 관리자에서 Google 연결을 눌러주세요.');
    return this.token;
  }
  disconnect() {this.token='';this.expires=0;}
  pickFolder() {
    const token=this.getToken();
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
