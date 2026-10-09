const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname, '..');
const source = path.join(root, 'src/ai-metadata.js');
const context = vm.createContext({ Uint8Array, ArrayBuffer, DataView, TextDecoder });
if (fs.existsSync(source)) vm.runInContext(fs.readFileSync(source, 'utf8') + '\nthis.api=PhotoAiMetadata;', context);
const api = context.api || {};
const {png,jpeg,webp,chunk,riffChunk,manifest,jp,segment}=require('../tests/fixtures/ai-metadata.cjs');

test('exports the pure metadata API',()=>{for(const k of ['inspect','strip','verify'])assert.equal(typeof api[k],'function');});
test('valid no-metadata images mean no records, never a real-photo verdict',()=>{for(const b of [jpeg(),png(),webp(riffChunk('VP8L',Buffer.from([47,0,0,0,0])))]){const r=api.inspect(b);assert.equal(r.status,'none');assert.equal(r.hasAiRecords,false);assert.equal(r.hasProvenance,false);assert.equal(api.verify(b).clean,true);assert.equal(r.isReal,undefined);}});
test('IPTC source values distinguish AI creation and edits from HDR and normal tools',()=>{
 for(const [v,k] of [['trainedAlgorithmicMedia','ai-generated'],['compositeWithTrainedAlgorithmicMedia','ai-edited'],['compositeSynthetic','ai-edited']]){const r=api.inspect(png(),{xmp:{DigitalSourceType:{value:'http://cv.iptc.org/newscodes/digitalsourcetype/'+v}}});assert.equal(r.records[0].kind,k);assert.equal(r.hasAiRecords,true);}
 const r=api.inspect(png(),{xmp:{DigitalSourceType:{value:'http://cv.iptc.org/newscodes/digitalsourcetype/computationalCapture'},CreatorTool:{value:'Adobe Photoshop'}},png:{Comment:{value:'An AI discussion'}}});assert.equal(r.status,'none');
});
test('recognizes generator fields including duplicate PNG keys and compressed-key carriers',()=>{
 const input=png(chunk('tEXt',Buffer.from('parameters\0Steps: 20, Sampler: Euler, Seed: 42')),chunk('tEXt',Buffer.from('parameters\0')),chunk('zTXt',Buffer.from('workflow\0\0compressed')));
 const r=api.inspect(input);assert.equal(r.hasAiRecords,true);assert.ok(r.records.some(x=>x.kind==='generation-info'));assert.equal(api.verify(input).clean,false);
 const tool=api.inspect(png(),{exif:{Software:{description:'ComfyUI'}}});assert.ok(tool.records.some(x=>x.kind==='tool'));
});
test('C2PA carriers are detected as unverified provenance and stripped losslessly',()=>{
 const samples=[[png(chunk('caBX',manifest())),png(),'png'],[webp(riffChunk('VP8L',Buffer.from([47,0,0,0,0])),riffChunk('C2PA',manifest())),webp(riffChunk('VP8L',Buffer.from([47,0,0,0,0]))),'webp'],[jpeg(jp(manifest())),jpeg(),'jpeg']];
 for(const [input,expected,kind] of samples){const before=Buffer.from(input);const r=api.inspect(input);assert.equal(r.hasProvenance,true);assert.equal(r.hasAiRecords,false);assert.ok(r.records.some(x=>x.kind==='provenance'));const out=api.strip(input,kind);assert.deepEqual(Buffer.from(out),expected);assert.deepEqual(input,before);assert.equal(api.verify(out).clean,true);}
});
test('segmented JPEG C2PA uses instance, ordered packet numbers and repeated box header',()=>{
 const m=manifest();const input=jpeg(jp(m.subarray(0,22)),jp(m.subarray(22),529,2,m.subarray(0,8)));
 assert.equal(api.inspect(input).hasProvenance,true);assert.deepEqual(Buffer.from(api.strip(input,'jpeg')),jpeg());
});
test('unrelated APP11 and unrelated JUMBF are preserved even when containing c2pa text',()=>{
 const other=manifest('c2pa',Buffer.alloc(16,7));const input=jpeg(segment(0xeb,Buffer.from('Not JUMBF c2pa')),jp(other));
 assert.equal(api.inspect(input).hasProvenance,false);assert.deepEqual(Buffer.from(api.strip(input,'jpeg')),input);
});
test('scan data byte stuffing and metadata between JPEG scans are parsed without changing payload',()=>{
 const m=jp(manifest());const scan=Buffer.from([255,218,0,2,4,255,0,5,255,208,6]);const input=Buffer.concat([Buffer.from([255,216]),scan,m,scan,Buffer.from([255,217])]);const expected=Buffer.concat([Buffer.from([255,216]),scan,scan,Buffer.from([255,217])]);assert.deepEqual(Buffer.from(api.strip(input,'jpeg')),expected);
});
test('malformed and unsupported inputs stay distinct and are never clean',()=>{
 for(const b of [png().subarray(0,-1),jpeg().subarray(0,-1),webp(riffChunk('C2PA',manifest())).subarray(0,-1),jpeg(segment(0xeb,Buffer.from('JPbroken'))) ]){assert.equal(api.inspect(b).status,'error');assert.equal(api.verify(b).clean,false);assert.throws(()=>api.strip(b));}
 assert.equal(api.inspect(Buffer.from('GIF89a')).status,'unknown');assert.equal(api.verify(Buffer.from('GIF89a')).clean,false);
});
test('missing/repeated/foreign continuation sequence or header fails closed',()=>{
 const m=manifest();for(const continuation of [jp(m.subarray(22),529,3,m.subarray(0,8)),jp(m.subarray(22),529,1),jp(m.subarray(22),530,2,m.subarray(0,8)),jp(m.subarray(22),529,2,Buffer.alloc(8))]){const input=jpeg(jp(m.subarray(0,22)),continuation);assert.equal(api.inspect(input).status,'error');assert.throws(()=>api.strip(input,'jpeg'));}
});
test('provenance data cannot be smuggled after image end or beyond RIFF length',()=>{
 for(const b of [Buffer.concat([png(),chunk('caBX',manifest())]),Buffer.concat([jpeg(),jp(manifest())]),Buffer.concat([webp(riffChunk('VP8L',Buffer.from([47]))),riffChunk('C2PA',manifest())])])assert.equal(api.verify(b).clean,false);
});


