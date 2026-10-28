'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs');
const {CATALOG}=require('../commerce');
const {prependCard}=require('../scripts/import-call-me-maybe');
test('Call Me Maybe is first in the catalogue with the paid product and three unique audio files',()=>{
 assert.equal(CATALOG.routine12.cents,200);
 const files=require('../config/additional-product-files.json').routine12;
 assert.equal(files.length,3);assert.equal(new Set(files.map(f=>f.fileId)).size,3);
 const card=fs.readFileSync('config/call-me-maybe-card.html','utf8');
 const original='<div class="coming-grid individual-grid"><article class="bundle-card">Bundle</article></div>';
 const result=prependCard(original,card);
 assert.ok(result.indexOf('data-product-id="routine12"')<result.indexOf('class="bundle-card"'));
 assert.match(result,/data-product-price="\$2"/);
 assert.equal(prependCard(result,card),result);
 const detail=fs.readFileSync('web/routines/call-me-maybe-poker-face/index.html','utf8');
 assert.ok(detail.includes('data-product-id="routine12"'));
 assert.ok(detail.includes('3 audio files · Video preview'));
});
