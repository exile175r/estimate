import test from 'node:test';
import assert from 'node:assert/strict';
import {GoogleAuth} from '../src/google-auth.js';

test('누락된 배포 설정은 준비 중이나 팝업 차단으로 오인하지 않음',async()=>{
 const auth=new GoogleAuth({});
 await assert.rejects(auth.prepare(),/src\/config.js/);
 assert.throws(()=>auth.authorize(),/src\/config.js/);
});

test('Google 로그인은 Picker API 키와 무관하게 클릭 즉시 팝업 요청',async()=>{
 const original=globalThis.google;let called=false;
 try{
  globalThis.google={accounts:{oauth2:{initTokenClient:options=>({requestAccessToken:()=>{called=true;options.callback({access_token:'test-token',expires_in:3600});}}),hasGrantedAllScopes:()=>true}}};
  const auth=new GoogleAuth({clientId:'test-client'}),pending=auth.authorize();
  assert.equal(called,true);await pending;assert.equal(auth.getToken(),'test-token');
  await assert.rejects(auth.preparePicker(),/폴더 선택 설정/);
 }finally{if(original===undefined)delete globalThis.google;else globalThis.google=original;}
});

test('모듈 미로딩과 팝업 차단을 구분',async()=>{
 const original=globalThis.google;
 try{
  delete globalThis.google;const auth=new GoogleAuth({clientId:'test-client'});
  assert.throws(()=>auth.authorize(),/모듈이 로드되지/);
  globalThis.google={accounts:{oauth2:{initTokenClient:options=>({requestAccessToken:()=>options.error_callback({type:'popup_failed_to_open'})})}}};
  await assert.rejects(auth.authorize(),/팝업 허용/);
 }finally{if(original===undefined)delete globalThis.google;else globalThis.google=original;}
});
