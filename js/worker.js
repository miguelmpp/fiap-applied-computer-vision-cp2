/* FIAP - processamento de imagens em JavaScript puro, em Web Worker.
   Implementa equivalentes didáticos de: cvtColor, GaussianBlur, adaptiveThreshold,
   threshold/Otsu, morphologyEx, connectedComponentsWithStats e Sobel.
   Nenhuma contagem esperada é utilizada para localizar objetos. */
'use strict';

function gauss5(src,w,h) {
  const weights=[1,4,6,4,1];
  const tmp=new Uint8Array(w*h), out=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let s=0;for(let d=-2;d<=2;d++){const xx=Math.max(0,Math.min(w-1,x+d));s+=src[y*w+xx]*weights[d+2];}
    tmp[y*w+x]=(s+8)>>4;
  }
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let s=0;for(let d=-2;d<=2;d++){const yy=Math.max(0,Math.min(h-1,y+d));s+=tmp[yy*w+x]*weights[d+2];}
    out[y*w+x]=(s+8)>>4;
  }
  return out;
}
function adaptativo(src,w,h,block,C){
  const W=w+1, integral=new Float64Array(W*(h+1));
  for(let y=1;y<=h;y++){
    let s=0, o=(y-1)*w, row=y*W,prev=(y-1)*W;
    for(let x=1;x<=w;x++){s+=src[o+x-1];integral[row+x]=integral[prev+x]+s;}
  }
  const out=new Uint8Array(w*h),r=Math.floor(block/2);
  for(let y=0;y<h;y++){
    const y1=Math.max(0,y-r),y2=Math.min(h-1,y+r), top=y1*W, bot=(y2+1)*W;
    for(let x=0;x<w;x++){
      const x1=Math.max(0,x-r),x2=Math.min(w-1,x+r);
      const total=integral[bot+x2+1]-integral[top+x2+1]-integral[bot+x1]+integral[top+x1];
      const m=total/((y2-y1+1)*(x2-x1+1));
      out[y*w+x]=src[y*w+x]<=m-C ?255:0;
    }
  }
  return out;
}
function otsu(src,invert){
  const hist=new Uint32Array(256),out=new Uint8Array(src.length);
  let sum=0;for(const v of src){hist[v]++;sum+=v;}
  let wB=0,sumB=0,best=-1,level=0;
  for(let t=0;t<256;t++){
    wB+=hist[t]; if(!wB)continue;
    const wF=src.length-wB;if(!wF)break;
    sumB+=t*hist[t];const mB=sumB/wB,mF=(sum-sumB)/wF;
    const diff=wB*wF*(mB-mF)*(mB-mF);
    if(diff>best){best=diff;level=t;}
  }
  for(let i=0;i<src.length;i++)out[i]=(invert ? src[i]<=level:src[i]>level) ?255:0;
  return out;
}
function offsets(k){
  const ret=[],r=k>>1;
  for(let dy=-r;dy<=r;dy++){
    let row;
    if(k===5)row=(Math.abs(dy)===2)?0:2;
    else if(k===7)row=(Math.abs(dy)===3)?0:(Math.abs(dy)===2?2:3);
    else row=Math.floor(Math.sqrt(r*r-dy*dy));
    for(let dx=-row;dx<=row;dx++)ret.push([dx,dy]);
  }
  return ret;
}
function morf(src,w,h,k,dilate){
  const out=new Uint8Array(src.length),off=offsets(k);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    let v=dilate?0:255;
    for(let j=0;j<off.length;j++){
      const xx=x+off[j][0],yy=y+off[j][1];
      const p=(xx<0||xx>=w||yy<0||yy>=h)?0:src[yy*w+xx];
      if(dilate ?p!==0:p===0){v=dilate?255:0;break;}
    }
    out[y*w+x]=v;
  }
  return out;
}
function componentes(src,w,h,minPct,rounded){
  const visited=new Uint8Array(w*h), stack=new Int32Array(w*h),selected=[];
  let total=0;
  const min=w*h*minPct/100,max=w*h*.2;
  for(let idx=0;idx<src.length;idx++){
    if(src[idx]===0||visited[idx])continue;
    total++;
    let size=0,top=0;stack[top++]=idx;visited[idx]=1;
    let minX=w,minY=h,maxX=0,maxY=0;
    while(top>0){
      const p=stack[--top],y=(p/w)|0,x=p-y*w;
      size++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;
      for(let dy=-1;dy<=1;dy++){
        const yy=y+dy;if(yy<0||yy>=h)continue;
        for(let dx=-1;dx<=1;dx++){
          const xx=x+dx;if(xx<0||xx>=w)continue;
          const q=yy*w+xx;
          if(src[q]!==0&&!visited[q]){visited[q]=1;stack[top++]=q;}
        }
      }
    }
    const bw=maxX-minX+1,bh=maxY-minY+1,aspect=bw/bh;
    if(size<min||size>max||(rounded&&(aspect<.65||aspect>1.55)))continue;
    selected.push({x:minX,y:minY,w:bw,h:bh,area:size});
  }
  return {selected,total};
}
function sobelVisual(src,w,h){
  const out=new Uint8Array(src.length);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    const idx=y*w+x;
    const a=src[idx-w-1],b=src[idx-w],c=src[idx-w+1],
          d=src[idx-1],f=src[idx+1],g=src[idx+w-1],hh=src[idx+w],i=src[idx+w+1];
    const gx=(-a+c-2*d+2*f-g+i),gy=(-a-2*b-c+g+2*hh+i);
    out[idx]=Math.hypot(gx,gy)>=120?255:0;
  }
  return out;
}
onmessage=function(event){
  const {id,w,h,data,config}=event.data;
  try {
    const rgba=new Uint8ClampedArray(data),n=w*h;
    const gray=new Uint8Array(n),sat=new Uint8Array(n);
    for(let i=0,p=0;i<n;i++,p+=4){
      const r=rgba[p],g=rgba[p+1],b=rgba[p+2];
      gray[i]=Math.round(.299*r+.587*g+.114*b);
      const hi=Math.max(r,g,b),lo=Math.min(r,g,b);
      sat[i]=hi===0?0:Math.round(255*(hi-lo)/hi);
    }
    const blur=gauss5(gray,w,h);
    let binary;
    if(config.modo==='adaptive')binary=adaptativo(blur,w,h,config.janela,config.limiar);
    else if(config.modo==='saturation')binary=otsu(sat,false);
    else binary=otsu(blur,true);
    const opened=morf(morf(binary,w,h,5,false),w,h,5,true);
    const clean=morf(morf(opened,w,h,7,true),w,h,7,false);
    const {selected,total}=componentes(clean,w,h,config.areaPercentual,config.arredondado);
    const edge=sobelVisual(blur,w,h);
    const buffers=[gray,blur,sat,binary,clean,edge];
    postMessage({id,ok:true,w,h,components:selected,discarded:Math.max(0,total-selected.length),gray:gray.buffer,blur:blur.buffer,sat:sat.buffer,binary:binary.buffer,clean:clean.buffer,edge:edge.buffer},buffers.map(v=>v.buffer));
  }catch(e){postMessage({id,ok:false,error:e.message||String(e)});}
};
