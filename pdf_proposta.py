"""
Gera o PDF da Proposta Comercial (documento final pro cliente), com as
seções que a Maria Luiza escolheu manter:
1. Dados do cliente e responsável
2. Benefícios do Sistema Fotovoltaico
3. Características do projeto (consumo, tarifa, custo mensal)
4. Lista de Equipamentos (módulos e inversor)
5. Geração e Consumo Estimados (mensal)
6. Serviços Inclusos
7. Análise Financeira (valor total, parcelamento)

Visual baseado no modelo da 3S Engenharia: barras escuras nos títulos de
seção, destaque em laranja-coral, logo real da empresa no cabeçalho.
"""
import os
from io import BytesIO
from datetime import datetime
from reportlab.lib.pagesizes import A4
from reportlab.lib.units import cm
from reportlab.lib import colors
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (
    SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image as ImagemPDF, PageBreak
)
from reportlab.lib.enums import TA_CENTER

DIR_ATUAL = os.path.dirname(os.path.abspath(__file__))
CAMINHO_LOGO = os.path.join(DIR_ATUAL, 'assets', 'logo_3s_engenharia.jpg')

COR_BARRA_ESCURA = colors.HexColor('#262626')
COR_LARANJA = colors.HexColor('#ff714f')
COR_LARANJA_CLARO = colors.HexColor('#ffe1d6')
COR_TEXTO = colors.HexColor('#1a1a1a')
COR_TEXTO_SECUNDARIO = colors.HexColor('#6b7280')
COR_BORDA = colors.HexColor('#d1d5db')
COR_BRANCO = colors.white

MESES_LABEL = {
    'jan': 'Janeiro', 'fev': 'Fevereiro', 'mar': 'Março', 'abr': 'Abril',
    'mai': 'Maio', 'jun': 'Junho', 'jul': 'Julho', 'ago': 'Agosto',
    'set': 'Setembro', 'out': 'Outubro', 'nov': 'Novembro', 'dez': 'Dezembro'
}

BENEFICIOS = [
    "Redução significativa (até 95%) na conta de energia elétrica",
    "Proteção contra futuros aumentos nas tarifas de energia",
    "Valorização do imóvel",
    "Energia limpa e renovável, sem emissão de poluentes",
    "Baixa manutenção e vida útil de mais de 25 anos",
    "Créditos de energia acumulados por até 60 meses",
]

SERVICOS_INCLUSOS = [
    "Vistoria Técnica",
    "Projeto Elétrico",
    "Anotação da Responsabilidade Técnica (ART) do Projeto e Instalação",
    "Obtenção das Licenças Junto à Concessionária de Energia Local",
    "Montagem dos Módulos Fotovoltaicos com Estrutura Apropriada para o Tipo de Telhado",
    "Instalação e Montagem Elétrica do Sistema",
    "Gestão, Supervisão e Fiscalização da Obra de Instalação",
    "Frete Incluso",
    "Documentação Personalizada do Projeto Fotovoltaico",
    "Inclusão da Primeira Limpeza e Inspeção do Sistema (Até 12 Meses Após Comissionamento)",
    "Monitoramento e Manutenção Preventiva do Sistema",
]

CONDICOES_ACEITE = [
    "A instalação ocorrerá durante o horário comercial, salvo acordo entre as partes;",
    "O proprietário deverá fornecer acesso aos locais;",
    "Nos reservamos o direito de alterar a potência individual de cada módulo, desde que a potência global do sistema seja preservada.",
    "As garantias de funcionamento dos equipamentos são oferecidas pelos respectivos fabricantes, variando de acordo com a marca. Os certificados serão fornecidos ao cliente.",
    "A garantia dos produtos desta proposta observará todas as disposições do termo de garantia que será entregue ao cliente, junto com os produtos. O cliente fica desde já alertado que é expressamente vedado exercer pressões sobre os módulos, caminhar ou se assentar sobre eles, uma vez que, embora o vidro externo seja resistente a impactos e pressões, os circuitos internos fotovoltaicos, responsáveis pela efetiva captação da energia solar, são componentes frágeis e não maleáveis, ou seja, não suportam flexões causadas por pressões externas. O descumprimento de tal proibição resultará na perda da garantia.",
    "A garantia para os serviços executados é de 1 ano, a contar da data da instalação.",
]


