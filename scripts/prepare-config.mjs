import { copyFileSync, existsSync } from 'node:fs';
if (!existsSync('config.local.json')) {
  copyFileSync('config.example.json', 'config.local.json');
  console.log('Created private config.local.json. Set your owner, contract, and runtimeCodeHash before using a wallet.');
}
