// ==========================================================================
// 1. Constantes e estado global
// ==========================================================================
const MESES = [
    { chave: 'jan', label: 'Jan' }, { chave: 'fev', label: 'Fev' }, { chave: 'mar', label: 'Mar' },
    { chave: 'abr', label: 'Abr' }, { chave: 'mai', label: 'Mai' }, { chave: 'jun', label: 'Jun' },
    { chave: 'jul', label: 'Jul' }, { chave: 'ago', label: 'Ago' }, { chave: 'set', label: 'Set' },
    { chave: 'out', label: 'Out' }, { chave: 'nov', label: 'Nov' }, { chave: 'dez', label: 'Dez' }
];
const MESES_LABEL_COMPLETO = {
    jan: 'Janeiro', fev: 'Fevereiro', mar: 'Março', abr: 'Abril', mai: 'Maio', jun: 'Junho',
    jul: 'Julho', ago: 'Agosto', set: 'Setembro', out: 'Outubro', nov: 'Novembro', dez: 'Dezembro'
};

let catalogoModulos = [];
let catalogoInversores = [];
let ultimoCalculo = null;   // guarda o resultado do /api/calcular antes de salvar
let idOrcamentoSelecionado = null;
let orcamentoEditandoId = null;

function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// ==========================================================================
// 2. Navegação entre telas
// ==========================================================================
document.querySelectorAll('.nav-item').forEach(botao => {
    botao.addEventListener('click', () => irParaTela(botao.dataset.tela));
});

function irParaTela(nomeTela) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('nav-ativo', b.dataset.tela === nomeTela));
    document.querySelectorAll('.tela').forEach(t => t.classList.remove('tela-ativa'));
    document.getElementById(`tela-${nomeTela}`).classList.add('tela-ativa');

    if (nomeTela === 'dashboard') carregarDashboard();
    if (nomeTela === 'configuracoes') carregarCatalogos();
}

document.getElementById('botao-novo-orcamento-topo').addEventListener('click', () => { limparFormularioOrcamento(); irParaTela('novo-orcamento'); });
document.getElementById('botao-criar-primeiro').addEventListener('click', () => { limparFormularioOrcamento(); irParaTela('novo-orcamento'); });

// ==========================================================================
// 3. DASHBOARD
// ==========================================================================
async function carregarDashboard() {
    try {
        const [estatisticas, orcamentos] = await Promise.all([
            fetch('/api/orcamentos/estatisticas').then(r => r.json()),
            fetch('/api/orcamentos').then(r => r.json())
        ]);

        document.getElementById('stat-total').textContent = estatisticas.total_orcamentos;
        document.getElementById('stat-valor').textContent = formatarMoeda(estatisticas.valor_total);
        document.getElementById('stat-aceitas').textContent = estatisticas.propostas_aceitas;

        renderizarListaOrcamentos(orcamentos);
    } catch (erro) {
        console.error('❌ Erro ao carregar dashboard:', erro);
    }
}

function renderizarListaOrcamentos(orcamentos) {
    const container = document.getElementById('lista-orcamentos');

    if (orcamentos.length === 0) {
        container.innerHTML = `
            <div class="estado-vazio" id="estado-vazio-orcamentos">
                <div class="estado-vazio-icone">⚡</div>
                <p class="estado-vazio-texto">Nenhum orçamento encontrado</p>
                <button class="link-acao" id="botao-criar-primeiro">Criar primeiro orçamento</button>
            </div>`;
        document.getElementById('botao-criar-primeiro').addEventListener('click', () => { limparFormularioOrcamento(); irParaTela('novo-orcamento'); });
        return;
    }

    container.innerHTML = orcamentos.map(o => `
        <div class="linha-orcamento" data-id="${o.id}">
            <div class="linha-orcamento-principal">
                <span class="linha-orcamento-nome">${o.cliente_nome}</span>
                <span class="linha-orcamento-cidade">${o.cidade_uf}</span>
            </div>
            <div class="linha-orcamento-direita">
                <span class="linha-orcamento-valor">${formatarMoeda(o.valor_total)}</span>
                <span class="selo-status selo-${o.status}">${o.status}</span>
            </div>
        </div>
    `).join('');

    container.querySelectorAll('.linha-orcamento').forEach(linha => {
        linha.addEventListener('click', () => abrirDetalhesOrcamento(linha.dataset.id));
    });
}