def _estilos():
    base = getSampleStyleSheet()
    return {
        'subtitulo_empresa': ParagraphStyle('subtitulo_empresa', parent=base['Normal'], fontSize=9, textColor=COR_TEXTO_SECUNDARIO),
        'titulo_proposta': ParagraphStyle('titulo_proposta', parent=base['Heading1'], fontSize=16, textColor=COR_TEXTO, spaceBefore=14, spaceAfter=10),
        'titulo_barra': ParagraphStyle('titulo_barra', parent=base['Normal'], fontSize=12, textColor=COR_BRANCO, fontName='Helvetica-Bold', leading=16),
        'corpo': ParagraphStyle('corpo', parent=base['Normal'], fontSize=10, textColor=COR_TEXTO, leading=14),
        'corpo_secundario': ParagraphStyle('corpo_secundario', parent=base['Normal'], fontSize=8.5, textColor=COR_TEXTO_SECUNDARIO, leading=12),
        'nota_legal': ParagraphStyle('nota_legal', parent=base['Normal'], fontSize=8, textColor=COR_TEXTO_SECUNDARIO, leading=11.5, spaceAfter=5),
        'campo_assinatura': ParagraphStyle('campo_assinatura', parent=base['Normal'], fontSize=10.5, textColor=COR_TEXTO, leading=26),
        'valor_destaque': ParagraphStyle('valor_destaque', parent=base['Heading1'], fontSize=18, textColor=COR_TEXTO, alignment=TA_CENTER),
        'celula_tabela': ParagraphStyle('celula_tabela', parent=base['Normal'], fontSize=8.5, textColor=COR_TEXTO, leading=11),
    }


def _barra_titulo(texto, estilos):
    """Barra escura de largura total, com texto branco em negrito — o
    elemento de assinatura visual do modelo da 3S Engenharia."""
    tabela = Table([[Paragraph(texto, estilos['titulo_barra'])]], colWidths=[16.2 * cm])
    tabela.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, -1), COR_BARRA_ESCURA),
        ('LEFTPADDING', (0, 0), (-1, -1), 10),
        ('TOPPADDING', (0, 0), (-1, -1), 7),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 7),
    ]))
    return tabela


def _caixa_destaque(texto, estilos):
    """Caixa com borda laranja, usada pra destacar um valor importante
    (ex: Valor Total do Sistema)."""
    tabela = Table([[Paragraph(texto, estilos['valor_destaque'])]], colWidths=[16.2 * cm])
    tabela.setStyle(TableStyle([
        ('BOX', (0, 0), (-1, -1), 1.3, COR_LARANJA),
        ('LEFTPADDING', (0, 0), (-1, -1), 14),
        ('RIGHTPADDING', (0, 0), (-1, -1), 14),
        ('TOPPADDING', (0, 0), (-1, -1), 10),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 10),
    ]))
    return tabela


