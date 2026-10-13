# Checkpoint 2 — Contador automático de tampinhas

**FIAP — Applied Computer Vision ·**

## Integrantes do grupo

| Nome completo | RM |
|---|---|
| MATHEUS FARIAS DE LIMA | 554254 |
| MIGUEL MAURICIO PARRADO PATARROYO | 554007 |
| VITOR PINHEIRO NASCIMENTO | 553693 |
| GABRIEL LEÃO | 552642 |
| PEDRO HENRIQUE NARDACI CHAVES | 553988 |

## Como iniciar em Windows

1. **Feche a aba antiga** que travou e interrompa o servidor anterior (`Ctrl+C` no terminal).
2. Extraia todo este ZIP na pasta `C:\Users\miguel\curso\2026\outubro\`.
3. Abra o PowerShell e entre na pasta `Checkpoint2_Tampinhas_FIAP_ESTAVEL`.
4. Execute: `python -m http.server 5501`.
5. Acesse `http://localhost:5501/` (não abra o HTML diretamente via `file://`). Também pode usar **Live Server**.
6. O topo deve dizer **“Processador local pronto — sem espera pelo OpenCV.js”**.
7. Confira `5 / 5 fotos`, mantenha os ajustes padrão, e clique em **Contar as 5 fotos**. O processamento pode levar alguns segundos.
8. Clique em **Ver resultados** para conferir cada foto, as etapas e os retângulos sobre as tampinhas.

## Algoritmo desta versão

1. Canvas `getImageData()` recebe RGBA de uma fotografia redimensionada até 960 px no lado maior.
2. Escala de cinza — média ponderada RGB.
3. Filtro gaussiano separável 5×5 — kernel binomial.
4. Saturação HSV — calculada para demonstração de canais de cor.
5. Binarização adaptativa por média local, 151×151 e C=20 por padrão. Otsu e canal S também estão disponíveis.
6. Morfologia matemática — abertura elíptica 5×5 e fechamento 7×7.
7. Rotulação de componentes conexos com conectividade 8, área, proporção e bounding box.
8. Sobel — bordas demonstrativas; não entram no cálculo de quantidade.
9. Máscara aplicada (AND) e retângulos numerados.

O número **esperado = 5** é usado apenas para comparar as contagens, jamais para determinar os resultados.


## Estrutura

- `index.html` — interface com etapas e equipe.
- `css/style.css` — estilos.
- `js/script.js` — interação, Canvas, exibição e comunicação com o Worker.
- `js/worker.js` — processamento das imagens e contagem em JavaScript puro.
- `js/script-opencv-original.js` — cópia da versão antiga, **não carregada**.
- `img/foto1.jpg` a `img/foto5.jpg` — fotos reais, 5 tampinhas cada.


