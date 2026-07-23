import os
import csv
from datetime import datetime
from zoneinfo import ZoneInfo
from flask import Flask, jsonify, request, send_from_directory, send_file
from flask_cors import CORS
import psycopg2
from psycopg2.extras import RealDictCursor, execute_values

from calculo_solar import (
    encontrar_ponto_mais_proximo, calcular_dimensionamento,
    calcular_financeiro, MESES, PERDAS_PADRAO_UF_AUSENTE
)
from pdf_proposta import gerar_pdf_proposta

app = Flask(__name__, static_folder='public', static_url_path='')
CORS(app)

# Dados da empresa exibidos no PDF (dá pra trocar aqui até virar uma tela de configurações)
DADOS_EMPRESA = {
    'nome': '3S Engenharia',
    'cnpj': '30.635.438/0001-07',
    'responsavel': 'Thales Campos',
    'contato': '68 9973 3807',
}

DATABASE_URL = os.environ.get("DATABASE_URL")
DB_CONFIG = {
    "dbname": "orcamento_solar",
    "user": "postgres",
    "password": "senha123",
    "host": "localhost",
    "port": "5432"
}

DIR_SEED = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'seed_data')

FUSO_ACRE = ZoneInfo("America/Rio_Branco")  # UTC-5, sem horário de verão


def obter_conexao():
    if DATABASE_URL:
        conn = psycopg2.connect(DATABASE_URL, sslmode="require")
    else:
        conn = psycopg2.connect(**DB_CONFIG)
    conn.set_client_encoding('UTF8')
    # Faz NOW() (usado no DEFAULT de data_criacao dos orçamentos) refletir
    # o horário do Acre, não o do servidor
    cursor_fuso = conn.cursor()
    cursor_fuso.execute("SET TIME ZONE 'America/Rio_Branco';")
    cursor_fuso.close()
    return conn


@app.route("/")
def servir_pagina_inicial():
    return send_from_directory(app.static_folder, "index.html")


# ==========================================================================
# 🌱 CARGA AUTOMÁTICA DOS BANCOS GRANDES (cidades, irradiância, perdas por UF)
# Roda sozinho ao iniciar o app — só insere se a tabela ainda estiver vazia,
# então é seguro rodar de novo a cada deploy (não duplica).
# ==========================================================================
def semear_banco_se_vazio():
    conn = obter_conexao()
    cursor = conn.cursor()

    cursor.execute("SELECT COUNT(*) FROM cidades;")
    if cursor.fetchone()[0] == 0:
        print("🌱 Carregando cidades...")
        with open(os.path.join(DIR_SEED, 'cidades.csv'), encoding='utf-8') as f:
            leitor = csv.DictReader(f)
            linhas = [(int(r['id']), r['municipio'], r['municipio_uf'], float(r['latitude']), float(r['longitude']), r['uf']) for r in leitor]
        execute_values(
            cursor,
            "INSERT INTO cidades (id, municipio, municipio_uf, latitude, longitude, uf) VALUES %s ON CONFLICT (id) DO NOTHING;",
            linhas, page_size=2000
        )
        print(f"✅ {len(linhas)} cidades carregadas.")

    cursor.execute("SELECT COUNT(*) FROM irradiancia;")
    if cursor.fetchone()[0] == 0:
        print("🌱 Carregando pontos de irradiância (pode levar um minuto)...")
        with open(os.path.join(DIR_SEED, 'irradiancia.csv'), encoding='utf-8') as f:
            leitor = csv.DictReader(f)
            linhas = [
                (int(r['id']), float(r['lat']), float(r['lon']), float(r['anual']),
                 float(r['jan']), float(r['fev']), float(r['mar']), float(r['abr']),
                 float(r['mai']), float(r['jun']), float(r['jul']), float(r['ago']),
                 float(r['set']), float(r['out']), float(r['nov']), float(r['dez']))
                for r in leitor
            ]
        execute_values(
            cursor,
            """INSERT INTO irradiancia (id, lat, lon, anual, jan, fev, mar, abr, mai, jun, jul, ago, set_, out, nov, dez)
               VALUES %s ON CONFLICT (id) DO NOTHING;""",
            linhas, page_size=2000
        )
        print(f"✅ {len(linhas)} pontos de irradiância carregados.")

    cursor.execute("SELECT COUNT(*) FROM perdas_uf;")
    if cursor.fetchone()[0] == 0:
        print("🌱 Carregando perdas por estado...")
        with open(os.path.join(DIR_SEED, 'perdas_uf.csv'), encoding='utf-8') as f:
            leitor = csv.DictReader(f)
            linhas = [(r['uf'], float(r['perdas'])) for r in leitor if r['perdas']]
        # Completa os estados sem valor cadastrado com a perda de reserva
        todas_ufs = {'AC','AL','AP','AM','BA','CE','DF','ES','GO','MA','MT','MS','MG','PA','PB',
                     'PR','PE','PI','RJ','RN','RS','RO','RR','SC','SP','SE','TO'}
        ufs_com_valor = {uf for uf, _ in linhas}
        for uf in todas_ufs - ufs_com_valor:
            linhas.append((uf, PERDAS_PADRAO_UF_AUSENTE))
        execute_values(
            cursor,
            "INSERT INTO perdas_uf (uf, perdas) VALUES %s ON CONFLICT (uf) DO NOTHING;",
            linhas
        )
        print(f"✅ {len(linhas)} estados carregados (com reserva pros que faltavam na planilha original).")

    conn.commit()
    cursor.close()
    conn.close()


