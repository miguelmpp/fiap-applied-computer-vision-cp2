/*
  FIAP — Applied Computer Vision | Checkpoint 2 — Contador de Elementos
  Pipeline: imagem -> cinza/HSV -> Gaussiano -> threshold -> morfologia
            -> connectedComponentsWithStats -> bounding boxes.
  Observação: 'esperado' serve somente à comparação, NUNCA à detecção.
*/
(() => {
  'use strict';

  const TOTAL_FOTOS = 5;
  const MAX_LADO = 960; // Reduz fotos muito grandes para manter o navegador responsivo.
  const ETAPAS = ['Original', 'Gray', 'Blur', 'Saturation', 'Binary', 'Clean', 'Canny', 'Masked', 'Final'];
  const fotos = Array.from({ length: TOTAL_FOTOS }, (_, i) => ({
    numero: i + 1, imagem: null, miniatura: null, esperado: 5,
    resultado: null, erro: null
  }));

  let cvApi = null;
  let processando = false;
  let selecionada = 0;

  const $ = id => document.getElementById(id);
  const ui = {
    grid: $('photoGrid'), contador: $('photoCount'), botao: $('btnProcessar'),
    arquivo: $('filesInput'), modo: $('modo'), area: $('areaMinima'),
    areaValor: $('areaValor'), formato: $('formato'), nome: $('nomeObjeto'),
    janela: $('janela'), janelaValor: $('janelaValor'), limiar: $('limiar'), limiarValor: $('limiarValor'),
    cvStatus: $('cvStatus'), cvDot: $('cvDot'), runStatus: $('runStatus'),
    summary: $('summary'), totalDetected: $('totalDetected'),
    totalAnalyzed: $('totalAnalyzed'), totalCorrect: $('totalCorrect'),
    selectedPhoto: $('selectedPhoto'), selectedCount: $('selectedCount'),
    selectedDescription: $('selectedDescription')
  };

  function statusCV(mensagem, estado) {
    ui.cvStatus.textContent = mensagem;
    ui.cvDot.className = 'live-dot' + (estado ? ' ' + estado : '');
    atualizarBotao();
  }

  // Carrega OpenCV.js de arquivo local ou de CDNs alternativas.
  // O projeto funciona com Live Server; o servidor não fornece o OpenCV sozinho.
  const FONTES_OPENCV = [
    { nome: 'arquivo local', url: 'vendor/opencv.js', limite: 12000 },
    { nome: 'jsDelivr', url: 'https://cdn.jsdelivr.net/npm/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js', limite: 25000 },
    { nome: 'unpkg', url: 'https://unpkg.com/@techstark/opencv-js@4.10.0-release.1/dist/opencv.js', limite: 25000 },
    { nome: 'site oficial', url: 'https://docs.opencv.org/4.x/opencv.js', limite: 25000 }
  ];

  function aguardar(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  function carregarScript(url, limite) {
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      let resolvido = false;
      const finalizar = (erro) => {
        if (resolvido) return;
        resolvido = true;
        clearTimeout(timer);
        script.onerror = null;
        script.onload = null;
        if (erro) {
          script.remove();
          reject(erro);
        } else {
          resolve();
        }
      };
      const timer = setTimeout(() => finalizar(new Error('Tempo esgotado ao baixar o arquivo JS.')), limite);
      script.async = true;
      script.src = url;
      script.onload = () => finalizar(null);
      script.onerror = () => finalizar(new Error('Arquivo inacessível: ' + url));
      document.head.appendChild(script);
    });
  }

  async function verificarBiblioteca(limite) {
    const fim = Date.now() + limite;
    while (Date.now() < fim) {
      let candidato = window.cv;
      if (candidato && typeof candidato.then === 'function') {
        // Algumas versões atuais de OpenCV.js exportam uma Promise.
        candidato = await Promise.race([
          Promise.resolve(candidato),
          aguardar(Math.max(200, fim - Date.now())).then(() => { throw new Error('Inicialização WASM excedeu o tempo limite.'); })
        ]);
        if (candidato) window.cv = candidato;
      }
      if (candidato && typeof candidato.Mat === 'function' &&
          typeof candidato.imread === 'function' &&
          typeof candidato.connectedComponentsWithStats === 'function') {
        // Confirma também que o runtime WebAssembly aceita instanciar Mats.
        let teste = null;
        try {
          teste = new candidato.Mat();
          teste.delete();
          return candidato;
        } catch (_) {
          if (teste) try { teste.delete(); } catch (_) { /* ignore */ }
        }
      }
      await aguardar(250);
    }
    throw new Error('Biblioteca encontrada, mas o runtime não ficou pronto no prazo.');
  }

  async function esperarOpenCV() {
    const falhas = [];
    for (const fonte of FONTES_OPENCV) {
      statusCV(`Carregando OpenCV.js (${fonte.nome})…`, '');
      try {
        // Pode haver uma biblioteca carregada por uma tentativa anterior.
        if (!window.cv) await carregarScript(fonte.url, fonte.limite);
        cvApi = await verificarBiblioteca(fonte.limite);
        statusCV(`OpenCV.js pronto (${fonte.nome}). Pode contar as 5 fotos.`, 'ready');
        console.info('OpenCV.js carregado com sucesso:', fonte.url);
        return;
      } catch (erro) {
        falhas.push(`${fonte.nome}: ${erro.message}`);
        console.warn('Tentativa de carregar OpenCV.js não funcionou:', fonte.nome, erro);
        // Só tentamos outra URL se a versão anterior não chegou a inicializar.
        // Ao trocar de fonte, removemos a referência incompleta.
        window.cv = undefined;
      }
    }
    statusCV('Não foi possível carregar OpenCV.js. Veja o Console (F12) ou instale a versão local.', 'error');
    ui.runStatus.textContent = 'Falha ao carregar a biblioteca. Consulte README.md e execute instalar-opencv-local.ps1.';
    console.error('Falhas ao carregar OpenCV.js:\n' + falhas.join('\n'));
  }

  function urlParaImagem(url, revogar = false) {
    return new Promise((resolve, reject) => {
      const imagem = new Image();
      imagem.onload = () => {
        if (revogar) URL.revokeObjectURL(url);
        resolve(imagem);
      };
      imagem.onerror = () => {
        if (revogar) URL.revokeObjectURL(url);
        reject(new Error('Não foi possível abrir a imagem.'));
      };
      imagem.src = url;
    });
  }

  function miniatura(imagem) {
    const largura = imagem.naturalWidth || imagem.width;
    const altura = imagem.naturalHeight || imagem.height;
    const escala = Math.min(1, 360 / Math.max(largura, altura));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(largura * escala));
    canvas.height = Math.max(1, Math.round(altura * escala));
    canvas.getContext('2d').drawImage(imagem, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL('image/jpeg', 0.82);
  }

  function definirFoto(indice, imagem) {
    fotos[indice].imagem = imagem;
    fotos[indice].miniatura = miniatura(imagem);
    fotos[indice].resultado = null;
    fotos[indice].erro = null;
  }

  async function procurarFotosDaPasta() {
    await Promise.all(fotos.map(async (foto, i) => {
      try {
        const imagem = await urlParaImagem(`img/foto${i + 1}.jpg`);
        definirFoto(i, imagem);
      } catch (_) {
        // É normal ainda não existir uma foto, pois deve ser produzida pelo grupo.
      }
    }));
    renderizarTudo();
    if (fotos.every(f => !f.imagem)) {
      ui.runStatus.textContent = 'Adicione as 5 fotografias reais à pasta img ou selecione arquivos para testar.';
    } else {
      ui.runStatus.textContent = 'Fotos carregadas. Quantidades esperadas = 5 cada. Clique em contar para iniciar.';
    }
  }

  async function importarArquivos(lista) {
    const arquivos = Array.from(lista).filter(arq => arq.type.startsWith('image/'));
    if (!arquivos.length) return;
    arquivos.sort((a, b) => a.name.localeCompare(b.name, 'pt-BR', {numeric: true}));
    if (arquivos.length > TOTAL_FOTOS) {
      ui.runStatus.textContent = 'Foram selecionadas mais de cinco imagens. Usando somente as cinco primeiras.';
    }
    const primeiros = arquivos.slice(0, TOTAL_FOTOS);
    const inicio = primeiros.length === 1 ? Math.max(0, fotos.findIndex(f => !f.imagem)) : 0;
    for (let i = 0; i < primeiros.length; i++) {
      const indice = Math.min(TOTAL_FOTOS - 1, inicio + i);
      try {
        const url = URL.createObjectURL(primeiros[i]);
        const imagem = await urlParaImagem(url, true);
        definirFoto(indice, imagem);
      } catch (erro) {
        ui.runStatus.textContent = `Falha ao carregar ${primeiros[i].name}: ${erro.message}`;
      }
    }
    renderizarTudo();
    ui.arquivo.value = '';
  }

  function configuracoes() {
    return {
      modo: ui.modo.value,
      areaPercentual: Number(ui.area.value),
      arredondado: ui.formato.value === 'round',
      janela: Number(ui.janela.value),
      limiar: Number(ui.limiar.value)
    };
  }

  function invalidarResultados() {
    if (processando) return;
    fotos.forEach(foto => { foto.resultado = null; foto.erro = null; });
    ui.runStatus.textContent = 'Os parâmetros mudaram. Processe as fotos novamente.';
    renderizarTudo();
  }

  function atualizarBotao() {
    const carregadas = fotos.filter(f => f.imagem).length;
    ui.botao.disabled = processando || !cvApi || carregadas === 0;
    ui.botao.textContent = processando ? 'Processando fotografias…' :
      carregadas === 0 ? 'Carregue as fotografias' :
      carregadas === TOTAL_FOTOS ? 'Contar as 5 fotos' :
      `Contar fotos disponíveis (${carregadas}/5)`;
  }

  function escapar(valor) {
    return String(valor).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  }

  function estadoFoto(foto) {
    if (foto.erro) return {rotulo:'Erro', classe:'fail'};
    if (!foto.imagem) return {rotulo:'Sem foto', classe:''};
    if (!foto.resultado) return {rotulo:'Pendente', classe:''};
    if (foto.esperado === null) return {rotulo:'Analisada', classe:''};
    return foto.resultado.contagem === foto.esperado
      ? {rotulo:'Correto', classe:'ok'} : {rotulo:'Revisar', classe:'fail'};
  }

  function renderizarFotos() {
    ui.grid.innerHTML = fotos.map((foto, i) => {
      const estado = estadoFoto(foto);
      const numero = String(i + 1).padStart(2, '0');
      const preview = foto.miniatura
        ? `<img src="${foto.miniatura}" alt="Prévia da foto ${i + 1}">`
        : `<span>FOTO ${numero}<br>SEM IMAGEM</span>`;
      const valor = foto.esperado === null ? '' : foto.esperado;
      return `<article class="photo-card ${selecionada === i ? 'active' : ''}">
        <div class="photo-preview">${preview}</div>
        <div class="photo-meta"><strong>Foto ${numero}</strong><span class="status-mini ${estado.classe}">${estado.rotulo}</span></div>
        <label for="esperado-${i}">Quantidade real (para conferência)</label>
        <input id="esperado-${i}" class="expected-input" data-expected="${i}" type="number" min="0" step="1" value="${valor}" placeholder="Informe após contar">
        <button class="select-photo" data-photo="${i}" type="button">${foto.resultado ? 'Ver resultados' : 'Selecionar foto'}</button>
      </article>`;
    }).join('');
    ui.contador.textContent = `${fotos.filter(f => f.imagem).length} / 5 fotos`;
  }

  function renderizarDetalhes() {
    const foto = fotos[selecionada];
    ui.selectedPhoto.textContent = `Foto ${String(selecionada + 1).padStart(2, '0')}`;
    ui.selectedCount.textContent = foto.resultado ? foto.resultado.contagem : '—';
    if (foto.erro) {
      ui.selectedDescription.textContent = `Erro nesta foto: ${foto.erro}`;
    } else if (foto.resultado) {
      ui.selectedDescription.textContent = `Modo usado: ${foto.resultado.modoUsado}. ${foto.resultado.descartados} componentes ignorados pelos critérios de filtragem. Verifique visualmente os retângulos.`;
    } else if (foto.imagem) {
      ui.selectedDescription.textContent = 'Imagem carregada. Execute o processamento para visualizar as etapas.';
    } else {
      ui.selectedDescription.textContent = 'Coloque esta fotografia em img/ ou faça o upload para começar.';
    }
    ETAPAS.forEach(etapa => {
      const el = $('stage' + etapa);
      const src = foto.resultado ? foto.resultado.etapas[etapa] :
        (etapa === 'Original' ? foto.miniatura : null);
      const placeholder = el.parentElement.querySelector('.stage-placeholder');
      if (src) {
        el.src = src;
        el.hidden = false;
        placeholder.hidden = true;
      } else {
        el.hidden = true;
        el.removeAttribute('src');
        placeholder.hidden = false;
      }
    });
  }

  function renderizarResumo() {
    const analisadas = fotos.filter(f => f.resultado);
    ui.summary.hidden = analisadas.length === 0;
    ui.totalDetected.textContent = analisadas.reduce((total, f) => total + f.resultado.contagem, 0);
    ui.totalAnalyzed.textContent = `${analisadas.length} / ${TOTAL_FOTOS}`;
    const verificadas = analisadas.filter(f => f.esperado !== null);
    const corretas = verificadas.filter(f => f.resultado.contagem === f.esperado).length;
    ui.totalCorrect.textContent = verificadas.length ? `${corretas} / ${verificadas.length}` : '—';
  }

  function renderizarTudo() {
    renderizarFotos();
    renderizarDetalhes();
    renderizarResumo();
    atualizarBotao();
  }

  function obterImagemMatriz(imagem) {
    const cv = cvApi;
    const largura = imagem.naturalWidth || imagem.width;
    const altura = imagem.naturalHeight || imagem.height;
    const escala = Math.min(1, MAX_LADO / Math.max(largura, altura));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(largura * escala));
    canvas.height = Math.max(1, Math.round(altura * escala));
    canvas.getContext('2d', { willReadFrequently: true }).drawImage(imagem, 0, 0, canvas.width, canvas.height);
    return cv.imread(canvas);
  }

  function matrizParaURL(mat, tipo = 'image/png') {
    const canvas = document.createElement('canvas');
    cvApi.imshow(canvas, mat);
    return tipo === 'image/jpeg' ? canvas.toDataURL('image/jpeg', 0.84) : canvas.toDataURL('image/png');
  }

  function analisarImagem(imagem, config) {
    const cv = cvApi;
    const recursos = [];
    const guardar = recurso => { recursos.push(recurso); return recurso; };
    try {
      const original = guardar(obterImagemMatriz(imagem));
      const cinza = guardar(new cv.Mat());
      cv.cvtColor(original, cinza, cv.COLOR_RGBA2GRAY);
      const gauss = guardar(new cv.Mat());
      cv.GaussianBlur(cinza, gauss, new cv.Size(5, 5), 0);

      const rgb = guardar(new cv.Mat());
      cv.cvtColor(original, rgb, cv.COLOR_RGBA2RGB);
      const hsv = guardar(new cv.Mat());
      cv.cvtColor(rgb, hsv, cv.COLOR_RGB2HSV);
      const canais = guardar(new cv.MatVector());
      cv.split(hsv, canais);
      const saturacao = guardar(canais.get(1));

      // Mesma configuração em todas as fotos: NÃO usa a quantidade esperada.
      const modoUsado = config.modo;
      const binaria = guardar(new cv.Mat());
      if (modoUsado === 'adaptive') {
        // Média local em uma janela (imagens reais têm sombras diferentes).
        // Janela deve ser ímpar e caber na dimensão menor da imagem.
        let janela = Math.min(config.janela, Math.min(original.rows, original.cols));
        if (janela % 2 === 0) janela -= 1;
        if (janela < 3) throw new Error('Imagem pequena demais para o limiar adaptativo.');
        cv.adaptiveThreshold(gauss, binaria, 255, cv.ADAPTIVE_THRESH_MEAN_C,
          cv.THRESH_BINARY_INV, janela, config.limiar);
      } else if (modoUsado === 'saturation') {
        cv.threshold(saturacao, binaria, 0, 255, cv.THRESH_BINARY | cv.THRESH_OTSU);
      } else {
        cv.threshold(gauss, binaria, 0, 255, cv.THRESH_BINARY_INV | cv.THRESH_OTSU);
      }

      // Limpeza suave: abertura (5x5) e fechamento (7x7).
      const kernelAbertura = guardar(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(5, 5)));
      const kernelFechamento = guardar(cv.getStructuringElement(cv.MORPH_ELLIPSE, new cv.Size(7, 7)));
      const aberta = guardar(new cv.Mat());
      const limpa = guardar(new cv.Mat());
      cv.morphologyEx(binaria, aberta, cv.MORPH_OPEN, kernelAbertura);
      cv.morphologyEx(aberta, limpa, cv.MORPH_CLOSE, kernelFechamento);

      const labels = guardar(new cv.Mat());
      const stats = guardar(new cv.Mat());
      const centroids = guardar(new cv.Mat());
      const totalComponentes = cv.connectedComponentsWithStats(limpa, labels, stats, centroids, 8, cv.CV_32S);
      const areaImagem = original.rows * original.cols;
      const areaMinima = areaImagem * config.areaPercentual / 100;
      const areaMaxima = areaImagem * 0.20;
      const selecionados = [];

      for (let i = 1; i < totalComponentes; i++) { // rótulo 0 = fundo
        const x = stats.intPtr(i, cv.CC_STAT_LEFT)[0];
        const y = stats.intPtr(i, cv.CC_STAT_TOP)[0];
        const w = stats.intPtr(i, cv.CC_STAT_WIDTH)[0];
        const h = stats.intPtr(i, cv.CC_STAT_HEIGHT)[0];
        const area = stats.intPtr(i, cv.CC_STAT_AREA)[0];
        const aspecto = w / Math.max(1, h);
        if (area < areaMinima || area > areaMaxima) continue;
        if (config.arredondado && (aspecto < 0.65 || aspecto > 1.55)) continue;
        selecionados.push({x, y, w, h, area});
      }

      const bordas = guardar(new cv.Mat());
      cv.Canny(gauss, bordas, 50, 150); // Visualização didática; não altera o total.
      const isolada = guardar(new cv.Mat());
      cv.bitwise_and(original, original, isolada, limpa);
      const anotada = guardar(new cv.Mat());
      original.copyTo(anotada);
      selecionados.forEach((componente, indice) => {
        const {x, y, w, h} = componente;
        const verde = new cv.Scalar(12, 210, 82, 255);
        const preto = new cv.Scalar(8, 22, 18, 255);
        cv.rectangle(anotada, new cv.Point(x, y), new cv.Point(x + w, y + h), verde, 3);
        const labelY = Math.max(23, y - 7);
        cv.putText(anotada, String(indice + 1), new cv.Point(x + 4, labelY),
          cv.FONT_HERSHEY_SIMPLEX, 0.85, preto, 5);
        cv.putText(anotada, String(indice + 1), new cv.Point(x + 4, labelY),
          cv.FONT_HERSHEY_SIMPLEX, 0.85, verde, 2);
      });

      return {
        contagem: selecionados.length,
        descartados: Math.max(0, totalComponentes - 1 - selecionados.length),
        modoUsado: modoUsado === 'adaptive' ? 'limiar adaptativo / cinza' : (modoUsado === 'saturation' ? 'HSV / saturação' : 'Otsu global / cinza'),
        etapas: {
          Original: matrizParaURL(original, 'image/jpeg'), Gray: matrizParaURL(cinza),
          Blur: matrizParaURL(gauss, 'image/jpeg'), Saturation: matrizParaURL(saturacao),
          Binary: matrizParaURL(binaria), Clean: matrizParaURL(limpa),
          Canny: matrizParaURL(bordas), Masked: matrizParaURL(isolada), Final: matrizParaURL(anotada, 'image/jpeg')
        }
      };
    } finally {
      // Libera inclusive em caso de exceção: importante no OpenCV.js/WebAssembly.
      for (let i = recursos.length - 1; i >= 0; i--) {
        try { recursos[i].delete(); } catch (_) { /* recurso já liberado */ }
      }
    }
  }

  async function processarFotos() {
    if (processando || !cvApi) return;
    processando = true;
    const config = configuracoes(); // MESMA configuração para todas as fotografias.
    [ui.arquivo, ui.modo, ui.area, ui.formato, ui.janela, ui.limiar].forEach(el => el.disabled = true);
    atualizarBotao();
    let concluidas = 0;
    for (let i = 0; i < fotos.length; i++) {
      const foto = fotos[i];
      if (!foto.imagem) continue;
      ui.runStatus.textContent = `Processando foto ${i + 1} de ${TOTAL_FOTOS}…`;
      await new Promise(resolve => setTimeout(resolve, 30)); // dá tempo de atualizar a tela.
      foto.resultado = null;
      foto.erro = null;
      try {
        foto.resultado = analisarImagem(foto.imagem, config);
        concluidas++;
      } catch (erro) {
        foto.erro = erro && erro.message ? erro.message : String(erro);
        console.error(`Erro ao analisar foto ${i + 1}`, erro);
      }
      selecionada = i;
      renderizarTudo();
    }
    processando = false;
    [ui.arquivo, ui.modo, ui.area, ui.formato, ui.janela, ui.limiar].forEach(el => el.disabled = false);
    ui.runStatus.textContent = `${concluidas} foto(s) analisada(s). Confira os retângulos e compare com as quantidades reais.`;
    renderizarTudo();
  }

  function iniciar() {
    ui.areaValor.textContent = Number(ui.area.value).toFixed(2).replace('.', ',') + '%';
    ui.grid.addEventListener('click', evento => {
      const botao = evento.target.closest('[data-photo]');
      if (!botao) return;
      selecionada = Number(botao.dataset.photo);
      renderizarTudo();
    });
    ui.grid.addEventListener('change', evento => {
      const entrada = evento.target.closest('[data-expected]');
      if (!entrada) return;
      const indice = Number(entrada.dataset.expected);
      const valor = entrada.value.trim();
      fotos[indice].esperado = valor === '' ? null : Math.max(0, Math.floor(Number(valor)));
      renderizarTudo();
    });
    ui.arquivo.addEventListener('change', evento => importarArquivos(evento.target.files));
    [ui.modo, ui.formato].forEach(el => el.addEventListener('change', invalidarResultados));
    ui.janela.addEventListener('input', () => { ui.janelaValor.textContent = ui.janela.value + ' px'; invalidarResultados(); });
    ui.limiar.addEventListener('input', () => { ui.limiarValor.textContent = ui.limiar.value; invalidarResultados(); });
    ui.area.addEventListener('input', () => {
      ui.areaValor.textContent = Number(ui.area.value).toFixed(2).replace('.', ',') + '%';
      invalidarResultados();
    });
    ui.botao.addEventListener('click', processarFotos);
    renderizarTudo();
    esperarOpenCV();
    procurarFotosDaPasta();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
