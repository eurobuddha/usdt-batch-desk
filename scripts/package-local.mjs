import { cpSync, existsSync, mkdirSync } from 'node:fs';
if (!existsSync('dist/client/index.html')) throw new Error('Build the static app first.');
mkdirSync('launcher/app', { recursive: true });
cpSync('dist/client', 'launcher/app', { recursive: true });
console.log('Local app ready. Double-click launcher/Launch USDT Batch Desk.command.');
console.log('Configured bundles contain your public wallet/deployment settings; keep them private if you do not want those settings associated publicly.');
