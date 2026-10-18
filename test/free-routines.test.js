'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {zipAudio,crc32,addFreeCards}=require('../scripts/import-free-routines');
test('Free archive preserves two MP3 filenames and contents with valid directory offsets',()=>{
 const files=[{name:'MACARENA RUT.mp3',bytes:Buffer.from('first audio')},{name:'TURN DOWN RUT.mp3',bytes:Buffer.from('second audio')}];
 const zip=zipAudio(files),end=zip.length-22;
 assert.equal(crc32(Buffer.from('123456789')),0xcbf43926);
 assert.equal(zip.readUInt32LE(end),0x06054b50);assert.equal(zip.readUInt16LE(end+10),2);
 let directory=zip.readUInt32LE(end+16);
 for(const file of files){
  assert.equal(zip.readUInt32LE(directory),0x02014b50);
  const offset=zip.readUInt32LE(directory+42),length=zip.readUInt16LE(directory+28);
  assert.equal(zip.readUInt32LE(offset),0x04034b50);
  assert.equal(zip.subarray(offset+30,offset+30+length).toString(),file.name);
  assert.deepEqual(zip.subarray(offset+30+length,offset+30+length+file.bytes.length),file.bytes);
  directory+=46+length;
 }
 assert.throws(()=>zipAudio([{name:'../private.mp3',bytes:Buffer.from('x')}]),/Invalid/);
});
test('Free card follows existing layout, escapes title and is added only once',()=>{
 const original='<section><div class="download-grid"><article>Existing</article></div></section>';
 const routines=[{slug:'macarena-gasolina',title:'MACARENA × GASOLINA & friends',audio:[{},{}]}];
 const result=addFreeCards(original,routines);
 assert.match(result,/MACARENA × GASOLINA &amp; friends/);
 assert.match(result,/href="\/free\/macarena-gasolina\/"/);
 assert.match(result,/src="\/assets\/free-videos\/macarena-gasolina.mp4"/);
 assert.equal(addFreeCards(result,routines),result);
 assert.throws(()=>addFreeCards('<main>Changed layout</main>',routines),/structure changed/);
});
