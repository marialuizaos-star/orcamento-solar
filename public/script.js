// ==========================================================================
// 💰 MÁSCARA DE VALOR EM REAIS
// ==========================================================================
function aplicarMascaraMoeda(valorBruto) {
    const digitos = valorBruto.replace(/\D/g, '');
    if (!digitos) return '';
    const numero = parseInt(digitos, 10) / 100;
    return numero.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function valorMascaradoParaNumero(valorMascarado) {
    const digitos = (valorMascarado || '').replace(/\D/g, '');
    return digitos ? parseInt(digitos, 10) / 100 : 0;
}

function aplicarMascaraCpf(valorBruto) {
    const digitos = valorBruto.replace(/\D/g, '').slice(0, 11);
    return digitos
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d)/, '$1.$2')
        .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
}

function aplicarMascaraCep(valorBruto) {
    const digitos = valorBruto.replace(/\D/g, '').slice(0, 8);
    return digitos.replace(/(\d{5})(\d)/, '$1-$2');
}

function aplicarMascaraTarifa(valorBruto) {
    const digitos = valorBruto.replace(/\D/g, '');
    if (!digitos) return '';
    const numero = parseInt(digitos, 10) / 1000;
    return 'R$ ' + numero.toLocaleString('pt-BR', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
}

function valorTarifaParaNumero(valorMascarado) {
    const digitos = (valorMascarado || '').replace(/\D/g, '');
    return digitos ? parseInt(digitos, 10) / 1000 : 0;
}

function configurarMascarasDeMoeda() {
    document.querySelectorAll('.campo-mascara-moeda').forEach(campo => {
        campo.addEventListener('input', () => {
            campo.value = aplicarMascaraMoeda(campo.value);
        });
    });
    document.querySelectorAll('.campo-mascara-tarifa').forEach(campo => {
        campo.addEventListener('input', () => {
            campo.value = aplicarMascaraTarifa(campo.value);
        });
    });
    document.querySelectorAll('.campo-mascara-cpf').forEach(campo => {
        campo.addEventListener('input', () => {
            campo.value = aplicarMascaraCpf(campo.value);
        });
    });
    document.querySelectorAll('.campo-mascara-cep').forEach(campo => {
        campo.addEventListener('input', () => {
            campo.value = aplicarMascaraCep(campo.value);
        });
    });
}

// ==========================================================================
// 🔒 VALIDAÇÃO DE CAMPOS NUMÉRICOS
// ==========================================================================
const REGRAS_NUMERICAS = {
    'campo-consumo-mes': { min: 1, max: 1000000, inteiro: false, nome: 'Consumo do Mês' },
    'campo-lucro': { min: 0, max: 500, inteiro: false, nome: 'Margem de Lucro' },
    'campo-imposto': { min: 0, max: 100, inteiro: false, nome: 'Imposto sobre o Lucro' },
    'campo-validade': { min: 1, max: 365, inteiro: true, nome: 'Validade da Proposta' }
};

function configurarValidacaoNumerica() {
    Object.keys(REGRAS_NUMERICAS).forEach(id => {
        const campo = document.getElementById(id);
        if (!campo) return;
        campo.addEventListener('keydown', (e) => {
            if (['-', '+', 'e', 'E'].includes(e.key)) e.preventDefault();
            if (REGRAS_NUMERICAS[id].inteiro && e.key === '.') e.preventDefault();
        });
        campo.addEventListener('input', () => {
            campo.value = REGRAS_NUMERICAS[id].inteiro
                ? campo.value.replace(/[^0-9]/g, '')
                : campo.value.replace(/[^0-9.]/g, '').replace(/(\..*)\./g, '$1');
        });
    });
}

function validarCamposNumericos() {
    for (const id of Object.keys(REGRAS_NUMERICAS)) {
        const regra = REGRAS_NUMERICAS[id];
        const valor = parseFloat(document.getElementById(id).value);
        if (isNaN(valor)) continue;
        if (valor < regra.min || valor > regra.max) {
            return `${regra.nome} deve estar entre ${regra.min} e ${regra.max}.`;
        }
        if (regra.inteiro && !Number.isInteger(valor)) {
            return `${regra.nome} deve ser um número inteiro.`;
        }
    }
    return null;
}

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
let catalogoVendedores = [];
let ultimoCalculo = null;
let idOrcamentoSelecionado = null;
let orcamentoEditandoId = null;

function formatarMoeda(valor) {
    return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

async function tratarRespostaApi(resposta) {
    const contentType = resposta.headers.get('content-type');
    let dados = null;

    if (contentType && contentType.includes('application/json')) {
        dados = await resposta.json();
    } else {
        const textoHtml = await resposta.text();
        console.error('Resposta não-JSON recebida:', textoHtml);
        throw new Error(`Erro ${resposta.status} (${resposta.statusText || 'Falha no servidor'}). Verifique os logs.`);
    }

    if (!resposta.ok) {
        throw new Error(dados?.erro || dados?.message || `Erro ${resposta.status}`);
    }

    return dados;
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

document.getElementById('botao-voltar-novo-orcamento').addEventListener('click', () => {
    limparFormularioOrcamento();
    irParaTela('dashboard');
});

document.getElementById('botao-novo-orcamento-topo').addEventListener('click', () => { limparFormularioOrcamento(); irParaTela('novo-orcamento'); });
document.getElementById('botao-criar-primeiro').addEventListener('click', () => { limparFormularioOrcamento(); irParaTela('novo-orcamento'); });

// ==========================================================================
// 3. DASHBOARD
// ==========================================================================
async function carregarDashboard() {
    try {
        const [estatisticas, orcamentos] = await Promise.all([
            fetch('/api/orcamentos/estatisticas').then(tratarRespostaApi),
            fetch('/api/orcamentos').then(tratarRespostaApi)
        ]);

        document.getElementById('stat-total').textContent = estatisticas.total_orcamentos || 0;
        document.getElementById('stat-valor').textContent = formatarMoeda(estatisticas.valor_total || 0);
        document.getElementById('stat-aceitas').textContent = estatisticas.propostas_aceitas || 0;

        renderizarListaOrcamentos(orcamentos);
    } catch (erro) {
        console.error('❌ Erro ao carregar dashboard:', erro);
    }
}

function renderizarListaOrcamentos(orcamentos) {
    const container = document.getElementById('lista-orcamentos');

    if (!orcamentos || orcamentos.length === 0) {
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
        try {
            const resposta = await fetch(`/api/orcamentos?q=${encodeURIComponent(termo)}`);
            const dados = await tratarRespostaApi(resposta);
            renderizarListaOrcamentos(dados);
        } catch (erro) {
            console.error('Erro na busca:', erro);
        }
    }, 300);
});

// ==========================================================================
// 4. MODAL DE DETALHES DO ORÇAMENTO
// ==========================================================================
const modalDetalhes = document.getElementById('modal-detalhes');

async function abrirDetalhesOrcamento(id) {
    try {
        idOrcamentoSelecionado = id;
        const resposta = await fetch(`/api/orcamentos/${id}`);
        const dados = await tratarRespostaApi(resposta);

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
    } catch (erro) {
        alert(`❌ Não foi possível carregar o orçamento: ${erro.message}`);
    }
}

document.getElementById('botao-fechar-detalhes').addEventListener('click', () => modalDetalhes.classList.remove('mostrar'));
modalDetalhes.addEventListener('click', (e) => { if (e.target === modalDetalhes) modalDetalhes.classList.remove('mostrar'); });

document.getElementById('modal-status-select').addEventListener('change', async (e) => {
    try {
        const resposta = await fetch(`/api/orcamentos/${idOrcamentoSelecionado}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: e.target.value })
        });
        await tratarRespostaApi(resposta);
        carregarDashboard();
    } catch (erro) {
        alert(`❌ Erro ao atualizar status: ${erro.message}`);
    }
});

document.getElementById('modal-botao-pdf').addEventListener('click', () => {
    window.open(`/api/orcamentos/${idOrcamentoSelecionado}/pdf`, '_blank');
});

document.getElementById('modal-botao-editar').addEventListener('click', async () => {
    try {
        const resposta = await fetch(`/api/orcamentos/${idOrcamentoSelecionado}`);
        const dados = await tratarRespostaApi(resposta);
        const o = dados.orcamento;

        orcamentoEditandoId = o.id;

        await carregarCatalogosNoFormulario();

        document.getElementById('campo-cliente-nome').value = o.cliente_nome;
        document.getElementById('campo-cliente-cpf').value = o.cliente_cpf || '';
        document.getElementById('campo-cliente-cep').value = o.cliente_cep || '';
        document.getElementById('campo-cliente-bairro').value = o.cliente_bairro || '';
        document.getElementById('campo-cliente-rua').value = o.cliente_rua || '';
        document.getElementById('campo-cliente-numero').value = o.cliente_numero || '';
        document.getElementById('campo-vendedor').value = o.vendedor_id || '';
        campoCidade.value = o.cidade_uf;
        document.getElementById('campo-tarifa').value = aplicarMascaraTarifa(String(Math.round(o.tarifa_kwh * 1000)));
        document.getElementById('campo-rede').value = o.classificacao_rede || 'Monofásica';
        document.getElementById('campo-consumo-mes').value = o.consumo_jan;
        document.getElementById('campo-modulo').value = o.modulo_id || '';
        document.getElementById('campo-modulo-qtd').value = o.modulo_quantidade;
        document.getElementById('campo-inversor').value = o.inversor_id || '';
        document.getElementById('campo-inversor-qtd').value = o.inversor_quantidade;
        document.getElementById('campo-valor-kit').value = aplicarMascaraMoeda(String(Math.round(o.valor_kit * 100)));
        document.getElementById('campo-custos-extra').value = aplicarMascaraMoeda(String(Math.round(o.custos_extra * 100)));
        document.getElementById('campo-lucro').value = (parseFloat(o.lucro_percentual) * 100).toFixed(2);
        document.getElementById('campo-imposto').value = (parseFloat(o.imposto_percentual) * 100).toFixed(2);
        document.getElementById('campo-validade').value = o.validade_dias;

        document.getElementById('previa-resultado').style.display = 'none';
        document.getElementById('mensagem-orcamento').style.display = 'none';

        modalDetalhes.classList.remove('mostrar');
        irParaTela('novo-orcamento');
    } catch (erro) {
        alert(`❌ Não foi possível carregar para edição: ${erro.message}`);
    }
});

document.getElementById('modal-botao-excluir').addEventListener('click', async () => {
    if (!confirm('Excluir esse orçamento? Essa ação não pode ser desfeita.')) return;
    try {
        const resposta = await fetch(`/api/orcamentos/${idOrcamentoSelecionado}`, { method: 'DELETE' });
        await tratarRespostaApi(resposta);
        modalDetalhes.classList.remove('mostrar');
        carregarDashboard();
    } catch (erro) {
        alert(`❌ Erro ao excluir: ${erro.message}`);
    }
});

// ==========================================================================
// 5. NOVO ORÇAMENTO
// ==========================================================================
const campoMesReferencia = document.getElementById('campo-mes-referencia');
campoMesReferencia.innerHTML = MESES.map(m => `<option value="${m.chave}">${MESES_LABEL_COMPLETO[m.chave]}</option>`).join('');

const campoCidade = document.getElementById('campo-cidade');
const listaSugestoes = document.getElementById('sugestoes-cidade');
let temporizadorCidade = null;

campoCidade.addEventListener('input', () => {
    clearTimeout(temporizadorCidade);
    const termo = campoCidade.value;
    if (termo.length < 3) { listaSugestoes.classList.remove('mostrar'); return; }

    temporizadorCidade = setTimeout(async () => {
        try {
            const resposta = await fetch(`/api/cidades?q=${encodeURIComponent(termo)}`);
            const cidades = await tratarRespostaApi(resposta);
            if (cidades.length === 0) { listaSugestoes.classList.remove('mostrar'); return; }

            listaSugestoes.innerHTML = cidades.map(c => `<div class="item-sugestao" data-valor="${c.municipio_uf}">${c.municipio_uf}</div>`).join('');
            listaSugestoes.classList.add('mostrar');

            listaSugestoes.querySelectorAll('.item-sugestao').forEach(item => {
                item.addEventListener('click', () => {
                    campoCidade.value = item.dataset.valor;
                    listaSugestoes.classList.remove('mostrar');
                });
            });
        } catch (erro) {
            console.error('Erro ao buscar cidades:', erro);
        }
    }, 250);
});

document.addEventListener('click', (e) => {
    if (!e.target.closest('.grupo-campo-relativo')) listaSugestoes.classList.remove('mostrar');
});

async function carregarCatalogosNoFormulario() {
    try {
        const [modulos, inversores, vendedores] = await Promise.all([
            fetch('/api/modulos').then(tratarRespostaApi),
            fetch('/api/inversores').then(tratarRespostaApi),
            fetch('/api/vendedores').then(tratarRespostaApi)
        ]);
        catalogoModulos = modulos;
        catalogoInversores = inversores;
        catalogoVendedores = vendedores;

        const selectModulo = document.getElementById('campo-modulo');
        const selectInversor = document.getElementById('campo-inversor');
        const selectVendedor = document.getElementById('campo-vendedor');

        selectModulo.innerHTML = modulos.length
            ? modulos.map(m => `<option value="${m.id}">${m.fabricante || ''} ${m.modelo} (${m.potencia_wp}Wp)</option>`).join('')
            : '<option value="">Nenhum módulo cadastrado — vá em Configurações</option>';

        selectInversor.innerHTML = inversores.length
            ? inversores.map(i => `<option value="${i.id}">${i.fabricante || ''} ${i.modelo} (${i.potencia_kw}kW)</option>`).join('')
            : '<option value="">Nenhum inversor cadastrado — vá em Configurações</option>';

        selectVendedor.innerHTML = vendedores.length
            ? vendedores.map(v => `<option value="${v.id}">${v.nome}${v.cargo ? ' — ' + v.cargo : ''}</option>`).join('')
            : '<option value="">Nenhum vendedor cadastrado — vá em Configurações</option>';
    } catch (erro) {
        console.error('Erro ao carregar catálogos:', erro);
    }
}

// ==========================================================================
// 6. CALCULAR
// ==========================================================================
function coletarDadosDoFormulario() {
    const mesReferencia = campoMesReferencia.value;
    const consumoMes = parseFloat(document.getElementById('campo-consumo-mes').value) || 0;
    const consumo = {};
    MESES.forEach(m => { consumo[m.chave] = consumoMes; });

    const modulo = catalogoModulos.find(m => m.id == document.getElementById('campo-modulo').value);
    const qtdModulos = parseInt(document.getElementById('campo-modulo-qtd').value) || 0;
    const potenciaSistemaKwp = modulo ? (modulo.potencia_wp * qtdModulos) / 1000 : 0;

    return {
        cliente_nome: document.getElementById('campo-cliente-nome').value.trim(),
        cliente_cpf: document.getElementById('campo-cliente-cpf').value.trim(),
        cliente_cep: document.getElementById('campo-cliente-cep').value.trim(),
        cliente_bairro: document.getElementById('campo-cliente-bairro').value.trim(),
        cliente_rua: document.getElementById('campo-cliente-rua').value.trim(),
        cliente_numero: document.getElementById('campo-cliente-numero').value.trim(),
        responsavel_nome: (catalogoVendedores.find(v => v.id == document.getElementById('campo-vendedor').value) || {}).nome || null,
        responsavel_cargo: (catalogoVendedores.find(v => v.id == document.getElementById('campo-vendedor').value) || {}).cargo || null,
        vendedor_id: document.getElementById('campo-vendedor').value || null,
        cidade_uf: campoCidade.value.trim(),
        tarifa_kwh: valorTarifaParaNumero(document.getElementById('campo-tarifa').value),
        classificacao_rede: document.getElementById('campo-rede').value,
        mes_referencia: mesReferencia,
        consumo_mes: consumoMes,
        consumo,
        modulo_id: document.getElementById('campo-modulo').value || null,
        modulo_quantidade: qtdModulos,
        inversor_id: document.getElementById('campo-inversor').value || null,
        inversor_quantidade: parseInt(document.getElementById('campo-inversor-qtd').value) || 1,
        potencia_sistema_kwp: potenciaSistemaKwp,
        valor_kit: valorMascaradoParaNumero(document.getElementById('campo-valor-kit').value),
        custos_extra: valorMascaradoParaNumero(document.getElementById('campo-custos-extra').value),
        lucro_percentual: (parseFloat(document.getElementById('campo-lucro').value) || 0) / 100,
        imposto_percentual: (parseFloat(document.getElementById('campo-imposto').value) || 0) / 100,
        validade_dias: parseInt(document.getElementById('campo-validade').value) || 7
    };
}

document.getElementById('botao-calcular').addEventListener('click', async () => {
    const mensagem = document.getElementById('mensagem-orcamento');
    mensagem.style.display = 'none';
    const dados = coletarDadosDoFormulario();

    const erroNumerico = validarCamposNumericos();
    if (erroNumerico) {
        mensagem.textContent = `❌ ${erroNumerico}`;
        mensagem.className = 'mensagem-feedback erro';
        mensagem.style.display = 'block';
        return;
    }

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
        const resultado = await tratarRespostaApi(resposta);

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

    document.getElementById('relatorio-cliente').innerHTML = `
        <div class="linha-relatorio"><span>Cliente</span><span>${dados.cliente_nome}</span></div>
        <div class="linha-relatorio"><span>Cidade</span><span>${dados.cidade_uf}</span></div>
        <div class="linha-relatorio"><span>Classificação de Rede</span><span>${dados.classificacao_rede}</span></div>
        <div class="linha-relatorio"><span>Valor do kWh</span><span>${formatarMoeda(dados.tarifa_kwh)}</span></div>
        <div class="linha-relatorio"><span>Consumo Informado (${MESES_LABEL_COMPLETO[dados.mes_referencia]})</span><span>${dados.consumo_mes} kWh</span></div>
    `;

    document.getElementById('relatorio-equipamentos').innerHTML = `
        <div class="linha-relatorio"><span>Módulo Fotovoltaico</span><span>${nomeModulo} × ${dados.modulo_quantidade}</span></div>
        <div class="linha-relatorio"><span>Inversor</span><span>${nomeInversor} × ${dados.inversor_quantidade}</span></div>
        <div class="linha-relatorio"><span>Potência do Sistema</span><span>${dimensionamento.potencia_escolhida_kwp} kWp</span></div>
    `;

    document.getElementById('relatorio-financeiro').innerHTML = `
        <div class="linha-relatorio"><span>Valor do Kit</span><span>${formatarMoeda(dados.valor_kit)}</span></div>
        <div class="linha-relatorio"><span>Custos Extras</span><span>${formatarMoeda(dados.custos_extra)}</span></div>
        <div class="linha-relatorio"><span>Margem de Lucro</span><span>${(dados.lucro_percentual * 100).toFixed(1)}%</span></div>
        <div class="linha-relatorio"><span>Imposto sobre o Lucro</span><span>${(dados.imposto_percentual * 100).toFixed(1)}%</span></div>
        <div class="linha-relatorio"><span>Validade da Proposta</span><span>${dados.validade_dias} dias</span></div>
    `;

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
// 7. SALVAR ORÇAMENTO
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

        await tratarRespostaApi(resposta);

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
    document.getElementById('campo-cliente-cpf').value = '';
    document.getElementById('campo-cliente-cep').value = '';
    document.getElementById('campo-cliente-bairro').value = '';
    document.getElementById('campo-cliente-rua').value = '';
    document.getElementById('campo-cliente-numero').value = '';
    campoCidade.value = '';
    document.getElementById('campo-tarifa').value = '';
    campoMesReferencia.selectedIndex = 0;
    document.getElementById('campo-consumo-mes').value = '';
    document.getElementById('campo-valor-kit').value = '';
    document.getElementById('campo-custos-extra').value = 'R$ 0,00';
    document.getElementById('campo-lucro').value = '';
    document.getElementById('campo-imposto').value = '0';
    document.getElementById('previa-resultado').style.display = 'none';
    document.getElementById('mensagem-orcamento').style.display = 'none';
    ultimoCalculo = null;
    orcamentoEditandoId = null;
}

// ==========================================================================
// 8. CONFIGURAÇÕES
// ==========================================================================
async function carregarCatalogos() {
    await carregarCatalogosNoFormulario();
    renderizarCatalogo('modulos');
    renderizarCatalogo('inversores');
    renderizarCatalogo('vendedores');
}

function renderizarCatalogo(tipo) {
    const listas = { modulos: catalogoModulos, inversores: catalogoInversores, vendedores: catalogoVendedores };
    const lista = listas[tipo];
    const container = document.getElementById(`lista-${tipo}`);

    if (!lista || lista.length === 0) {
        const nomeSingular = { modulos: 'módulo', inversores: 'inversor', vendedores: 'vendedor' }[tipo];
        container.innerHTML = `<p style="color:var(--cor-texto-secundario); font-size:13.5px;">Nenhum ${nomeSingular} cadastrado ainda.</p>`;
        return;
    }

    container.innerHTML = lista.map(item => {
        let descricao;
        if (tipo === 'modulos') descricao = `<strong>${item.fabricante || ''} ${item.modelo}</strong> — ${item.potencia_wp} Wp`;
        else if (tipo === 'inversores') descricao = `<strong>${item.fabricante || ''} ${item.modelo}</strong> — ${item.potencia_kw} kW`;
        else descricao = `<strong>${item.nome}</strong>${item.cargo ? ' — ' + item.cargo : ''}`;
        return `
            <div class="item-catalogo">
                <span class="item-catalogo-texto">${descricao}</span>
                <button class="botao-remover-item" data-id="${item.id}" data-tipo="${tipo}">✕</button>
            </div>`;
    }).join('');

    container.querySelectorAll('.botao-remover-item').forEach(botao => {
        botao.addEventListener('click', async () => {
            try {
                const resposta = await fetch(`/api/${botao.dataset.tipo}/${botao.dataset.id}`, { method: 'DELETE' });
                await tratarRespostaApi(resposta);
                carregarCatalogos();
            } catch (erro) {
                alert(`❌ Erro ao excluir item: ${erro.message}`);
            }
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
        await tratarRespostaApi(resposta);

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
        await tratarRespostaApi(resposta);

        ['inversor-fabricante', 'inversor-modelo', 'inversor-potencia', 'inversor-monitoramento'].forEach(id => document.getElementById(id).value = '');
        carregarCatalogos();
    } catch (erro) {
        alert(`❌ Não foi possível cadastrar o inversor: ${erro.message}`);
        console.error(erro);
    }
});

document.getElementById('botao-add-vendedor').addEventListener('click', async () => {
    const dados = {
        nome: document.getElementById('vendedor-nome').value.trim(),
        cargo: document.getElementById('vendedor-cargo').value.trim() || null
    };
    if (!dados.nome) { alert('Preencha ao menos o nome do vendedor.'); return; }

    try {
        const resposta = await fetch('/api/vendedores', {
            method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(dados)
        });
        await tratarRespostaApi(resposta);

        ['vendedor-nome', 'vendedor-cargo'].forEach(id => document.getElementById(id).value = '');
        carregarCatalogos();
    } catch (erro) {
        alert(`❌ Não foi possível cadastrar o vendedor: ${erro.message}`);
        console.error(erro);
    }
});

// ==========================================================================
// 9. Inicialização
// ==========================================================================
carregarDashboard();
carregarCatalogosNoFormulario();
configurarMascarasDeMoeda();
configurarValidacaoNumerica();