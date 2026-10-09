/* Local, bounded metadata inspection. This is not an AI-pixel detector or a
 * C2PA signature validator. No network, XML execution, or image re-encoding.
 * C2PA container references: spec.c2pa.org, embedding and manifest-store clauses.
 * JPEG XT packet layout: contentauth/c2pa-rs sdk/src/asset_handlers/jpeg_io.rs.
 */
var PhotoAiMetadata = (() => {
  'use strict';
  const LIMIT = 16 * 1024 * 1024;
  const MAX_PARTS = 100000;
  const UUID = [99,50,112,97,0,17,0,16,128,0,0,170,0,56,155,113];
  const text = (b, start = 0, end = b.length) => new TextDecoder().decode(b.subarray(start, end));
  const four = (b, p) => String.fromCharCode(...b.subarray(p, p + 4));
  const be = (b, p) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(p);
  const le = (b, p) => new DataView(b.buffer, b.byteOffset, b.byteLength).getUint32(p, true);
  const eq = (a,b) => a.length === b.length && a.every((x,i) => x === b[i]);
  const fail = message => { throw new Error(message); };
  function bytes(value) {
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    return fail('Expected image bytes');
  }
  function kindOf(b) {
    if (b.length >= 2 && b[0] === 255 && b[1] === 216) return 'jpeg';
    if (b.length >= 8 && eq(b.subarray(0,8),[137,80,78,71,13,10,26,10])) return 'png';
    if (b.length >= 12 && four(b,0) === 'RIFF' && four(b,8) === 'WEBP') return 'webp';
    return 'unknown';
  }
  function join(parts) {
    const length = parts.reduce((n,b) => n + b.length,0);
    const out = new Uint8Array(length); let offset = 0;
    for (const p of parts) { out.set(p,offset); offset += p.length; }
    return out;
  }
  function addRecord(records, kind, label, evidence) {
    if (records.length >= 200) return;
    const cleanEvidence = String(evidence || '').slice(0,500);
    if (!records.some(x => x.kind === kind && x.label === label && x.evidence === cleanEvidence)) records.push({kind,label,evidence:cleanEvidence});
  }
  function field(records, group, key, value) {
    if (String(value).includes('<text using unknown compression>')) fail('Compressed metadata could not be inspected');
    const local = key.split(':').pop();
    if (/^(xmp|iptc)$/i.test(group) && /^DigitalSourceType$/i.test(local)) {
      const match = String(value).trim().match(/^https?:\/\/cv\.iptc\.org\/newscodes\/digitalsourcetype\/(trainedAlgorithmicMedia|compositeWithTrainedAlgorithmicMedia|compositeSynthetic)\/?$/);
      if (match) addRecord(records, match[1] === 'trainedAlgorithmicMedia' ? 'ai-generated' : 'ai-edited', 'IPTC DigitalSourceType', match[0]);
    }
    if (/^(software|creatortool|processingsoftware)$/i.test(local) && /(?:^|\b)(ComfyUI|AUTOMATIC1111|Stable Diffusion|NovelAI|Midjourney|DALL[ -]?E)(?:\b|$)/i.test(String(value))) addRecord(records,'tool',group + ':' + key,value);
    if (/^png$/i.test(group) && /^(parameters|prompt|workflow)$/i.test(local)) addRecord(records,'generation-info','PNG ' + local,'Embedded generation-related field; unverified');
    if (/^UserComment$/i.test(local) && /\bSteps:\s*\d+/i.test(String(value)) && /\b(Sampler|CFG scale|Seed):/i.test(String(value))) addRecord(records,'generation-info',group + ':' + key,value);
  }
  function inspectTags(tags, records) {
    let count = 0;
    function values(v, depth=0) {
      if (++count > 10000 || depth > 10) fail('Metadata nesting or count exceeds inspection limit');
      if (v == null) return [];
      if (typeof v !== 'object') return [String(v).slice(0,100000)];
      if (ArrayBuffer.isView(v) || v instanceof ArrayBuffer) return [];
      if (Array.isArray(v)) return v.flatMap(x => values(x,depth+1));
      const decoded = ['description','computed'].filter(name => v[name] != null);
      if(decoded.length) {
        const result=decoded.flatMap(name=>values(v[name],depth+1));
        if(v.value!=null && typeof v.value!=='object') result.push(...values(v.value,depth+1));
        return result;
      }
      if(v.value!=null)return values(v.value,depth+1);
      return Object.values(v).flatMap(x => values(x,depth+1));
    }
    for (const [group, entries] of Object.entries(tags || {})) {
      if (!entries || typeof entries !== 'object') continue;
      for (const [key,value] of Object.entries(entries)) for (const v of values(value)) field(records,group,key,v);
    }
  }
  function boxAt(b,p,end) {
    if (p + 8 > end) fail('Truncated JUMBF box');
    const length = be(b,p);
    // Extended and open-ended box sizes need a different implementation; never
    // reinterpret them as an ordinary box or report successful removal.
    if (length < 8 || length > LIMIT || p + length > end) fail('Unsupported or invalid JUMBF box length');
    return {start:p,end:p+length,type:four(b,p+4),data:p+8};
  }
  function isC2pa(b) {
    const root = boxAt(b,0,b.length);
    if (root.type !== 'jumb' || root.end !== b.length) fail('Invalid JUMBF superbox');
    const desc = boxAt(b,root.data,root.end);
    if (desc.type !== 'jumd' || desc.end - desc.data < 17) fail('Invalid JUMBF description');
    const hasUuid = eq(b.subarray(desc.data,desc.data+16),UUID);
    const toggles = b[desc.data+16];
    let label = '';
    if (toggles & 2) {
      let end = desc.data+17;
      while (end < desc.end && b[end] !== 0) end++;
      if (end === desc.end) fail('Unterminated JUMBF label');
      label = text(b,desc.data+17,end);
    }
    // Validate child-box boundaries, but do not decode assertions or signatures.
    for (let p = desc.end; p < root.end;) p = boxAt(b,p,root.end).end;
    return hasUuid && label === 'c2pa';
  }
  function jpegParts(b,startOffset=0,allowFollowing=false) {
    const parts=[]; let p=startOffset+2, entropy=false, ended=false;
    while (p < b.length) {
      if (parts.length > MAX_PARTS) fail('Too many JPEG segments');
      if (entropy) {
        while (p < b.length) {
          if (b[p] !== 255) { p++; continue; }
          const start=p; while (p < b.length && b[p]===255) p++;
          if (p===b.length) fail('Truncated JPEG scan');
          const m=b[p];
          if (m===0 || (m>=208 && m<=215)) { p++;continue; }
          p=start;entropy=false;break;
        }
        if (entropy) fail('Missing JPEG end marker');
      }
      const start=p;
      if (b[p++]!==255) fail('Invalid JPEG marker');
      while (p < b.length && b[p]===255) p++;
      if (p===b.length) fail('Truncated JPEG marker');
      const marker=b[p++];
      if (marker===217) { if(!allowFollowing && p!==b.length) fail('Trailing JPEG data is not inspected'); parts.end=p;ended=true;break; }
      if (marker===216 || marker===0) fail('Unexpected JPEG marker');
      if (marker===1 || (marker>=208 && marker<=215)) continue;
      if(p+2>b.length) fail('Truncated JPEG segment length');
      const length=(b[p]<<8)|b[p+1], end=p+length;
      if(length<2 || end>b.length) fail('Invalid JPEG segment length');
      parts.push({start,end,data:p+2,marker});p=end;
      if(marker===218) entropy=true;
    }
    if(!ended) fail('Missing JPEG end marker');
    return parts;
  }
  function jpegImages(b) {
    const images=[];let start=0,segments=0;
    while(start<b.length) {
      if(images.length>=16)fail('Too many JPEG images');
      if(b[start]!==255 || b[start+1]!==216)fail('Unsupported data after JPEG image');
      const parts=jpegParts(b,start,true);segments+=parts.length;
      if(segments>MAX_PARTS)fail('Too many JPEG segments');
      images.push({start,end:parts.end,parts});start=parts.end;
    }
    return images;
  }
  function scanJpeg(b,records) {
    const images=jpegImages(b),ranges=[];
    for(const image of images) {
      const local=scanJpegImage(b.subarray(image.start,image.end),records);
      ranges.push(...local.map(([start,end])=>[start+image.start,end+image.start]));
    }
    ranges.images=images.map(({start,end})=>({start,end}));
    return ranges;
  }
  function scanJpegImage(b, records) {
    const parts=jpegParts(b), ranges=[]; const used=new Set();
    for(let i=0;i<parts.length;i++) {
      const part=parts[i];if(part.marker!==235) continue;
      const d=b.subarray(part.data,part.end);
      if(d[0]!==74 || d[1]!==80) continue; // Other APP11 is deliberately preserved.
      if(d.length<16) fail('Truncated JPEG XT packet');
      const instance=(d[2]<<8)|d[3], sequence=be(d,4), length=be(d,8);
      if(sequence!==1 || used.has(instance)) fail('Incomplete or duplicated JPEG XT sequence');
      used.add(instance);
      if(length<8 || length>LIMIT || four(d,12)!=='jumb') fail('Unsupported JPEG XT box');
      const header=d.subarray(8,16), pieces=[d.subarray(8)], selected=[part];let total=d.length-8, expected=2;
      while(total<length) {
        const next=parts[++i];
        if(!next || next.marker!==235 || next.start!==selected[selected.length-1].end) fail('Noncontiguous JPEG XT packets');
        const nd=b.subarray(next.data,next.end);
        if(nd.length<=16 || nd[0]!==74 || nd[1]!==80 || ((nd[2]<<8)|nd[3])!==instance || be(nd,4)!==expected || !eq(nd.subarray(8,16),header)) fail('Invalid JPEG XT continuation');
        expected++;selected.push(next);pieces.push(nd.subarray(16));total+=nd.length-16;
      }
      if(total!==length) fail('JPEG XT data length mismatch');
      if(isC2pa(join(pieces))) { ranges.push(...selected.map(x=>[x.start,x.end]));addRecord(records,'provenance','C2PA','Embedded provenance; signature and AI assertions not verified'); }
    }
    return ranges;
  }
  function crc32(b,start,end) { let c=0xffffffff;for(let p=start;p<end;p++){c^=b[p];for(let i=0;i<8;i++)c=(c>>>1)^((c&1)?0xedb88320:0);}return (c^0xffffffff)>>>0; }
  function scanPng(b,records) {
    const ranges=[],textKeys=new Map();let p=8,count=0,compressedCount=0,textBytes=0,ended=false,sawHeader=false,sawData=false;
    while(p<b.length) {
      if(++count>MAX_PARTS) fail('Too many PNG chunks');
      if(p+12>b.length) fail('Truncated PNG chunk');
      const length=be(b,p),type=four(b,p+4),end=p+length+12;
      if(end>b.length) fail('Invalid PNG chunk length');
      if(!sawHeader && (type!=='IHDR'||length!==13)) fail('Missing PNG header');
      sawHeader=true;
      // Validate metadata and control CRCs; leave potentially large image payload
      // CRC validation to the image decoder (we never modify those bytes).
      if(type!=='IDAT' && type!=='fdAT' && crc32(b,p+4,end-4)!==be(b,end-4)) fail('Invalid PNG metadata CRC');
      if(type==='IDAT') sawData=true;
      if(type==='iCCP' && ++compressedCount>8) fail('Too many compressed metadata blocks');
      if(type==='caBX') { ranges.push([p,end]);addRecord(records,'provenance','C2PA','Embedded provenance carrier; signature and AI assertions not verified'); }
      if(['tEXt','iTXt','zTXt'].includes(type)) {
        textBytes+=length;
        if(textBytes>LIMIT) fail('PNG text exceeds inspection limit');
        let k=p+8;while(k<end-4 && b[k]!==0 && k-p-8<=79)k++;
        if(k===end-4 || k===p+8 || k-p-8>79) fail('Invalid PNG text keyword');
        const key=text(b,p+8,k);
        if(type==='zTXt') {
          if(k+2>=end-4 || b[k+1]!==0)fail('Invalid PNG text compression header');
          if(++compressedCount>8)fail('Too many compressed metadata blocks');
        } else if(type==='iTXt') {
          if(k+3>=end-4 || b[k+1]>1 || b[k+2]!==0)fail('Invalid PNG international text header');
          if(b[k+1]===1 && key==='XML:com.adobe.xmp')fail('Compressed PNG XMP is not supported by the metadata parser');
          if(b[k+1]===1 && ++compressedCount>8)fail('Too many compressed metadata blocks');
          let t=k+3;
          for(let separators=0;separators<2;separators++) {
            while(t<end-4 && b[t]!==0)t++;
            if(t>=end-4)fail('Truncated PNG international text header');
            t++;
          }
          if(b[k+1]===1 && t===end-4)fail('Empty compressed PNG text');
        }
        const compressed=type==='zTXt' || (type==='iTXt' && b[k+1]===1);
        if(textKeys.has(key) && (compressed || textKeys.get(key)))fail('Duplicate compressed PNG metadata keys cannot be inspected reliably');
        textKeys.set(key,compressed);
        // Field names alone mean an embedded generation-related record, never
        // proof of AI pixels. Do not decompress untrusted streams here.
        field(records,'png',key,type==='tEXt'?text(b,k+1,end-4):'');
      }
      p=end;
      if(type==='IEND') {if(length!==0 || p!==b.length)fail('Trailing or invalid PNG end data');ended=true;break;}
    }
    if(!ended || !sawData) fail('Incomplete PNG image');
    return ranges;
  }
  function scanWebp(b,records) {
    if(le(b,4)+8!==b.length) fail('WebP RIFF length mismatch');
    const ranges=[];let p=12,count=0,sawImage=false;
    while(p<b.length) {
      if(++count>MAX_PARTS || p+8>b.length) fail('Truncated WebP chunk');
      const type=four(b,p),length=le(b,p+4),end=p+8+length+(length&1);
      if(end>b.length) fail('Invalid WebP chunk length');
      if(['VP8 ','VP8L','ANMF'].includes(type))sawImage=true;
      if(type==='C2PA') {ranges.push([p,end]);addRecord(records,'provenance','C2PA','Embedded provenance carrier; signature and AI assertions not verified');}
      p=end;
    }
    if(!sawImage) fail('Missing WebP image payload');
    return ranges;
  }
  function scan(b,records) {
    const kind=kindOf(b);
    if(kind==='unknown')return {kind,ranges:[],images:[]};
    const ranges=kind==='jpeg'?scanJpeg(b,records):kind==='png'?scanPng(b,records):scanWebp(b,records);
    return {kind,ranges,images:ranges.images||[]};
  }
  function inspect(value, parsedTags={}) {
    const records=[];let kind='unknown';
    try {
      const b=bytes(value);kind=kindOf(b);const {images}=scan(b,records);
      const multiImage=images.length>1;
      const secondaryMetadataInspected=!multiImage || (Array.isArray(parsedTags) && parsedTags.length===images.length);
      if(Array.isArray(parsedTags))for(const tags of parsedTags)inspectTags(tags,records);else inspectTags(parsedTags,records);
      const hasAiRecords=records.some(x=>x.kind!=='provenance'),hasProvenance=records.some(x=>x.kind==='provenance');
      const warnings=hasProvenance?['C2PA signatures and AI assertions are not verified']:[];
      if(!secondaryMetadataInspected)warnings.push('Additional JPEG metadata has not been fully inspected');
      if(multiImage)warnings.push('Multiple JPEG images: metadata-preserving lossless cleaning is not supported');
      return {status:kind==='unknown'||!secondaryMetadataInspected?'unknown':records.length?'records':'none',records,hasAiRecords,hasProvenance,kind,images,multiImage,secondaryMetadataInspected,losslessSupported:kind!=='unknown'&&!multiImage,error:null,decompressionLimit:2*1024*1024,warnings};
    } catch(e) {return {status:'error',records,hasAiRecords:records.some(x=>x.kind!=='provenance'),hasProvenance:records.some(x=>x.kind==='provenance'),kind,error:String(e.message||e),decompressionLimit:2*1024*1024,warnings:['Inspection incomplete']};}
  }
  function strip(value,expectedKind) {
    const b=bytes(value),{kind,ranges,images}=scan(b,[]);
    if(images.length>1)fail('Multi-image JPEG requires an explicitly selected normal-image re-encode');
    if(kind==='unknown' || (expectedKind && expectedKind!==kind))fail('Unsupported or mismatched image format');
    const parts=[];let start=0;for(const [from,to] of ranges){parts.push(b.subarray(start,from));start=to;}parts.push(b.subarray(start));const out=join(parts);
    if(kind==='webp')new DataView(out.buffer,out.byteOffset,out.byteLength).setUint32(4,out.length-8,true);
    const after=scan(out,[]);if(after.ranges.length)fail('Provenance removal verification failed');
    return out;
  }
  // Decoder input ONLY for an explicitly selected SDR re-encode. This preserves
  // private EXIF so orientation can be decoded correctly; it is NOT clean output.
  // Remove links to omitted auxiliary images before a browser HDR decoder sees it.
  function primaryForSdr(value) {
    const b=bytes(value);
    if(kindOf(b)!=='jpeg')fail('SDR primary preparation supports JPEG only');
    const images=jpegImages(b);
    const primary=strip(b.subarray(0,images[0].end),'jpeg');
    const parts=[];let start=0;
    for(const p of jpegParts(primary)) {
      const data=primary.subarray(p.data,p.end);
      const prefix=text(data,0,Math.min(data.length,40));
      const isMpf=p.marker===226 && prefix.startsWith('MPF\0');
      const isXmp=p.marker===225 && (prefix.startsWith('http://ns.adobe.com/xap/1.0/\0') || prefix.startsWith('http://ns.adobe.com/xmp/extension/\0'));
      if(isMpf || isXmp) {parts.push(primary.subarray(start,p.start));start=p.end;}
    }
    parts.push(primary.subarray(start));
    const result=join(parts);
    if(jpegImages(result).length!==1)fail('Primary JPEG extraction failed');
    return result;
  }
  function minimalOrientation(b) {
    const expected = new Uint8Array([69,120,105,102,0,0,77,77,0,42,0,0,0,8,0,1,1,18,0,3,0,0,0,1,0,1,0,0,0,0,0,0]);
    if(b.length!==32 || b[25]<1 || b[25]>8)return false;
    expected[25]=b[25];return eq(b,expected);
  }
  function remainingMetadata(b,kind) {
    const found=[];
    if(kind==='jpeg') {
      for(const p of jpegImages(b).flatMap(image=>image.parts)) if([225,236,237,254].includes(p.marker) && !(p.marker===225 && minimalOrientation(b.subarray(p.data,p.end)))) found.push('JPEG APP/COM metadata');
    } else if(kind==='png') {
      for(let p=8;p+12<=b.length;) {const type=four(b,p+4),length=be(b,p);if(['tEXt','iTXt','zTXt','eXIf','tIME','caBX'].includes(type))found.push('PNG '+type);p+=12+length;}
    } else if(kind==='webp') {
      for(let p=12;p+8<=b.length;) {const type=four(b,p),length=le(b,p+4);if(type==='XMP ' || type==='C2PA' || (type==='EXIF'&&!minimalOrientation(b.subarray(p+8,p+8+length))))found.push('WebP '+type);p+=8+length+(length&1);}
    }
    return found;
  }
  function verify(value,parsedTags={}) {
    const result=inspect(value,parsedTags);
    const remaining=result.status!=='error' && result.kind!=='unknown'?remainingMetadata(bytes(value),result.kind):[];
    return {...result,remainingMetadata:remaining,clean:result.status==='none' && !result.multiImage && remaining.length===0};
  }
  return Object.freeze({inspect,strip,verify,primaryForSdr});
})();
