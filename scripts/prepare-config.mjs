import { copyFileSync, existsSync } from 'node:fs';
if (!existsSync('config.local.json')) {
  copyFileSync('config.example.json', 'config.local.json');
  console.log('Created private config.local.json. Optionally set a shared contract address for the site. No wallet is hardcoded.');
}
