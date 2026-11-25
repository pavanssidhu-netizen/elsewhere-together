import sharp from 'sharp';
const [,, file, cw, ch] = process.argv;
const {data, info} = await sharp(file).ensureAlpha().raw().toBuffer({resolveWithObject:true});
const cols = info.width / cw, rows = info.height / ch;
for (let r=0;r<rows;r++){ let line=''; for(let c=0;c<cols;c++){ let n=0; for(let y=0;y<ch;y++)for(let x=0;x<cw;x++){ if(data[((r*ch+y)*info.width + c*cw+x)*4+3]>40)n++; } line+=String(Math.min(9,Math.floor(10*n/(cw*ch)))); } console.log(r, line); }