def gerar_pdf_proposta(dados_empresa, orcamento, dimensionamento, financeiro, modulo, inversor, perdas_usada=None):
    """
    dados_empresa: {'nome', 'cnpj', 'responsavel', 'contato'}
    orcamento: dict com os campos salvos da tabela `orcamentos`
    dimensionamento: dict retornado por calcular_dimensionamento()
    financeiro: dict retornado por calcular_financeiro()
    parcelas: dict {12: valor, 24: valor, ...}
    modulo / inversor: dicts com os dados do catálogo (podem ser None)
    """
    buffer = BytesIO()
    doc = SimpleDocTemplate(
        buffer, pagesize=A4,
        topMargin=1.6 * cm, bottomMargin=1.6 * cm, leftMargin=1.9 * cm, rightMargin=1.9 * cm
    )
    e = _estilos()
    story = []

    # --- Cabeçalho com a logo real ---
    if os.path.exists(CAMINHO_LOGO):
        logo = ImagemPDF(CAMINHO_LOGO, width=6.5 * cm, height=1.96 * cm)
        story.append(logo)
    story.append(Spacer(1, 6))
    story.append(Paragraph(f"CNPJ: {dados_empresa['cnpj']}", e['subtitulo_empresa']))
    story.append(Paragraph("Proposta Comercial — Sistema de Energia Solar", e['titulo_proposta']))

    data_proposta = orcamento.get('data_criacao')
    data_formatada = data_proposta.strftime('%d/%m/%Y') if isinstance(data_proposta, datetime) else str(data_proposta)
    tabela_topo = Table([
        ["Cliente:", orcamento['cliente_nome'], "Data:", data_formatada],
        ["Responsável:", dados_empresa['responsavel'], "Validade:", f"{orcamento['validade_dias']} dias"],
        ["Contato:", dados_empresa['contato'], "Cidade:", orcamento['cidade_uf']],
    ], colWidths=[2.3 * cm, 6.2 * cm, 2 * cm, 5.7 * cm])
    tabela_topo.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9.5),
        ('TEXTCOLOR', (0, 0), (0, -1), COR_TEXTO_SECUNDARIO),
        ('TEXTCOLOR', (2, 0), (2, -1), COR_TEXTO_SECUNDARIO),
        ('FONTNAME', (0, 0), (0, -1), 'Helvetica-Bold'),
        ('FONTNAME', (2, 0), (2, -1), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(tabela_topo)
    story.append(Spacer(1, 14))

    # --- 1. Benefícios ---
    story.append(_barra_titulo("Benefícios do Sistema Fotovoltaico", e))
    story.append(Spacer(1, 8))
    for beneficio in BENEFICIOS:
        story.append(Paragraph(f"•  {beneficio}", e['corpo']))
    story.append(Spacer(1, 14))

    # --- 2. Características do projeto ---
    story.append(_barra_titulo("Características do Projeto", e))
    story.append(Spacer(1, 8))
    tabela_caracteristicas = Table([
        ["Consumo Médio Mensal", f"{dimensionamento['consumo_medio_mensal_kwh']:.0f} kWh/Mês"],
        ["Valor do kWh", f"R$ {orcamento['tarifa_kwh']:.3f}".replace('.', ',')],
        ["Classificação de Rede", orcamento.get('classificacao_rede') or '-'],
        ["Potência do Sistema", f"{dimensionamento['potencia_escolhida_kwp']:.2f} kWp"],
    ], colWidths=[8 * cm, 8.2 * cm])
    tabela_caracteristicas.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 10),
        ('TEXTCOLOR', (0, 0), (0, -1), COR_TEXTO_SECUNDARIO),
        ('FONTNAME', (1, 0), (1, -1), 'Helvetica-Bold'),
        ('LINEBELOW', (0, 0), (-1, -2), 0.5, COR_BORDA),
        ('TOPPADDING', (0, 0), (-1, -1), 6),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 6),
    ]))
    story.append(tabela_caracteristicas)
    story.append(Spacer(1, 14))

    # --- 3. Lista de equipamentos ---
    story.append(_barra_titulo("Lista de Equipamentos", e))
    story.append(Spacer(1, 8))
    linhas_equip = [["Equipamento", "Modelo", "Potência", "Qtd.", "Garantia"]]
    if modulo:
        linhas_equip.append([
            "Módulo Fotovoltaico",
            Paragraph(f"{modulo['fabricante'] or ''} {modulo['modelo']}".strip(), e['celula_tabela']),
            f"{modulo['potencia_wp']} Wp", str(orcamento['modulo_quantidade']),
            Paragraph(f"{modulo['garantia_defeito_anos'] or '-'} anos (defeito) / {modulo['garantia_eficiencia_anos'] or '-'} anos (eficiência)", e['celula_tabela'])
        ])
    if inversor:
        linhas_equip.append([
            "Inversor",
            Paragraph(f"{inversor['fabricante'] or ''} {inversor['modelo']}".strip(), e['celula_tabela']),
            f"{inversor['potencia_kw']} kW", str(orcamento['inversor_quantidade']),
            Paragraph(f"{inversor['garantia_anos'] or '-'} anos", e['celula_tabela'])
        ])
    tabela_equip = Table(linhas_equip, colWidths=[3 * cm, 4.2 * cm, 2.3 * cm, 1.2 * cm, 5.5 * cm])
    tabela_equip.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 8.5),
        ('BACKGROUND', (0, 0), (-1, 0), COR_BARRA_ESCURA),
        ('TEXTCOLOR', (0, 0), (-1, 0), COR_BRANCO),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('GRID', (0, 0), (-1, -1), 0.5, COR_BORDA),
        ('TOPPADDING', (0, 0), (-1, -1), 5),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 5),
        ('VALIGN', (0, 0), (-1, -1), 'MIDDLE'),
    ]))
    story.append(tabela_equip)
    story.append(Spacer(1, 14))

    # --- 4. Geração e consumo estimados ---
    story.append(_barra_titulo("Geração e Consumo Estimados", e))
    story.append(Spacer(1, 8))
    story.append(_caixa_destaque(f"Potência do Sistema&nbsp;&nbsp;=&nbsp;&nbsp;{dimensionamento['potencia_escolhida_kwp']:.2f} kWp", e))
    story.append(Spacer(1, 10))

    meses_ordem = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
    linhas_geracao = [["Mês", "Consumo (kWh)", "Geração Estimada (kWh)"]]
    for m in meses_ordem:
        consumo_mes = orcamento[f'consumo_{m}']
        geracao_mes = dimensionamento['geracao_mensal_kwh'][m]
        linhas_geracao.append([MESES_LABEL[m], f"{consumo_mes:.0f}", f"{geracao_mes:.0f}"])
    linhas_geracao.append(["Média", f"{dimensionamento['consumo_medio_mensal_kwh']:.0f}", f"{dimensionamento['geracao_media_mensal_kwh']:.0f}"])
    tabela_geracao = Table(linhas_geracao, colWidths=[5.3 * cm, 5.3 * cm, 5.6 * cm])
    tabela_geracao.setStyle(TableStyle([
        ('FONTSIZE', (0, 0), (-1, -1), 9),
        ('BACKGROUND', (0, 0), (-1, 0), COR_BARRA_ESCURA),
        ('TEXTCOLOR', (0, 0), (-1, 0), COR_BRANCO),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('FONTNAME', (0, -1), (-1, -1), 'Helvetica-Bold'),
        ('BACKGROUND', (0, -1), (-1, -1), COR_LARANJA_CLARO),
        ('GRID', (0, 0), (-1, -1), 0.4, COR_BORDA),
        ('ALIGN', (1, 0), (-1, -1), 'CENTER'),
        ('TOPPADDING', (0, 0), (-1, -1), 4),
        ('BOTTOMPADDING', (0, 0), (-1, -1), 4),
    ]))
    story.append(tabela_geracao)
    story.append(Spacer(1, 14))

    # --- 5. Serviços inclusos ---
    story.append(_barra_titulo("Serviços Inclusos", e))
    story.append(Spacer(1, 8))
    for i, servico in enumerate(SERVICOS_INCLUSOS, start=1):
        story.append(Paragraph(f"{i}. {servico}", e['corpo']))
    story.append(Spacer(1, 6))
    story.append(Paragraph("Obs: Não estão inclusas obras civis e eventuais reformas no telhado/laje e no padrão de entrada.", e['corpo_secundario']))
    story.append(Spacer(1, 14))

    # --- 6. Análise financeira ---
    story.append(_barra_titulo("Análise Financeira", e))
    story.append(Spacer(1, 8))

    def fmt_moeda(v):
        return f"R$ {v:,.2f}".replace(',', '_').replace('.', ',').replace('_', '.')

    story.append(_caixa_destaque(f"Valor Total do Sistema&nbsp;&nbsp;=&nbsp;&nbsp;{fmt_moeda(financeiro['valor_total'])}", e))
    story.append(Spacer(1, 10))

    # --- 7. Página final: informações importantes + aceite da proposta ---
    story.append(PageBreak())

    story.append(_barra_titulo("Informações Importantes", e))
    story.append(Spacer(1, 8))

    percentual_perdas = f"{perdas_usada * 100:.0f}%" if perdas_usada is not None else "as perdas do sistema"
    notas_legais = [
        "Impostos inclusos: PIS/COFINS, IPI, ICMS e ISS.",
        f"Garantias dos módulos: {modulo['garantia_defeito_anos'] if modulo else '-'} anos (mecânica) e {modulo['garantia_eficiencia_anos'] if modulo else '-'} anos (geração de energia).",
        f"Garantia do inversor: {inversor['garantia_anos'] if inversor else '-'} anos.",
        f"Validade da proposta: {orcamento['validade_dias']} dias.",
        "A proposta está sujeita a alterações conforme observações na vistoria técnica.",
        "Os valores apresentados de geração de energia são estimativas baseadas em dados de irradiação solar local, e representam médias mensais e anuais — a geração real varia de acordo com fatores meteorológicos.",
        f"Para o dimensionamento do sistema, foi considerado {percentual_perdas} de perdas (cabeamento, temperatura, poeira, sombreamento e condições de orientação e inclinação dos módulos).",
        "O sistema proposto foi projetado considerando-se o atual perfil de consumo do cliente.",
    ]
    for nota in notas_legais:
        story.append(Paragraph(f"•  {nota}", e['nota_legal']))
    story.append(Spacer(1, 16))

    story.append(_barra_titulo("Aceite da Proposta", e))
    story.append(Spacer(1, 8))
    for condicao in CONDICOES_ACEITE:
        story.append(Paragraph(f"•  {condicao}", e['nota_legal']))
    story.append(Spacer(1, 20))

    campos_assinatura = [
        "Nome completo: ____________________________________________________",
        "RG: _____________________________  CPF: ___________________________",
        "E-mail: __________________________________________________________",
        "Telefone: (____) __________________  /  (____) ____________________",
        "Data: ____ / ____ / ________&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;Assinatura: ___________________________",
    ]
    for campo in campos_assinatura:
        story.append(Paragraph(campo, e['campo_assinatura']))

    # --- Rodapé ---
    story.append(Spacer(1, 18))
    story.append(_barra_titulo(f"{dados_empresa['nome']} — {dados_empresa['responsavel']} — {dados_empresa['contato']}", e))

    doc.build(story)
    buffer.seek(0)
    return buffer