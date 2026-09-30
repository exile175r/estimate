export function parseFolderId(input) {
  const value = input.trim();
  if (/^[a-zA-Z0-9_-]+$/.test(value)) return value;
  try {
    const url = new URL(value);
    const match = url.pathname.match(/^\/drive\/(?:u\/\d+\/)?folders\/([a-zA-Z0-9_-]+)\/?$/);
    if (url.protocol === 'https:' && url.hostname === 'drive.google.com' && match) return match[1];
  } catch {}
  throw new Error('Google Drive 폴더 URL 또는 Folder ID를 입력해주세요.');
}
// 인증과 저장 구조 결정 전까지 네트워크 저장을 가장하지 않는 경계.
export class DriveStorage {
  constructor() { this.folderId = ''; }
  configure(input) { this.folderId = ''; this.folderId = parseFolderId(input); }
  async requireConnection() {
    if (!this.folderId) throw new Error('Google Drive 저장 위치가 설정되어 있지 않습니다. 관리자 페이지에서 저장 위치를 설정해주세요.');
    throw new Error('Google 인증 방식과 권한 범위가 미결정입니다. 실제 Drive 연결·저장은 아직 사용할 수 없습니다. 작성 내용은 현재 화면에 유지됩니다.');
  }
  async check() { return this.requireConnection(); }
  async saveQuote() { return this.requireConnection(); }
  async saveCatalog() { return this.requireConnection(); }
  async listQuotes() { return this.requireConnection(); }
}
