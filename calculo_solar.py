"""
Motor de cálculo do dimensionamento solar fotovoltaico.

Reproduz a lógica da planilha original:
1. Acha a cidade do cliente -> pega latitude/longitude
2. Acha o ponto de irradiância solar mais próximo (banco com ~72 mil pontos)
3. Calcula a potência de sistema sugerida a partir do consumo médio
4. Calcula a geração mensal estimada (kWh) usando o sistema realmente escolhido
5. Calcula a parte financeira (valor total, lucro, imposto, parcelamento)

Este módulo é puro (sem Flask/banco) para poder ser testado isoladamente.
Quem chama passa os dados já buscados do banco (cidade e ponto de irradiância).
"""

DIAS_POR_MES = 30
PERDAS_PADRAO_UF_AUSENTE = 0.19  # reserva para estados sem valor cadastrado (RR, SC, SP, SE, TO)

MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
MESES_LABEL = {
    'jan': 'JAN', 'fev': 'FEV', 'mar': 'MAR', 'abr': 'ABR', 'mai': 'MAI', 'jun': 'JUN',
    'jul': 'JUL', 'ago': 'AGO', 'set': 'SET', 'out': 'OUT', 'nov': 'NOV', 'dez': 'DEZ'
}


def encontrar_ponto_mais_proximo(irradiancia_pontos, lat, lon):
    """Dado uma lista de dicts com 'lat'/'lon' (em graus), acha o mais próximo por distância euclidiana simples.
    Suficiente aqui porque os pontos já são uma grade densa e regular (mesma lógica de "vizinho mais próximo"
    usada na planilha original via VLOOKUP aproximado)."""
    return min(irradiancia_pontos, key=lambda p: (p['lat'] - lat) ** 2 + (p['lon'] - lon) ** 2)


def calcular_dimensionamento(consumo_mensal_kwh, ponto_irradiancia, perdas_fracao, potencia_sistema_kwp):
    """
    consumo_mensal_kwh: dict {jan: 600, fev: 600, ...} (kWh consumidos por mês)
    ponto_irradiancia: dict com 'anual' e cada mês (jan..dez), em Wh/m².dia (será convertido /1000)
    perdas_fracao: ex. 0.08 para 8%
    potencia_sistema_kwp: potência do sistema realmente escolhido (soma dos módulos, em kWp)

    Retorna um dict com o dimensionamento sugerido e a geração mensal estimada.
    """
    consumo_medio_mensal = sum(consumo_mensal_kwh.values()) / len(consumo_mensal_kwh)
    consumo_medio_diario = consumo_medio_mensal / DIAS_POR_MES

    irradiancia_media_dia = ponto_irradiancia['anual'] / 1000  # kWh/m².dia
    potencia_sugerida_kwp = consumo_medio_diario / (irradiancia_media_dia * (1 - perdas_fracao))

    geracao_mensal = {}
    for mes in MESES:
        irradiancia_mes = ponto_irradiancia[mes] / 1000  # kWh/m².dia
        geracao_mensal[mes] = potencia_sistema_kwp * irradiancia_mes * DIAS_POR_MES * (1 - perdas_fracao)

    geracao_media_mensal = sum(geracao_mensal.values()) / len(geracao_mensal)
    irradiancia_media_mensal = sum(ponto_irradiancia[m] / 1000 for m in MESES) / len(MESES)

    return {
        'consumo_medio_mensal_kwh': round(consumo_medio_mensal, 2),
        'consumo_medio_diario_kwh': round(consumo_medio_diario, 2),
        'potencia_sugerida_kwp': round(potencia_sugerida_kwp, 3),
        'potencia_escolhida_kwp': round(potencia_sistema_kwp, 3),
        'geracao_mensal_kwh': {m: round(v, 2) for m, v in geracao_mensal.items()},
        'geracao_media_mensal_kwh': round(geracao_media_mensal, 2),
        'irradiancia_media_mensal_kwh_m2_dia': round(irradiancia_media_mensal, 3),
    }