# ==========================================================================
# 🏙️ CIDADES (autocomplete no formulário)
# ==========================================================================
@app.route("/api/cidades", methods=["GET"])
def buscar_cidades():
    termo = request.args.get("q", "").strip()
    if len(termo) < 3:
        return jsonify([]), 200

    conn = obter_conexao()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute(
        "SELECT municipio_uf, uf FROM cidades WHERE municipio_uf ILIKE %s ORDER BY municipio_uf LIMIT 15;",
        (f"%{termo}%",)
    )
    resultado = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(resultado), 200


# ==========================================================================
# ☀️ CÁLCULO DO DIMENSIONAMENTO (preview, sem salvar)
# ==========================================================================
@app.route("/api/calcular", methods=["POST"])
def calcular():
    try:
        dados = request.json
        conn = obter_conexao()
        cursor = conn.cursor(cursor_factory=RealDictCursor)

        cursor.execute("SELECT latitude, longitude, uf FROM cidades WHERE municipio_uf = %s;", (dados["cidade_uf"],))
        cidade = cursor.fetchone()
        if not cidade:
            return jsonify({"erro": "Cidade não encontrada"}), 404

        # Busca o ponto de irradiância mais próximo direto no banco (ordenando pela distância)
        cursor.execute("""
            SELECT anual, jan, fev, mar, abr, mai, jun, jul, ago, set_ AS set, out, nov, dez
            FROM irradiancia
            ORDER BY (lat - %s)^2 + (lon - %s)^2 ASC
            LIMIT 1;
        """, (cidade["latitude"], cidade["longitude"]))
        ponto = cursor.fetchone()

        cursor.execute("SELECT perdas FROM perdas_uf WHERE uf = %s;", (cidade["uf"],))
        linha_perdas = cursor.fetchone()
        perdas = float(linha_perdas["perdas"]) if linha_perdas else PERDAS_PADRAO_UF_AUSENTE

        cursor.close()
        conn.close()

        consumo_mensal = {m: float(dados["consumo"][m]) for m in MESES}
        potencia_escolhida = float(dados["potencia_sistema_kwp"])

        dimensionamento = calcular_dimensionamento(consumo_mensal, ponto, perdas, potencia_escolhida)
        financeiro = calcular_financeiro(
            float(dados["valor_kit"]), float(dados.get("custos_extra", 0)),
            float(dados["lucro_percentual"]), float(dados.get("imposto_percentual", 0))
        )

        return jsonify({
            "dimensionamento": dimensionamento,
            "financeiro": financeiro,
            "perdas_usada": perdas
        }), 200
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


