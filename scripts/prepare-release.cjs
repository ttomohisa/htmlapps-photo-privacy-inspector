'use strict';
// Build distributable GitHub Release assets without creating a tag or publishing.
// Requires the stock zip/unzip commands on the Ubuntu GitHub Actions runner.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const config=JSON.parse(fs.readFileSync(path.join(root,'app.config.json'),'utf8'));
assert.match(config.version,/^[0-9]+\.[0-9]+\.[0-9]+$/);
const version=config.version,tag='v'+version;
const name='htmlapps-photo-privacy-inspector-'+tag;
const out=path.join(root,'dist','release-package');
const full=path.join(out,'distribution');
fs.rmSync(out,{recursive:true,force:true});
fs.mkdirSync(full,{recursive:true});
const generated=[
 ['dist/index.html',name+'.html'],
 ['dist/index.self-extract.html',name+'.self-extract.html']
];
for(const [source,dest] of generated) {
 const src=path.join(root,source);
 assert.ok(fs.statSync(src).size>0,source+' is empty');
 fs.copyFileSync(src,path.join(out,dest));
 fs.copyFileSync(src,path.join(full,dest));
}
for(const source of [
 'dist/dependency-manifest.json','dist/self-extract-manifest.json',
 'README.md','README.ja.md','CHANGELOG.md','LICENSE','THIRD_PARTY_NOTICES.md'
]){
 const src=path.join(root,source),dest=path.join(full,path.basename(source));
 assert.ok(fs.statSync(src).size>0,source+' is empty');
 fs.copyFileSync(src,dest);
}
const archive=path.join(out,name+'.zip');
execFileSync('zip',['-q','-r',archive,'.'],{cwd:full,stdio:'inherit'});
execFileSync('unzip',['-tq',archive],{cwd:out,stdio:'pipe'});
assert.ok(fs.statSync(archive).size>0,'Release ZIP missing');
const artifactFiles=[name+'.html',name+'.self-extract.html',name+'.zip'];
const checksums=artifactFiles.map(file=>crypto.createHash('sha256').update(fs.readFileSync(path.join(out,file))).digest('hex')+'  '+file).join('\n')+'\n';
fs.writeFileSync(path.join(out,'SHA256SUMS.txt'),checksums);
const lines=fs.readFileSync(path.join(root,'CHANGELOG.md'),'utf8').split(/\r?\n/);
const begin=lines.findIndex(line=>line==='## ['+version+']'||line.startsWith('## ['+version+'] '));
assert.ok(begin>=0,'Missing CHANGELOG notes for '+version);
const end=lines.findIndex((line,i)=>i>begin&&/^## /.test(line));
const details=lines.slice(begin+1,end<0?undefined:end).join('\n').trim();
assert.ok(details,'Release notes are empty for '+version);
const project='https://github.com/'+config.repository.owner+'/'+config.repository.name;
const notes=[
 '# Photo Privacy Inspector '+tag,'',details,'','## Downloads','',
 '- Standalone HTML: save and open locally in a browser',
 '- Self-extracting HTML: smaller download, locally unpacks in a supported browser',
 '- ZIP: HTML, manifests, documentation, license and notices',
 '- SHA256SUMS.txt: checksums for the three release files',
 '','See [README (English)]('+project+'/blob/'+tag+'/README.md) or [README (日本語)]('+project+'/blob/'+tag+'/README.ja.md) for browser support and limitations.',''
].join('\n');
fs.writeFileSync(path.join(out,'notes.md'),notes);
console.log('PASS release packaging: '+tag+', '+artifactFiles.length+' files + checksums, notes and all distribution documents');