# Taxa de disponibilidade mínima cobrada pela distribuidora (em kWh), mesmo com 100% de geração solar
TAXA_DISPONIBILIDADE_KWH = {
    'Monofásica': 30,
    'Bifásica': 50,
    'Trifásica': 100,
}


def validar_tarifa(tarifa_kwh):
    """Retorna uma mensagem de erro se a tarifa for nula, zero, negativa ou fora de uma
    faixa plausível (indício de valor desatualizado/errado). None se estiver ok."""
    if tarifa_kwh is None:
        return 'Informe a tarifa de energia (R$/kWh).'
    if tarifa_kwh <= 0:
        return 'A tarifa de energia deve ser maior que zero.'
    if tarifa_kwh > 5:
        return 'Tarifa de energia parece desatualizada (acima de R$ 5,00/kWh). Confira o valor.'
    return None


def calcular_economia_e_payback(consumo_medio_mensal_kwh, geracao_media_mensal_kwh, tarifa_kwh, classificacao_rede, valor_total_investido):
    """Economia mensal considerando a taxa de disponibilidade mínima da distribuidora
    (o cliente nunca paga R$ 0, mesmo gerando 100% do consumo) e o payback do investimento."""
    taxa_disponibilidade_kwh = TAXA_DISPONIBILIDADE_KWH.get(classificacao_rede, 50)

    conta_sem_solar = consumo_medio_mensal_kwh * tarifa_kwh
    consumo_faturavel_com_solar = max(taxa_disponibilidade_kwh, consumo_medio_mensal_kwh - geracao_media_mensal_kwh)
    conta_com_solar = consumo_faturavel_com_solar * tarifa_kwh
    economia_mensal_reais = max(0, conta_sem_solar - conta_com_solar)

    payback_anos = payback_meses = payback_meses_total = None
    if economia_mensal_reais > 0 and valor_total_investido > 0:
        payback_meses_total = valor_total_investido / economia_mensal_reais
        payback_anos = int(payback_meses_total // 12)
        payback_meses = round(payback_meses_total % 12)
        if payback_meses == 12:
            payback_anos += 1
            payback_meses = 0

    return {
        'taxa_disponibilidade_kwh': taxa_disponibilidade_kwh,
        'conta_sem_solar_reais': round(conta_sem_solar, 2),
        'conta_com_solar_reais': round(conta_com_solar, 2),
        'economia_mensal_reais': round(economia_mensal_reais, 2),
        'payback_meses_total': round(payback_meses_total, 1) if payback_meses_total is not None else None,
        'payback_anos': payback_anos,
        'payback_meses': payback_meses,
    }


def calcular_financeiro(valor_kit, custos_extra, lucro_percentual, imposto_percentual):
    """Reproduz o bloco 'Dados Financeiros' da planilha."""
    valor_lucro = valor_kit * lucro_percentual
    valor_total = valor_kit + custos_extra + valor_lucro
    lucro_liquido = valor_lucro - (valor_lucro * imposto_percentual)

    return {
        'valor_kit': round(valor_kit, 2),
        'custos_extra': round(custos_extra, 2),
        'valor_lucro': round(valor_lucro, 2),
        'valor_total': round(valor_total, 2),
        'lucro_liquido': round(lucro_liquido, 2),
    }


def calcular_parcelas(valor_total, taxa_mensal, prazos_meses=(12, 24, 36, 48, 60)):
    """Calcula a parcela mensal para cada prazo, usando a fórmula de amortização
    (equivalente ao -PMT do Excel)."""
    parcelas = {}
    for n in prazos_meses:
        if taxa_mensal == 0:
            parcela = valor_total / n
        else:
            parcela = valor_total * (taxa_mensal * (1 + taxa_mensal) ** n) / ((1 + taxa_mensal) ** n - 1)
        parcelas[n] = round(parcela, 2)
    return parcelas