# ==========================================================================
# 🔧 CATÁLOGO DE MÓDULOS
# ==========================================================================
@app.route("/api/modulos", methods=["GET"])
def listar_modulos():
    conn = obter_conexao()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT * FROM modulos ORDER BY modelo;")
    resultado = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(resultado), 200


@app.route("/api/modulos", methods=["POST"])
def criar_modulo():
    try:
        dados = request.json
        conn = obter_conexao()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO modulos (modelo, fabricante, potencia_wp, garantia_defeito_anos, garantia_eficiencia_anos, peso_kg)
            VALUES (%s,%s,%s,%s,%s,%s) RETURNING id;
        """, (dados["modelo"], dados.get("fabricante"), dados["potencia_wp"],
              dados.get("garantia_defeito_anos"), dados.get("garantia_eficiencia_anos"), dados.get("peso_kg")))
        id_modulo = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"mensagem": "Módulo cadastrado!", "id": id_modulo}), 201
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/api/modulos/<int:id_modulo>", methods=["DELETE"])
def deletar_modulo(id_modulo):
    conn = obter_conexao()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM modulos WHERE id = %s;", (id_modulo,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"mensagem": "Módulo removido!"}), 200


# ==========================================================================
# 🔧 CATÁLOGO DE INVERSORES
# ==========================================================================
@app.route("/api/inversores", methods=["GET"])
def listar_inversores():
    conn = obter_conexao()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT * FROM inversores ORDER BY modelo;")
    resultado = cursor.fetchall()
    cursor.close()
    conn.close()
    return jsonify(resultado), 200


@app.route("/api/inversores", methods=["POST"])
def criar_inversor():
    try:
        dados = request.json
        conn = obter_conexao()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO inversores (modelo, fabricante, potencia_kw, garantia_anos, monitoramento)
            VALUES (%s,%s,%s,%s,%s) RETURNING id;
        """, (dados["modelo"], dados.get("fabricante"), dados["potencia_kw"],
              dados.get("garantia_anos"), dados.get("monitoramento")))
        id_inversor = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"mensagem": "Inversor cadastrado!", "id": id_inversor}), 201
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/api/inversores/<int:id_inversor>", methods=["DELETE"])
def deletar_inversor(id_inversor):
    conn = obter_conexao()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM inversores WHERE id = %s;", (id_inversor,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"mensagem": "Inversor removido!"}), 200


# ==========================================================================
# 📋 ORÇAMENTOS
# ==========================================================================

def _linha_para_consumo_dict(linha):
    return {m: float(linha[f'consumo_{m}']) for m in MESES}


def _recalcular_orcamento(cursor, linha):
    """Reconstrói o dimensionamento/financeiro de um orçamento salvo
    (usado tanto pra exibir detalhes quanto pra gerar o PDF)."""
    cursor.execute("SELECT latitude, longitude, uf FROM cidades WHERE municipio_uf = %s;", (linha['cidade_uf'],))
    cidade = cursor.fetchone()

    cursor.execute("""
        SELECT anual, jan, fev, mar, abr, mai, jun, jul, ago, set_ AS set, out, nov, dez
        FROM irradiancia ORDER BY (lat - %s)^2 + (lon - %s)^2 ASC LIMIT 1;
    """, (cidade["latitude"], cidade["longitude"]))
    ponto = cursor.fetchone()

    cursor.execute("SELECT perdas FROM perdas_uf WHERE uf = %s;", (cidade["uf"],))
    linha_perdas = cursor.fetchone()
    perdas = float(linha_perdas["perdas"]) if linha_perdas else PERDAS_PADRAO_UF_AUSENTE

    modulo_potencia_kwp = 0
    modulo = None
    if linha.get('modulo_id'):
        cursor.execute("SELECT * FROM modulos WHERE id = %s;", (linha['modulo_id'],))
        modulo = cursor.fetchone()
        if modulo:
            modulo_potencia_kwp = (modulo['potencia_wp'] * linha['modulo_quantidade']) / 1000

    inversor = None
    if linha.get('inversor_id'):
        cursor.execute("SELECT * FROM inversores WHERE id = %s;", (linha['inversor_id'],))
        inversor = cursor.fetchone()

    dimensionamento = calcular_dimensionamento(
        _linha_para_consumo_dict(linha), ponto, perdas, float(modulo_potencia_kwp)
    )
    financeiro = calcular_financeiro(
        float(linha['valor_kit']), float(linha['custos_extra']),
        float(linha['lucro_percentual']), float(linha['imposto_percentual'])
    )

    return dimensionamento, financeiro, modulo, inversor, perdas


