import { readFileSync } from "node:fs";
import { PNG } from "pngjs";
const ts=32, dir="assetsources/asset-forge/exports/waystone";
const stage=JSON.parse(readFileSync(`${dir}/waystone.stage.json`,"utf8"));
const sheet=PNG.sync.read(readFileSync(`${dir}/waystone.png`));
const cols=sheet.width/ts, W=stage.cols*ts, H=stage.rows*ts;
const out=new PNG({width:W,height:H}); out.data.fill(0);
function blit(idx,dx,dy){const sx=(idx%cols)*ts,sy=Math.floor(idx/cols)*ts;
  for(let y=0;y<ts;y++)for(let x=0;x<ts;x++){const si=((sy+y)*sheet.width+(sx+x))*4;if(sheet.data[si+3]===0)continue;
    const di=((dy+y)*W+(dx+x))*4;out.data[di]=sheet.data[si];out.data[di+1]=sheet.data[si+1];out.data[di+2]=sheet.data[si+2];out.data[di+3]=255;}}
for(const layer of stage.layers)for(let r=0;r<stage.rows;r++)for(let c=0;c<stage.cols;c++){
  const ref=layer.data[r][c]; if(!ref)continue; blit(Number(ref.split(":")[1]),c*ts,r*ts);}
// mark 'q' wall chars with a faint red dot so we can locate faces
const rows=stage.ascii.rows;
for(let r=0;r<stage.rows;r++)for(let c=0;c<stage.cols;c++){if(rows[r][c]!=="q"&&rows[r][c]!=="m")continue;
  const col=rows[r][c]==="m"?[60,140,255]:[255,40,40];
  for(let y=0;y<3;y++)for(let x=0;x<3;x++){const di=((r*ts+y)*W+(c*ts+x))*4;out.data[di]=col[0];out.data[di+1]=col[1];out.data[di+2]=col[2];}}
PNG.sync && (await import("node:fs")).writeFileSync("artifacts/_ws_terrain_only.png",PNG.sync.write(out));
console.log("terrain-only ->",W,H);