test('output verification independently rejects leftover metadata carriers including between scans',()=>{
 const scan=Buffer.from([255,218,0,2,1,2]);const lateXmp=Buffer.concat([Buffer.from([255,216]),scan,segment(0xe1,Buffer.from('http://ns.adobe.com/xap/1.0/\0<DigitalSourceType>hidden</DigitalSourceType>')),scan,Buffer.from([255,217])]);
 for(const b of [lateXmp,jpeg(segment(0xed,Buffer.from('IPTC'))),png(chunk('tEXt',Buffer.from('arbitrary\0unrecognized info'))),webp(riffChunk('VP8L',Buffer.from([47])),riffChunk('XMP ',Buffer.from('<xmp/>')))])assert.equal(api.verify(b,{}).clean,false);
});
test('orientation-only canonical EXIF is the sole allowed retained EXIF carrier',()=>{
 const payload=Buffer.from([0x45,0x78,0x69,0x66,0,0,0x4d,0x4d,0,0x2a,0,0,0,8,0,1,0x01,0x12,0,3,0,0,0,1,0,6,0,0,0,0,0,0]);
 for(const b of [jpeg(segment(0xe1,payload)),webp(riffChunk('VP8L',Buffer.from([47])),riffChunk('EXIF',payload))])assert.equal(api.verify(b).clean,true);
 const changed=Buffer.from(payload);changed[31]=99;assert.equal(api.verify(jpeg(segment(0xe1,changed))).clean,false);
});

test('malformed PNG text headers and failed decompression are not absence',()=>{
 for(const c of [chunk('zTXt',Buffer.from('key\0')),chunk('zTXt',Buffer.from('key\0\1invalid')),chunk('iTXt',Buffer.from('key\0\2\0\0\0text')),chunk('iTXt',Buffer.from('key\0\0\0missing-terminators'))])assert.equal(api.inspect(png(c)).status,'error');
 assert.equal(api.inspect(png(),{png:{Comment:{value:'<text using unknown compression>'}}}).status,'error');
 const chunks=Array.from({length:9},(_,i)=>chunk('zTXt',Buffer.from('key'+i+'\0\0compressed')));assert.equal(api.inspect(png(...chunks)).status,'error');
});

test('preflight exposes an aggregate-safe decompression cap and rejects unsupported compressed XMP',()=>{
 const blocks=Array.from({length:8},(_,i)=>chunk('zTXt',Buffer.from('key'+i+'\0\0compressed')));
 const r=api.inspect(png(...blocks));assert.equal(r.status,'none');assert.ok(r.decompressionLimit>0);assert.ok(r.decompressionLimit*8<=16*1024*1024);
 assert.equal(api.inspect(png(chunk('iTXt',Buffer.from('XML:com.adobe.xmp\0\1\0\0\0compressed')))).status,'error');
});

test('ExifReader decoded UserComment is inspected when raw value is a byte array',()=>{
 const r=api.inspect(jpeg(),{exif:{UserComment:{value:[65,83,67,73,73,0],description:'Steps: 20, Sampler: Euler, Seed: 42'}}});assert.equal(r.hasAiRecords,true);assert.ok(r.records.some(x=>x.kind==='generation-info'));
});

test('duplicate compressed PNG keys cannot hide a failed earlier decode',()=>{
 for(const pair of [[chunk('zTXt',Buffer.from('Comment\0\0bad')),chunk('tEXt',Buffer.from('Comment\0good'))],[chunk('tEXt',Buffer.from('Comment\0good')),chunk('zTXt',Buffer.from('Comment\0\0bad'))]])assert.equal(api.inspect(png(...pair)).status,'error');
});
test('aggregate text budget and chunk count limits fail closed',()=>{
 const data=Buffer.alloc(9*1024*1024,65);data[1]=0;
 assert.equal(api.inspect(png(chunk('tEXt',data),chunk('tEXt',data))).status,'error');
 const empty=chunk('aaAa',Buffer.alloc(0));const many=Buffer.concat([png().subarray(0,33),Buffer.concat(Array.from({length:100001},()=>empty)),png().subarray(33)]);
 assert.equal(api.inspect(many).status,'error');
});