@app.route("/api/orcamentos", methods=["GET"])
def listar_orcamentos():
    termo = request.args.get("q", "").strip()
    conn = obter_conexao()
    cursor = conn.cursor(cursor_factory=RealDictCursor)

    if termo:
        cursor.execute("""
            SELECT id, cliente_nome, cidade_uf, valor_kit, custos_extra, lucro_percentual, status, data_criacao
            FROM orcamentos WHERE cliente_nome ILIKE %s OR cidade_uf ILIKE %s
            ORDER BY data_criacao DESC;
        """, (f"%{termo}%", f"%{termo}%"))
    else:
        cursor.execute("""
            SELECT id, cliente_nome, cidade_uf, valor_kit, custos_extra, lucro_percentual, status, data_criacao
            FROM orcamentos ORDER BY data_criacao DESC;
        """)
    linhas = cursor.fetchall()

    resultado = []
    for linha in linhas:
        valor_total = float(linha['valor_kit']) + float(linha['custos_extra']) + (float(linha['valor_kit']) * float(linha['lucro_percentual']))
        resultado.append({
            'id': linha['id'], 'cliente_nome': linha['cliente_nome'], 'cidade_uf': linha['cidade_uf'],
            'valor_total': round(valor_total, 2), 'status': linha['status'],
            'data_criacao': linha['data_criacao'].isoformat()
        })

    cursor.close()
    conn.close()
    return jsonify(resultado), 200


@app.route("/api/orcamentos/estatisticas", methods=["GET"])
def estatisticas_orcamentos():
    conn = obter_conexao()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT valor_kit, custos_extra, lucro_percentual, status FROM orcamentos;")
    linhas = cursor.fetchall()
    cursor.close()
    conn.close()

    total = len(linhas)
    valor_total_geral = sum(
        float(l['valor_kit']) + float(l['custos_extra']) + (float(l['valor_kit']) * float(l['lucro_percentual']))
        for l in linhas
    )
    aceitas = sum(1 for l in linhas if l['status'] == 'aceita')

    return jsonify({
        'total_orcamentos': total,
        'valor_total': round(valor_total_geral, 2),
        'propostas_aceitas': aceitas
    }), 200


@app.route("/api/orcamentos", methods=["POST"])
def criar_orcamento():
    try:
        d = request.json
        conn = obter_conexao()
        cursor = conn.cursor()
        colunas_consumo = ', '.join(f'consumo_{m}' for m in MESES)
        placeholders_consumo = ', '.join(['%s'] * len(MESES))
        valores_consumo = [d['consumo'][m] for m in MESES]

        cursor.execute(f"""
            INSERT INTO orcamentos (
                cliente_nome, cidade_uf, tarifa_kwh, classificacao_rede,
                {colunas_consumo},
                valor_kit, custos_extra, lucro_percentual, imposto_percentual, taxa_financiamento_mensal,
                modulo_id, modulo_quantidade, inversor_id, inversor_quantidade,
                responsavel_nome, responsavel_contato, validade_dias
            ) VALUES (
                %s, %s, %s, %s,
                {placeholders_consumo},
                %s, %s, %s, %s, %s,
                %s, %s, %s, %s,
                %s, %s, %s
            ) RETURNING id;
        """, [
            d['cliente_nome'], d['cidade_uf'], d['tarifa_kwh'], d.get('classificacao_rede'),
            *valores_consumo,
            d['valor_kit'], d.get('custos_extra', 0), d['lucro_percentual'], d.get('imposto_percentual', 0),
            d.get('taxa_financiamento_mensal', 0.009),
            d.get('modulo_id'), d['modulo_quantidade'], d.get('inversor_id'), d.get('inversor_quantidade', 1),
            d.get('responsavel_nome', DADOS_EMPRESA['responsavel']), d.get('responsavel_contato', DADOS_EMPRESA['contato']),
            d.get('validade_dias', 7)
        ])
        id_orcamento = cursor.fetchone()[0]
        conn.commit()
        cursor.close()
        conn.close()
        return jsonify({"mensagem": "Orçamento salvo!", "id": id_orcamento}), 201
    except Exception as e:
        return jsonify({"erro": str(e)}), 500


