// Synthetic containers only. No user image data or real provenance claims.
const u32 = n => { const b=Buffer.alloc(4); b.writeUInt32BE(n); return b; };
const box = (type,data) => Buffer.concat([u32(data.length+8),Buffer.from(type),data]);
const uuid = Buffer.from('6332706100110010800000aa00389b71','hex');
function manifest(label='c2pa', id=uuid) { return box('jumb',box('jumd',Buffer.concat([id,Buffer.from([3]),Buffer.from(label+'\0')]))); }
function segment(marker,data) { const n=Buffer.alloc(4); n[0]=255;n[1]=marker;n.writeUInt16BE(data.length+2,2);return Buffer.concat([n,data]); }
function jp(data, en=529, sequence=1, header=data.subarray(0,8)) { const prefix=Buffer.alloc(8);prefix.write('JP');prefix.writeUInt16BE(en,2);prefix.writeUInt32BE(sequence,4); return segment(0xeb,Buffer.concat([prefix,sequence===1?data:Buffer.concat([header,data])])); }
const jpeg=(...segments)=>Buffer.concat([Buffer.from([255,216]),...segments,Buffer.from([255,218,0,2,12,34,255,0,56,255,217])]);
function crc32(bytes) { let c=0xffffffff; for(const b of bytes){c^=b;for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);} return (c^0xffffffff)>>>0; }
function chunk(type,data) { const body=Buffer.concat([Buffer.from(type),data]);return Buffer.concat([u32(data.length),body,u32(crc32(body))]); }
const png=(...chunks)=>Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',Buffer.from([0,0,0,1,0,0,0,1,8,6,0,0,0])),...chunks,chunk('IDAT',Buffer.from([120,156,99,0,1,0,0,5,0,1])),chunk('IEND',Buffer.alloc(0))]);
function riffChunk(type,data) { const l=Buffer.alloc(4);l.writeUInt32LE(data.length);return Buffer.concat([Buffer.from(type),l,data,Buffer.alloc(data.length&1)]); }
function webp(...chunks) { const body=Buffer.concat([Buffer.from('WEBP'),...chunks]);const size=Buffer.alloc(4);size.writeUInt32LE(body.length);return Buffer.concat([Buffer.from('RIFF'),size,body]); }

module.exports={png,jpeg,webp,chunk,riffChunk,manifest,jp,segment};