let temporizadorBusca = null;
document.getElementById('busca-orcamentos').addEventListener('input', (e) => {
    clearTimeout(temporizadorBusca);
    const termo = e.target.value;
    temporizadorBusca = setTimeout(async () => {
        const resposta = await fetch(`/api/orcamentos?q=${encodeURIComponent(termo)}`);
        renderizarListaOrcamentos(await resposta.json());
    }, 300);
});

// ==========================================================================
// 4. MODAL DE DETALHES DO ORÇAMENTO
// ==========================================================================
const modalDetalhes = document.getElementById('modal-detalhes');

async function abrirDetalhesOrcamento(id) {
    idOrcamentoSelecionado = id;
    const resposta = await fetch(`/api/orcamentos/${id}`);
    if (!resposta.ok) return;
    const dados = await resposta.json();

    document.getElementById('modal-titulo').textContent = dados.orcamento.cliente_nome;
    document.getElementById('modal-status-select').value = dados.orcamento.status;

    document.getElementById('modal-corpo').innerHTML = `
        <div class="modal-linha"><span>Cidade</span><span>${dados.orcamento.cidade_uf}</span></div>
        <div class="modal-linha"><span>Potência do Sistema</span><span>${dados.dimensionamento.potencia_escolhida_kwp} kWp</span></div>
        <div class="modal-linha"><span>Geração Média Mensal</span><span>${dados.dimensionamento.geracao_media_mensal_kwh} kWh</span></div>
        <div class="modal-linha"><span>Valor Total</span><span>${formatarMoeda(dados.financeiro.valor_total)}</span></div>
        <div class="modal-linha"><span>Data de Criação</span><span>${new Date(dados.orcamento.data_criacao).toLocaleDateString('pt-BR')}</span></div>
    `;

    modalDetalhes.classList.add('mostrar');
}

document.getElementById('botao-fechar-detalhes').addEventListener('click', () => modalDetalhes.classList.remove('mostrar'));
modalDetalhes.addEventListener('click', (e) => { if (e.target === modalDetalhes) modalDetalhes.classList.remove('mostrar'); });

