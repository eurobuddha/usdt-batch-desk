const fs=require('node:fs'),ts=require('typescript');
fs.mkdirSync('.test-build',{recursive:true});
fs.writeFileSync('.test-build/package.json','{"type":"commonjs"}');
for(const name of ['batch','wallet','history']){const code=fs.readFileSync(`lib/${name}.ts`,'utf8');fs.writeFileSync(`.test-build/${name}.js`,ts.transpileModule(code,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText);}
fs.copyFileSync('lib/batch-abi.json','.test-build/batch-abi.json');
