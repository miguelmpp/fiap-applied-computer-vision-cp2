/* FIAP | Checkpoint 2 - Contador de Elementos.
 * Versão estável SEM OpenCV.js: processamento equivalente em JavaScript puro
 * usando Canvas + Web Worker, para evitar congelamento durante o carregamento do WASM.
 * A quantidade esperada é SOMENTE uma métrica de conferência; não orienta a detecção.
 * Código OpenCV original preservado em js/script-opencv-original.js para estudo.
 */
(() => {
  'use strict';
  const TOTAL=5,MAX_LADO=960;
  const ETAPAS=['Original','Gray','Blur','Saturation','Binary','Clean','Canny','Masked','Final'];
  const fotos=Array.from({length:TOTAL},(_,i)=>({numero:i+1,imagem:null,miniatura:null,esperado:5,resultado:null,erro:null}));
  const $=id=>document.getElementById(id);
  const ui={grid:$('photoGrid'),contador:$('photoCount'),botao:$('btnProcessar'),arquivo:$('filesInput'),modo:$('modo'),area:$('areaMinima'),areaValor:$('areaValor'),formato:$('formato'),janela:$('janela'),janelaValor:$('janelaValor'),limiar:$('limiar'),limiarValor:$('limiarValor'),cvStatus:$('cvStatus'),cvDot:$('cvDot'),runStatus:$('runStatus'),summary:$('summary'),totalDetected:$('totalDetected'),totalAnalyzed:$('totalAnalyzed'),totalCorrect:$('totalCorrect'),selectedPhoto:$('selectedPhoto'),selectedCount:$('selectedCount'),selectedDescription:$('selectedDescription')};
  let processando=false,selecionada=0,worker=null,workerId=0,workerPending=null;

  function iniciarWorker(){
    if(worker)worker.terminate();
    worker=new Worker('js/worker.js');
    worker.onmessage=e=>{
      const p=workerPending;
      if(p&&e.data.id===p.id){clearTimeout(p.timer);workerPending=null;e.data.ok?p.resolve(e.data):p.reject(new Error(e.data.error));}
    };
    worker.onerror=e=>{const p=workerPending;if(p){clearTimeout(p.timer);workerPending=null;p.reject(new Error('Falha no processador local: '+e.message));}console.error('Erro worker',e);};
  }
  function trabalhoWorker(pixels,w,h,config){
    if(!worker)iniciarWorker();
    if(workerPending)throw Error('Já existe processamento em andamento');
    const id=++workerId;
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{workerPending=null;iniciarWorker();reject(new Error('Tempo limite excedido (45 s).'));},45000);
      workerPending={id,resolve,reject,timer};
      worker.postMessage({id,w,h,data:pixels,config},[pixels]);
    });
  }
  function atualizarBotao(){
    const n=fotos.filter(f=>f.imagem).length;
    ui.botao.disabled=processando||n===0;
    ui.botao.textContent=processando?'Processando fotografias…':n===0?'Carregue as fotografias':n===5?'Contar as 5 fotos':`Contar fotos disponíveis (${n}/5)`;
  }
  function status(msg,ok=true){ui.cvStatus.textContent=msg;ui.cvDot.className='live-dot '+(ok?'ready':'error');atualizarBotao();}
  function imagemURL(url,revoke=false){return new Promise((resolve,reject)=>{const img=new Image();img.onload=()=>{if(revoke)URL.revokeObjectURL(url);resolve(img);};img.onerror=()=>{if(revoke)URL.revokeObjectURL(url);reject(Error('Não foi possível abrir a fotografia.'));};img.src=url;});}
  function criarCanvas(imagem,max){const width=imagem.naturalWidth||imagem.width,height=imagem.naturalHeight||imagem.height,escala=Math.min(1,max/Math.max(width,height));const can=document.createElement('canvas');can.width=Math.round(width*escala);can.height=Math.round(height*escala);can.getContext('2d',{willReadFrequently:true}).drawImage(imagem,0,0,can.width,can.height);return can;}
  function definirFoto(i,img){fotos[i].imagem=img;fotos[i].miniatura=criarCanvas(img,360).toDataURL('image/jpeg',.8);fotos[i].resultado=null;fotos[i].erro=null;}
  async function procurarFotos(){await Promise.all(fotos.map(async(f,i)=>{try{definirFoto(i,await imagemURL(`img/foto${i+1}.jpg`));}catch(e){console.warn('Foto não carregada',i+1,e.message);}}));renderizarTudo();ui.runStatus.textContent=fotos.every(f=>f.imagem)?'5 fotos prontas. Clique em Contar as 5 fotos.':'Algumas fotos faltam na pasta img. Selecione os arquivos manualmente, se necessário.';}
  async function importarArquivos(lista){const arr=Array.from(lista).filter(a=>a.type.startsWith('image/')).sort((a,b)=>a.name.localeCompare(b.name,'pt-BR',{numeric:true})).slice(0,TOTAL);const start=arr.length===1?Math.max(0,fotos.findIndex(f=>!f.imagem)):0;for(let i=0;i<arr.length;i++){try{definirFoto(Math.min(4,start+i),await imagemURL(URL.createObjectURL(arr[i]),true));}catch(e){ui.runStatus.textContent=e.message;}}ui.arquivo.value='';renderizarTudo();}
  const config=()=>({modo:ui.modo.value,areaPercentual:Number(ui.area.value),arredondado:ui.formato.value==='round',janela:Number(ui.janela.value),limiar:Number(ui.limiar.value)});
  function invalidar(){if(processando)return;fotos.forEach(f=>{f.resultado=null;f.erro=null;});ui.runStatus.textContent='Configurações alteradas. Clique em contar novamente.';renderizarTudo();}
  function fotoEstado(f){if(f.erro)return{texto:'Erro',classe:'fail'};if(!f.imagem)return{texto:'Sem foto',classe:''};if(!f.resultado)return{texto:'Pendente',classe:''};if(f.esperado===null)return{texto:'Analisada',classe:''};return f.resultado.contagem===f.esperado?{texto:'Correto',classe:'ok'}:{texto:'Revisar',classe:'fail'};}
  function renderizarFotos(){ui.grid.innerHTML=fotos.map((f,i)=>{const e=fotoEstado(f),nn=String(i+1).padStart(2,'0');return `<article class="photo-card ${selecionada===i?'active':''}"><div class="photo-preview">${f.miniatura?`<img src="${f.miniatura}" alt="Prévia da foto ${nn}">`:`<span>FOTO ${nn}<br>SEM IMAGEM</span>`}</div><div class="photo-meta"><strong>Foto ${nn}</strong><span class="status-mini ${e.classe}">${e.texto}</span></div><label for="esperado-${i}">Quantidade real (para conferência)</label><input id="esperado-${i}" class="expected-input" data-expected="${i}" type="number" min="0" step="1" value="${f.esperado===null?'':f.esperado}"><button class="select-photo" data-photo="${i}" type="button">${f.resultado?'Ver resultados':'Selecionar foto'}</button></article>`;}).join('');ui.contador.textContent=`${fotos.filter(f=>f.imagem).length} / 5 fotos`;}
  function renderizarDetalhes(){const f=fotos[selecionada];ui.selectedPhoto.textContent=`Foto ${String(selecionada+1).padStart(2,'0')}`;ui.selectedCount.textContent=f.resultado?f.resultado.contagem:'—';ui.selectedDescription.textContent=f.erro?`Erro: ${f.erro}`:f.resultado?`Motor local JavaScript. ${f.resultado.descartados} componentes descartados. Confira se os retângulos envolvem tampinhas reais.`:f.imagem?'Imagem carregada. Clique em Contar as 5 fotos para ver todas as etapas.':'Adicione a fotografia à pasta img.';for(const etapa of ETAPAS){const el=$('stage'+etapa),src=f.resultado?f.resultado.etapas[etapa]:(etapa==='Original'?f.miniatura:null),placeholder=el.parentElement.querySelector('.stage-placeholder');if(src){el.src=src;el.hidden=false;placeholder.hidden=true;}else{el.hidden=true;el.removeAttribute('src');placeholder.hidden=false;}}}
  function renderizarResumo(){const done=fotos.filter(f=>f.resultado);ui.summary.hidden=done.length===0;ui.totalDetected.textContent=done.reduce((sum,f)=>sum+f.resultado.contagem,0);ui.totalAnalyzed.textContent=`${done.length} / ${TOTAL}`;const valid=done.filter(f=>f.esperado!==null),ok=valid.filter(f=>f.resultado.contagem===f.esperado);ui.totalCorrect.textContent=valid.length?`${ok.length} / ${valid.length}`:'—';}
  function renderizarTudo(){renderizarFotos();renderizarDetalhes();renderizarResumo();atualizarBotao();}
  function toData(gray,w,h,original=null,mask=null){const c=document.createElement('canvas');c.width=w;c.height=h;const ctx=c.getContext('2d'),im=ctx.createImageData(w,h),out=im.data;for(let i=0,j=0;i<gray.length;i++,j+=4){if(original){const show=!mask||mask[i]!==0;out[j]=show?original[j]:255;out[j+1]=show?original[j+1]:255;out[j+2]=show?original[j+2]:255;}else{out[j]=out[j+1]=out[j+2]=gray[i];}out[j+3]=255;}ctx.putImageData(im,0,0);return c.toDataURL('image/jpeg',.81);}
  async function analisar(imagem,cfg){
    const base=criarCanvas(imagem,MAX_LADO),w=base.width,h=base.height,ctx=base.getContext('2d',{willReadFrequently:true});
    const originalUrl=base.toDataURL('image/jpeg',.85),raw=ctx.getImageData(0,0,w,h).data;
    // Transferimos cópia, pois o buffer é movido para o Worker.
    const rawCopy=new Uint8ClampedArray(raw),res=await trabalhoWorker(rawCopy.buffer,w,h,cfg);
    const gray=new Uint8Array(res.gray),blur=new Uint8Array(res.blur),sat=new Uint8Array(res.sat),binary=new Uint8Array(res.binary),clean=new Uint8Array(res.clean),edge=new Uint8Array(res.edge);
    const maskedUrl=toData(clean,w,h,raw,clean);
    ctx.lineWidth=Math.max(2,Math.round(w/320));ctx.strokeStyle='#0cce52';ctx.fillStyle='#0cce52';ctx.font=`bold ${Math.max(16,Math.round(w/35))}px Arial`;
    res.components.forEach((o,i)=>{ctx.strokeRect(o.x,o.y,o.w,o.h);ctx.fillText(String(i+1),o.x+4,Math.max(22,o.y-7));});
    return {contagem:res.components.length,descartados:res.discarded,etapas:{Original:originalUrl,Gray:toData(gray,w,h),Blur:toData(blur,w,h),Saturation:toData(sat,w,h),Binary:toData(binary,w,h),Clean:toData(clean,w,h),Canny:toData(edge,w,h),Masked:maskedUrl,Final:base.toDataURL('image/jpeg',.85)}};
  }
  async function processarFotos(){if(processando)return;processando=true;const cfg=config();[ui.arquivo,ui.modo,ui.area,ui.formato,ui.janela,ui.limiar].forEach(x=>x.disabled=true);atualizarBotao();let ok=0;
    try{for(let i=0;i<TOTAL;i++){const f=fotos[i];if(!f.imagem)continue;ui.runStatus.textContent=`Analisando foto ${i+1} de 5…`;await new Promise(r=>setTimeout(r,40));f.resultado=null;f.erro=null;try{f.resultado=await analisar(f.imagem,cfg);ok++;}catch(e){f.erro=e.message||String(e);console.error('Erro de detecção na foto '+(i+1),e);}selecionada=i;renderizarTudo();}}
    finally{processando=false;[ui.arquivo,ui.modo,ui.area,ui.formato,ui.janela,ui.limiar].forEach(x=>x.disabled=false);ui.runStatus.textContent=`${ok} foto(s) processada(s). Confira os resultados e os retângulos.`;renderizarTudo();}
  }
  function iniciar(){
    ui.areaValor.textContent=Number(ui.area.value).toFixed(2).replace('.',',')+'%';
    ui.grid.addEventListener('click',ev=>{const button=ev.target.closest('[data-photo]');if(!button)return;selecionada=Number(button.dataset.photo);renderizarTudo();$('stageGrid').scrollIntoView({behavior:'smooth',block:'start'});});
    ui.grid.addEventListener('change',ev=>{const el=ev.target.closest('[data-expected]');if(!el)return;const v=el.value.trim();fotos[Number(el.dataset.expected)].esperado=v===''?null:Math.max(0,Math.floor(Number(v)));renderizarTudo();});
    ui.arquivo.addEventListener('change',ev=>importarArquivos(ev.target.files));
    [ui.modo,ui.formato].forEach(el=>el.addEventListener('change',invalidar));
    ui.janela.addEventListener('input',()=>{ui.janelaValor.textContent=ui.janela.value+' px';invalidar();});
    ui.limiar.addEventListener('input',()=>{ui.limiarValor.textContent=ui.limiar.value;invalidar();});
    ui.area.addEventListener('input',()=>{ui.areaValor.textContent=Number(ui.area.value).toFixed(2).replace('.',',')+'%';invalidar();});
    ui.botao.addEventListener('click',processarFotos);
    try{iniciarWorker();status('Processador local pronto — sem espera pelo OpenCV.js.','ready');}catch(e){status('Navegador não suporta Web Worker. '+e.message,false);}
    renderizarTudo();procurarFotos();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',iniciar);else iniciar();
})();