document.getElementById('modal-status-select').addEventListener('change', async (e) => {
    await fetch(`/api/orcamentos/${idOrcamentoSelecionado}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: e.target.value })
    });
    carregarDashboard();
});

document.getElementById('modal-botao-pdf').addEventListener('click', () => {
    window.open(`/api/orcamentos/${idOrcamentoSelecionado}/pdf`, '_blank');
});

document.getElementById('modal-botao-editar').addEventListener('click', async () => {
    const resposta = await fetch(`/api/orcamentos/${idOrcamentoSelecionado}`);
    if (!resposta.ok) return;
    const dados = await resposta.json();
    const o = dados.orcamento;

    orcamentoEditandoId = o.id;

    await carregarCatalogosNoFormulario(); // garante que os <select> de módulo/inversor já têm opções

    document.getElementById('campo-cliente-nome').value = o.cliente_nome;
    campoCidade.value = o.cidade_uf;
    document.getElementById('campo-tarifa').value = o.tarifa_kwh;
    document.getElementById('campo-rede').value = o.classificacao_rede || 'Monofásica';
    document.getElementById('campo-consumo-mes').value = o.consumo_jan; // os 12 meses guardam o mesmo valor
    document.getElementById('campo-modulo').value = o.modulo_id || '';
    document.getElementById('campo-modulo-qtd').value = o.modulo_quantidade;
    document.getElementById('campo-inversor').value = o.inversor_id || '';
    document.getElementById('campo-inversor-qtd').value = o.inversor_quantidade;
    document.getElementById('campo-valor-kit').value = o.valor_kit;
    document.getElementById('campo-custos-extra').value = o.custos_extra;
    document.getElementById('campo-lucro').value = (parseFloat(o.lucro_percentual) * 100).toFixed(2);
    document.getElementById('campo-imposto').value = (parseFloat(o.imposto_percentual) * 100).toFixed(2);
    document.getElementById('campo-validade').value = o.validade_dias;

    document.getElementById('previa-resultado').style.display = 'none';
    document.getElementById('mensagem-orcamento').style.display = 'none';

    modalDetalhes.classList.remove('mostrar');
    irParaTela('novo-orcamento');
});

document.getElementById('modal-botao-excluir').addEventListener('click', async () => {
    if (!confirm('Excluir esse orçamento? Essa ação não pode ser desfeita.')) return;
    await fetch(`/api/orcamentos/${idOrcamentoSelecionado}`, { method: 'DELETE' });
    modalDetalhes.classList.remove('mostrar');
    carregarDashboard();
});

// ==========================================================================
// 5. NOVO ORÇAMENTO — mês de referência do consumo
// ==========================================================================
const campoMesReferencia = document.getElementById('campo-mes-referencia');
campoMesReferencia.innerHTML = MESES.map(m => `<option value="${m.chave}">${MESES_LABEL_COMPLETO[m.chave]}</option>`).join('');

// Autocomplete de cidade
const campoCidade = document.getElementById('campo-cidade');
const listaSugestoes = document.getElementById('sugestoes-cidade');
let temporizadorCidade = null;

campoCidade.addEventListener('input', () => {
    clearTimeout(temporizadorCidade);
    const termo = campoCidade.value;
    if (termo.length < 3) { listaSugestoes.classList.remove('mostrar'); return; }

    temporizadorCidade = setTimeout(async () => {
        const resposta = await fetch(`/api/cidades?q=${encodeURIComponent(termo)}`);
        const cidades = await resposta.json();
        if (cidades.length === 0) { listaSugestoes.classList.remove('mostrar'); return; }

        listaSugestoes.innerHTML = cidades.map(c => `<div class="item-sugestao" data-valor="${c.municipio_uf}">${c.municipio_uf}</div>`).join('');
        listaSugestoes.classList.add('mostrar');

        listaSugestoes.querySelectorAll('.item-sugestao').forEach(item => {
            item.addEventListener('click', () => {
                campoCidade.value = item.dataset.valor;
                listaSugestoes.classList.remove('mostrar');
            });
        });
    }, 250);
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.grupo-campo-relativo')) listaSugestoes.classList.remove('mostrar');
});

// Carrega os selects de módulo/inversor a partir do catálogo
async function carregarCatalogosNoFormulario() {
    const [modulos, inversores] = await Promise.all([
        fetch('/api/modulos').then(r => r.json()),
        fetch('/api/inversores').then(r => r.json())
    ]);
    catalogoModulos = modulos;
    catalogoInversores = inversores;

    const selectModulo = document.getElementById('campo-modulo');
    const selectInversor = document.getElementById('campo-inversor');

    selectModulo.innerHTML = modulos.length
        ? modulos.map(m => `<option value="${m.id}">${m.fabricante || ''} ${m.modelo} (${m.potencia_wp}Wp)</option>`).join('')
        : '<option value="">Nenhum módulo cadastrado — vá em Configurações</option>';

    selectInversor.innerHTML = inversores.length
        ? inversores.map(i => `<option value="${i.id}">${i.fabricante || ''} ${i.modelo} (${i.potencia_kw}kW)</option>`).join('')
        : '<option value="">Nenhum inversor cadastrado — vá em Configurações</option>';
}

// ==========================================================================
// 6. CALCULAR (preview, sem salvar)
// ==========================================================================
function coletarDadosDoFormulario() {
    // Só pedimos o consumo de UM mês (o que vai constar no orçamento). Como o motor de
    // cálculo (calculo_solar.py) e o banco ainda trabalham com os 12 meses, replicamos
    // esse mesmo valor pros 12 meses — na prática vira o "consumo médio mensal" usado
    // no dimensionamento e no PDF.
    const mesReferencia = campoMesReferencia.value;
    const consumoMes = parseFloat(document.getElementById('campo-consumo-mes').value) || 0;
    const consumo = {};
    MESES.forEach(m => { consumo[m.chave] = consumoMes; });

    const modulo = catalogoModulos.find(m => m.id == document.getElementById('campo-modulo').value);
    const qtdModulos = parseInt(document.getElementById('campo-modulo-qtd').value) || 0;
    const potenciaSistemaKwp = modulo ? (modulo.potencia_wp * qtdModulos) / 1000 : 0;

    return {
        cliente_nome: document.getElementById('campo-cliente-nome').value.trim(),
        cidade_uf: campoCidade.value.trim(),
        tarifa_kwh: parseFloat(document.getElementById('campo-tarifa').value) || 0,
        classificacao_rede: document.getElementById('campo-rede').value,
        mes_referencia: mesReferencia,
        consumo_mes: consumoMes,
        consumo,
        modulo_id: document.getElementById('campo-modulo').value || null,
        modulo_quantidade: qtdModulos,
        inversor_id: document.getElementById('campo-inversor').value || null,
        inversor_quantidade: parseInt(document.getElementById('campo-inversor-qtd').value) || 1,
        potencia_sistema_kwp: potenciaSistemaKwp,
        valor_kit: parseFloat(document.getElementById('campo-valor-kit').value) || 0,
        custos_extra: parseFloat(document.getElementById('campo-custos-extra').value) || 0,
        lucro_percentual: (parseFloat(document.getElementById('campo-lucro').value) || 0) / 100,
        imposto_percentual: (parseFloat(document.getElementById('campo-imposto').value) || 0) / 100,
        validade_dias: parseInt(document.getElementById('campo-validade').value) || 7
    };
}

document.getElementById('botao-calcular').addEventListener('click', async () => {
    const mensagem = document.getElementById('mensagem-orcamento');
    mensagem.style.display = 'none';
    const dados = coletarDadosDoFormulario();

    if (!dados.cliente_nome || !dados.cidade_uf || !dados.valor_kit) {
        mensagem.textContent = '❌ Preencha ao menos nome do cliente, cidade e valor do kit.';
        mensagem.className = 'mensagem-feedback erro';
        mensagem.style.display = 'block';
        return;
    }
    if (!dados.consumo_mes) {
        mensagem.textContent = '❌ Informe o consumo (kWh) do mês de referência.';
        mensagem.className = 'mensagem-feedback erro';
        mensagem.style.display = 'block';
        return;
    }

    try {
        const resposta = await fetch('/api/calcular', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(dados)
        });
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.erro || 'Falha ao calcular');

        ultimoCalculo = { dadosFormulario: dados, resultado };
        exibirPreviaResultado(dados, resultado);
        document.getElementById('previa-resultado').scrollIntoView({ behavior: 'smooth', block: 'start' });
    } catch (erro) {
        mensagem.textContent = `❌ ${erro.message}`;
        mensagem.className = 'mensagem-feedback erro';
        mensagem.style.display = 'block';
    }
});

function exibirPreviaResultado(dados, resultado) {
    const { dimensionamento, financeiro } = resultado;

    const modulo = catalogoModulos.find(m => m.id == dados.modulo_id);
    const inversor = catalogoInversores.find(i => i.id == dados.inversor_id);
    const nomeModulo = modulo ? `${modulo.fabricante || ''} ${modulo.modelo} (${modulo.potencia_wp}Wp)`.trim() : '—';
    const nomeInversor = inversor ? `${inversor.fabricante || ''} ${inversor.modelo} (${inversor.potencia_kw}kW)`.trim() : '—';

    // --- Bloco: Cliente e Consumo ---
    document.getElementById('relatorio-cliente').innerHTML = `
        <div class="linha-relatorio"><span>Cliente</span><span>${dados.cliente_nome}</span></div>
        <div class="linha-relatorio"><span>Cidade</span><span>${dados.cidade_uf}</span></div>
        <div class="linha-relatorio"><span>Classificação de Rede</span><span>${dados.classificacao_rede}</span></div>
        <div class="linha-relatorio"><span>Valor do kWh</span><span>${formatarMoeda(dados.tarifa_kwh)}</span></div>
        <div class="linha-relatorio"><span>Consumo Informado (${MESES_LABEL_COMPLETO[dados.mes_referencia]})</span><span>${dados.consumo_mes} kWh</span></div>
    `;

    // --- Bloco: Equipamentos ---
    document.getElementById('relatorio-equipamentos').innerHTML = `
        <div class="linha-relatorio"><span>Módulo Fotovoltaico</span><span>${nomeModulo} × ${dados.modulo_quantidade}</span></div>
        <div class="linha-relatorio"><span>Inversor</span><span>${nomeInversor} × ${dados.inversor_quantidade}</span></div>
        <div class="linha-relatorio"><span>Potência do Sistema</span><span>${dimensionamento.potencia_escolhida_kwp} kWp</span></div>
    `;

    // --- Bloco: Financeiro ---
    document.getElementById('relatorio-financeiro').innerHTML = `
        <div class="linha-relatorio"><span>Valor do Kit</span><span>${formatarMoeda(dados.valor_kit)}</span></div>
        <div class="linha-relatorio"><span>Custos Extras</span><span>${formatarMoeda(dados.custos_extra)}</span></div>
        <div class="linha-relatorio"><span>Margem de Lucro</span><span>${(dados.lucro_percentual * 100).toFixed(1)}%</span></div>
        <div class="linha-relatorio"><span>Imposto sobre o Lucro</span><span>${(dados.imposto_percentual * 100).toFixed(1)}%</span></div>
        <div class="linha-relatorio"><span>Validade da Proposta</span><span>${dados.validade_dias} dias</span></div>
    `;

    // --- Resultado do dimensionamento ---
    document.getElementById('grade-resultado').innerHTML = `
        <div class="item-resultado"><span class="item-resultado-label">Potência do Sistema</span><span class="item-resultado-valor">${dimensionamento.potencia_escolhida_kwp} kWp</span></div>
        <div class="item-resultado"><span class="item-resultado-label">Geração Média Mensal</span><span class="item-resultado-valor">${dimensionamento.geracao_media_mensal_kwh} kWh</span></div>
        <div class="item-resultado"><span class="item-resultado-label">Valor Total</span><span class="item-resultado-valor">${formatarMoeda(financeiro.valor_total)}</span></div>
    `;

    const tabelaGeracao = document.getElementById('tabela-geracao-mensal');
    tabelaGeracao.innerHTML = `
        <tr><th>Mês</th><th>Geração Estimada (kWh)</th></tr>
        ${MESES.map(m => `<tr><td>${MESES_LABEL_COMPLETO[m.chave]}</td><td>${dimensionamento.geracao_mensal_kwh[m.chave]}</td></tr>`).join('')}
    `;

    document.getElementById('previa-resultado').style.display = 'block';
}

document.getElementById('botao-editar-orcamento').addEventListener('click', () => {
    document.getElementById('previa-resultado').style.display = 'none';
    document.getElementById('campo-cliente-nome').scrollIntoView({ behavior: 'smooth', block: 'start' });
});

// ==========================================================================
// 7. SALVAR ORÇAMENTO (só acontece depois de confirmar o relatório acima)
// ==========================================================================
document.getElementById('botao-salvar-orcamento').addEventListener('click', async () => {
    if (!ultimoCalculo) return;
    const mensagem = document.getElementById('mensagem-orcamento');
    const editando = orcamentoEditandoId !== null;

    try {
        const resposta = await fetch(editando ? `/api/orcamentos/${orcamentoEditandoId}` : '/api/orcamentos', {
            method: editando ? 'PUT' : 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ultimoCalculo.dadosFormulario)
        });
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.erro || 'Falha ao salvar');

        mensagem.textContent = editando
            ? '✅ Orçamento atualizado com sucesso!'
            : '✅ Orçamento salvo! Você já pode baixar o PDF pelo Dashboard.';
        mensagem.className = 'mensagem-feedback sucesso';
        mensagem.style.display = 'block';

        setTimeout(() => {
            limparFormularioOrcamento();
            irParaTela('dashboard');
        }, 1200);
    } catch (erro) {
        mensagem.textContent = `❌ ${erro.message}`;
        mensagem.className = 'mensagem-feedback erro';
        mensagem.style.display = 'block';
    }
});

function limparFormularioOrcamento() {
    document.getElementById('campo-cliente-nome').value = '';
    campoCidade.value = '';
    document.getElementById('campo-tarifa').value = '';
    campoMesReferencia.selectedIndex = 0;
    document.getElementById('campo-consumo-mes').value = '';
    document.getElementById('campo-valor-kit').value = '';
    document.getElementById('campo-custos-extra').value = '0';
    document.getElementById('campo-lucro').value = '';
    document.getElementById('campo-imposto').value = '0';
    document.getElementById('previa-resultado').style.display = 'none';
    document.getElementById('mensagem-orcamento').style.display = 'none';
    ultimoCalculo = null;
    orcamentoEditandoId = null;
}

// ==========================================================================
// 8. CONFIGURAÇÕES — catálogo de módulos e inversores
// ==========================================================================
async function carregarCatalogos() {
    await carregarCatalogosNoFormulario(); // reaproveita a busca, já popula catalogoModulos/Inversores
    renderizarCatalogo('modulos');
    renderizarCatalogo('inversores');
}

function renderizarCatalogo(tipo) {
    const lista = tipo === 'modulos' ? catalogoModulos : catalogoInversores;
    const container = document.getElementById(`lista-${tipo}`);

    if (lista.length === 0) {
        container.innerHTML = `<p style="color:var(--cor-texto-secundario); font-size:13.5px;">Nenhum ${tipo === 'modulos' ? 'módulo' : 'inversor'} cadastrado ainda.</p>`;
        return;
    }

    container.innerHTML = lista.map(item => {
        const descricao = tipo === 'modulos'
            ? `<strong>${item.fabricante || ''} ${item.modelo}</strong> — ${item.potencia_wp} Wp`
            : `<strong>${item.fabricante || ''} ${item.modelo}</strong> — ${item.potencia_kw} kW`;
        return `
            <div class="item-catalogo">
                <span class="item-catalogo-texto">${descricao}</span>
                <button class="botao-remover-item" data-id="${item.id}" data-tipo="${tipo}">✕</button>
            </div>`;
    }).join('');

    container.querySelectorAll('.botao-remover-item').forEach(botao => {
        botao.addEventListener('click', async () => {
            await fetch(`/api/${botao.dataset.tipo}/${botao.dataset.id}`, { method: 'DELETE' });
            carregarCatalogos();
        });
    });
}

document.getElementById('botao-add-modulo').addEventListener('click', async () => {
    const dados = {
        fabricante: document.getElementById('modulo-fabricante').value.trim(),
        modelo: document.getElementById('modulo-modelo').value.trim(),
        potencia_wp: parseInt(document.getElementById('modulo-potencia').value),
        garantia_defeito_anos: parseInt(document.getElementById('modulo-garantia-defeito').value) || null,
        garantia_eficiencia_anos: parseInt(document.getElementById('modulo-garantia-eficiencia').value) || null,
        peso_kg: parseFloat(document.getElementById('modulo-peso').value) || null
    };
    if (!dados.modelo || !dados.potencia_wp) { alert('Preencha ao menos o modelo e a potência.'); return; }

    try {
        const resposta = await fetch('/api/modulos', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
        });
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.erro || 'Falha ao cadastrar módulo');

        ['modulo-fabricante', 'modulo-modelo', 'modulo-potencia', 'modulo-peso'].forEach(id => document.getElementById(id).value = '');
        carregarCatalogos();
    } catch (erro) {
        alert(`❌ Não foi possível cadastrar o módulo: ${erro.message}`);
        console.error(erro);
    }
});

document.getElementById('botao-add-inversor').addEventListener('click', async () => {
    const dados = {
        fabricante: document.getElementById('inversor-fabricante').value.trim(),
        modelo: document.getElementById('inversor-modelo').value.trim(),
        potencia_kw: parseFloat(document.getElementById('inversor-potencia').value),
        garantia_anos: parseInt(document.getElementById('inversor-garantia').value) || null,
        monitoramento: document.getElementById('inversor-monitoramento').value.trim() || null
    };
    if (!dados.modelo || !dados.potencia_kw) { alert('Preencha ao menos o modelo e a potência.'); return; }

    try {
        const resposta = await fetch('/api/inversores', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
        });
        const resultado = await resposta.json();
        if (!resposta.ok) throw new Error(resultado.erro || 'Falha ao cadastrar inversor');

        ['inversor-fabricante', 'inversor-modelo', 'inversor-potencia', 'inversor-monitoramento'].forEach(id => document.getElementById(id).value = '');
        carregarCatalogos();
    } catch (erro) {
        alert(`❌ Não foi possível cadastrar o inversor: ${erro.message}`);
        console.error(erro);
    }
});

// ==========================================================================
// 9. Inicialização
// ==========================================================================
carregarDashboard();
carregarCatalogosNoFormulario();