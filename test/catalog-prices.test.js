'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '..', 'commerce.js'),'utf8');
const server = fs.readFileSync(require('node:path').join(__dirname, '..', 'server.js'),'utf8');
const amounts = { pack:4900, bundle4:400, routine3:400, routine5:200, routine7:300, routine8:300, routine9:200 };
test('two payment catalogs use exactly the approved prices', () => {
  for (const [code,cents] of Object.entries(amounts)) {
    const item = source.match(new RegExp('\\b'+code+':\\{name:[^\\n]+?,cents:(\\d+)\\}'));
    assert.ok(item, 'commerce missing '+code);
    assert.equal(Number(item[1]),cents,'commerce price mismatch '+code);
    const product = server.match(new RegExp('\\b'+code+': \\{ code: [^\\n]+?price: (\\d+)'));
    assert.ok(product,'legacy checkout missing '+code);
    assert.equal(Number(product[1])*100,cents,'legacy checkout price mismatch '+code);
  }
});
