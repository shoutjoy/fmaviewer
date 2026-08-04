const fs = require('node:fs');
const path = require('node:path');

const directory = __dirname;
const codePath = path.join(directory, 'Code.gs');
const generatedPath = path.join(directory, 'version.generated.js');
const source = fs.readFileSync(codePath, 'utf8');
const match = source.match(/const\s+SERVER_VERSION\s*=\s*['"]([^'"]+)['"]/);

if (!match) throw new Error('Code.gs에서 SERVER_VERSION을 찾지 못했습니다.');

const output = [
  '/* Generated from Code.gs SERVER_VERSION. Do not edit this value independently. */',
  `window.FMA_CODE_GS_VERSION = ${JSON.stringify(match[1])};`,
  ''
].join('\n');

fs.writeFileSync(generatedPath, output, 'utf8');
console.log(`Code.gs version synced: ${match[1]}`);
