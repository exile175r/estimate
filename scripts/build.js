import {cp, mkdir, writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const root = resolve(import.meta.dirname, '..');
try { process.loadEnvFile(resolve(root, '.env')); } catch(error) { if(error.code !== 'ENOENT') throw error; }
// Explicit allowlist: OAuth secrets and access/refresh tokens must never be emitted.
const config = {
  clientId: process.env.GOOGLE_CLIENT_ID || '',
  apiKey: process.env.GOOGLE_API_KEY || '',
  appId: process.env.GOOGLE_APP_ID || '',
  folderId: process.env.GOOGLE_DRIVE_FOLDER_ID || ''
};
if(process.env.CI && Object.values(config).some(value=>!value)) throw new Error('Google public runtime configuration is incomplete.');
const module = `export const config = ${JSON.stringify(config,null,2)};\n`;
await writeFile(resolve(root,'src/config.js'),module);
await mkdir(resolve(root,'dist'),{recursive:true});
for(const file of ['index.html','styles.css','src']) await cp(resolve(root,file),resolve(root,'dist',file),{recursive:true});
console.log('Static build complete (public Google client configuration only).');