test('concatenated JPEG images expose all bounded ranges without assuming AI metadata absence',()=>{
 const first=jpeg(),second=jpeg(jp(manifest()));const input=Buffer.concat([first,second]);const preflight=api.inspect(input);
 assert.equal(preflight.status,'unknown');assert.equal(preflight.multiImage,true);assert.equal(preflight.hasProvenance,true);assert.equal(preflight.images.length,2);
 assert.deepEqual(JSON.parse(JSON.stringify(preflight.images)),[{start:0,end:first.length},{start:first.length,end:input.length}]);
 assert.equal(preflight.secondaryMetadataInspected,false);assert.equal(preflight.losslessSupported,false);
 const full=api.inspect(input,[{},{exif:{UserComment:{description:'Steps: 20, Sampler: Euler, Seed: 42'}}}]);
 assert.equal(full.status,'records');assert.equal(full.secondaryMetadataInspected,true);assert.equal(full.hasAiRecords,true);assert.equal(full.hasProvenance,true);
 assert.equal(api.verify(input,[{},{}]).clean,false);assert.throws(()=>api.strip(input,'jpeg'),/Multi-image/);
});
test('all image metadata must be supplied for a no-record multi-JPEG result',()=>{
 const input=Buffer.concat([jpeg(),jpeg()]);assert.equal(api.inspect(input,{}).status,'unknown');assert.equal(api.inspect(input,[{}]).status,'unknown');
 assert.equal(api.inspect(input,[{},{}]).status,'none');assert.equal(api.verify(input,[{},{}]).clean,false);
});
test('multi-JPEG inspection rejects truncated or unbounded additional images and foreign tails',()=>{
 const sixteen=Buffer.concat(Array.from({length:16},()=>jpeg()));assert.equal(api.inspect(sixteen,Array.from({length:16},()=>({}))).status,'none');
 for(const input of [Buffer.concat([jpeg(),jpeg().subarray(0,-1)]),Buffer.concat([jpeg(),Buffer.from('ftypisom')]),Buffer.concat(Array.from({length:17},()=>jpeg()))])assert.equal(api.inspect(input).status,'error');
});

test('synthetic MPF fixture declares exact primary size and secondary TIFF-relative offset',()=>{
 const {multiJpeg}=require('../tests/fixtures/ai-metadata.cjs');assert.equal(typeof multiJpeg,'function');const first=jpeg(),second=jpeg();const input=multiJpeg(first,second);const r=api.inspect(input,[{},{}]);assert.equal(r.multiImage,true);const tiff=10,entries=tiff+50;assert.equal(input.readUInt32BE(entries+4),r.images[0].end);assert.equal(input.readUInt32BE(entries+20),second.length);assert.equal(input.readUInt32BE(entries+24)+tiff,r.images[1].start);
});

test('SDR decoder preparation removes MPF and XMP links but preserves EXIF, ICC and image payload',()=>{
 assert.equal(typeof api.primaryForSdr,'function');const {multiJpeg}=require('../tests/fixtures/ai-metadata.cjs');
 for(const orientation of [6,8]) {
  const exif=Buffer.from([69,120,105,102,0,0,77,77,0,42,0,0,0,8,0,1,1,18,0,3,0,0,0,1,0,orientation,0,0,0,0,0,0]);
  const exifSegment=segment(0xe1,exif),icc=segment(0xe2,Buffer.from('ICC_PROFILE\0\1\1synthetic profile')),other=segment(0xe2,Buffer.from('unrelated-app2'));
  const standard=segment(0xe1,Buffer.from('http://ns.adobe.com/xap/1.0/\0<synthetic-gainmap-link/>'));
  const extended=segment(0xe1,Buffer.from('http://ns.adobe.com/xmp/extension/\0synthetic extended XMP'));
  const first=jpeg(exifSegment,icc,other,standard,extended,jp(manifest())),input=multiJpeg(first,jpeg());const unchanged=Buffer.from(input);
  const output=api.primaryForSdr(input);assert.deepEqual(Buffer.from(output),jpeg(exifSegment,icc,other));assert.deepEqual(input,unchanged);
  const result=api.inspect(output);assert.equal(result.multiImage,false);assert.equal(result.hasProvenance,false);
  assert.equal(Buffer.from(output).includes(exif),true,'Orientation-bearing EXIF must survive decoder preparation');
 }
});
test('SDR decoder preparation is not a clean-output bypass and rejects unsupported tails',()=>{
 assert.equal(typeof api.primaryForSdr,'function');const input=jpeg(segment(0xe1,Buffer.from('Exif\0\0synthetic private metadata')));
 assert.equal(api.verify(api.primaryForSdr(input)).clean,false);
 assert.throws(()=>api.primaryForSdr(Buffer.concat([jpeg(),Buffer.from('unsupported motion tail')])));
 assert.throws(()=>api.primaryForSdr(png()));
});
