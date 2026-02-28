// ============================================================
//  Darwin + Nuvemshop — Google Sheets Script
// ============================================================
//
//  COMO USAR:
//  1. Abra sua planilha no Google Sheets
//  2. Menu: Extensões > Apps Script
//  3. Apague o conteúdo e cole TUDO deste arquivo
//  4. Clique em Salvar
//  5. Volte pra planilha e recarregue a página (F5)
//  6. Um menu "Darwin" vai aparecer no topo da planilha
//  7. Clique em "Darwin > Atualizar Dados" na primeira vez
//     (vai pedir permissão — aceite)
//
//  Depois disso, os dados atualizam sozinhos toda vez que
//  a planilha é aberta.
// ============================================================

// ====== CONFIGURACAO ======
var API_KEY = 'darwin_b2de65c0d53c4f3ee4ac654d63d47f3d8e8bb6b7919a24ec0b91c80ce93631fa';
var BASE_URL = 'https://api.getdarwin.ai';
var CHANNEL_ID = '13386';
var NOME_ABA = 'Darwin API';
// ===========================

/**
 * Cria o menu "Darwin" quando a planilha é aberta
 * e atualiza os dados automaticamente.
 */
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('Darwin')
    .addItem('Atualizar Dados', 'atualizarTudo')
    .addToUi();

  atualizarTudo();
}

/**
 * Chama a API do Darwin
 */
function chamarApi(endpoint) {
  var options = {
    method: 'get',
    headers: { 'X-API-KEY': API_KEY },
    muteHttpExceptions: true
  };

  var response = UrlFetchApp.fetch(BASE_URL + endpoint, options);
  var code = response.getResponseCode();

  if (code !== 200) {
    return { erro: 'HTTP ' + code + ': ' + response.getContentText().substring(0, 200) };
  }

  return JSON.parse(response.getContentText());
}

/**
 * Busca todos os dados e popula a aba
 */
function atualizarTudo() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(NOME_ABA);

  if (!aba) {
    aba = ss.insertSheet(NOME_ABA);
  }

  // Limpa tudo
  aba.clear();

  var linha = 1;

  // --- Header geral ---
  aba.getRange(linha, 1).setValue('Darwin + Nuvemshop — Dados da API');
  aba.getRange(linha, 1).setFontSize(14).setFontWeight('bold');
  linha++;
  aba.getRange(linha, 1).setValue('Atualizado em: ' + new Date().toLocaleString('pt-BR'));
  aba.getRange(linha, 1).setFontColor('#888888');
  linha += 2;

  // --- Channels ---
  linha = escreverSecao(aba, linha, 'CHANNELS', '/v1/channels');

  // --- Pipelines ---
  linha = escreverSecao(aba, linha, 'PIPELINES', '/v1/pipelines');

  // --- Smart Fields ---
  linha = escreverSecao(aba, linha, 'SMART FIELDS', '/v1/agent/smart-fields');

  // --- Templates ---
  linha = escreverSecao(aba, linha, 'TEMPLATES', '/v1/channel/' + CHANNEL_ID + '/templates');

  // --- Source Parameters ---
  linha = escreverSecao(aba, linha, 'SOURCE PARAMETERS', '/v1/agent/source-parameters');

  // --- Webhooks ---
  linha = escreverSecao(aba, linha, 'WEBHOOKS', '/v1/webhook');

  // Auto-resize columns
  var ultimaColuna = aba.getLastColumn();
  if (ultimaColuna > 0) {
    for (var c = 1; c <= ultimaColuna; c++) {
      aba.autoResizeColumn(c);
    }
  }

  SpreadsheetApp.flush();
}

/**
 * Escreve uma seção (título + tabela) na aba
 * Retorna a próxima linha livre
 */
function escreverSecao(aba, linhaInicial, titulo, endpoint) {
  var linha = linhaInicial;

  // Título da seção
  aba.getRange(linha, 1).setValue(titulo);
  aba.getRange(linha, 1).setFontSize(11).setFontWeight('bold').setBackground('#1a1a2e').setFontColor('#ffffff');
  linha++;

  // Chama a API
  var dados = chamarApi(endpoint);

  // Erro
  if (dados && dados.erro) {
    aba.getRange(linha, 1).setValue('Erro: ' + dados.erro);
    aba.getRange(linha, 1).setFontColor('#dc2626');
    linha += 2;
    return linha;
  }

  // Normaliza pra array
  if (!Array.isArray(dados)) {
    if (dados && typeof dados === 'object') {
      dados = [dados];
    } else {
      aba.getRange(linha, 1).setValue('Nenhum dado');
      aba.getRange(linha, 1).setFontColor('#888888');
      linha += 2;
      return linha;
    }
  }

  if (dados.length === 0) {
    aba.getRange(linha, 1).setValue('Nenhum dado');
    aba.getRange(linha, 1).setFontColor('#888888');
    linha += 2;
    return linha;
  }

  // Descobre colunas (todas as chaves de todos os objetos)
  var colunasSet = {};
  for (var i = 0; i < dados.length; i++) {
    var keys = Object.keys(dados[i]);
    for (var k = 0; k < keys.length; k++) {
      colunasSet[keys[k]] = true;
    }
  }
  var colunas = Object.keys(colunasSet);

  // Escreve header da tabela
  for (var c = 0; c < colunas.length; c++) {
    var celula = aba.getRange(linha, c + 1);
    celula.setValue(colunas[c]);
    celula.setFontWeight('bold').setBackground('#f3f4f6').setFontSize(10);
  }
  linha++;

  // Escreve dados
  for (var i = 0; i < dados.length; i++) {
    for (var c = 0; c < colunas.length; c++) {
      var val = dados[i][colunas[c]];

      if (val === null || val === undefined) {
        val = '';
      } else if (typeof val === 'object') {
        val = JSON.stringify(val);
      } else if (typeof val === 'boolean') {
        val = val ? 'Sim' : 'Não';
      }

      aba.getRange(linha, c + 1).setValue(val);
    }
    linha++;
  }

  // Linha em branco entre seções
  linha++;
  return linha;
}