@app.route("/api/orcamentos/<int:id_orcamento>", methods=["GET"])
def obter_orcamento(id_orcamento):
    conn = obter_conexao()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT * FROM orcamentos WHERE id = %s;", (id_orcamento,))
    linha = cursor.fetchone()
    if not linha:
        cursor.close()
        conn.close()
        return jsonify({"erro": "Orçamento não encontrado"}), 404

    dimensionamento, financeiro, modulo, inversor, perdas = _recalcular_orcamento(cursor, linha)
    cursor.close()
    conn.close()

    linha_serializavel = dict(linha)
    linha_serializavel['data_criacao'] = linha['data_criacao'].isoformat()
    for chave in list(linha_serializavel):
        if isinstance(linha_serializavel[chave], type(None)):
            continue

    return jsonify({
        'orcamento': linha_serializavel,
        'dimensionamento': dimensionamento,
        'financeiro': financeiro,
        'modulo': modulo,
        'inversor': inversor
    }), 200


@app.route("/api/orcamentos/<int:id_orcamento>/status", methods=["PATCH"])
def atualizar_status_orcamento(id_orcamento):
    d = request.json
    conn = obter_conexao()
    cursor = conn.cursor()
    cursor.execute("UPDATE orcamentos SET status = %s WHERE id = %s;", (d['status'], id_orcamento))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"mensagem": "Status atualizado!"}), 200


@app.route("/api/orcamentos/<int:id_orcamento>", methods=["DELETE"])
def deletar_orcamento(id_orcamento):
    conn = obter_conexao()
    cursor = conn.cursor()
    cursor.execute("DELETE FROM orcamentos WHERE id = %s;", (id_orcamento,))
    conn.commit()
    cursor.close()
    conn.close()
    return jsonify({"mensagem": "Orçamento removido!"}), 200


@app.route("/api/orcamentos/<int:id_orcamento>/pdf", methods=["GET"])
def gerar_pdf_orcamento(id_orcamento):
    conn = obter_conexao()
    cursor = conn.cursor(cursor_factory=RealDictCursor)
    cursor.execute("SELECT * FROM orcamentos WHERE id = %s;", (id_orcamento,))
    linha = cursor.fetchone()
    if not linha:
        cursor.close()
        conn.close()
        return jsonify({"erro": "Orçamento não encontrado"}), 404

    dimensionamento, financeiro, modulo, inversor, perdas = _recalcular_orcamento(cursor, linha)
    cursor.close()
    conn.close()

    empresa = dict(DADOS_EMPRESA)
    empresa['responsavel'] = linha.get('responsavel_nome') or empresa['responsavel']
    empresa['contato'] = linha.get('responsavel_contato') or empresa['contato']

    buffer = gerar_pdf_proposta(empresa, linha, dimensionamento, financeiro, modulo, inversor, perdas_usada=perdas)
    nome_arquivo = f"proposta_{linha['cliente_nome'].replace(' ', '_')}.pdf"
    return send_file(buffer, as_attachment=True, download_name=nome_arquivo, mimetype='application/pdf')


if __name__ == "__main__":
    semear_banco_se_vazio()
    porta = int(os.environ.get("PORT", 5000))
    debug_ativo = os.environ.get("FLASK_DEBUG", "true").lower() == "true"
    app.run(debug=debug_ativo, host="0.0.0.0", port=porta)
else:
    # Quando rodando via gunicorn (produção), o bloco acima não executa —
    # então garantimos a carga dos bancos aqui também.
    try:
        semear_banco_se_vazio()
    except Exception as e:
        print(f"⚠️ Não foi possível semear o banco automaticamente: {e}")