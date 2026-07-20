-- ==========================================================================
-- 🏗️ ESTRUTURA DO BANCO — Orçamento Solar
-- As tabelas 'cidades', 'irradiancia' e 'perdas_uf' são preenchidas
-- automaticamente pelo próprio app na primeira vez que ele liga — não
-- precisa colar dados aqui. Só rode este arquivo pra criar as tabelas vazias.
-- ==========================================================================

CREATE TABLE cidades (
    id INTEGER PRIMARY KEY,
    municipio TEXT NOT NULL,
    municipio_uf TEXT NOT NULL UNIQUE,
    latitude DOUBLE PRECISION NOT NULL,
    longitude DOUBLE PRECISION NOT NULL,
    uf VARCHAR(2) NOT NULL
);

CREATE TABLE irradiancia (
    id INTEGER PRIMARY KEY,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    anual DOUBLE PRECISION NOT NULL,
    jan DOUBLE PRECISION NOT NULL,
    fev DOUBLE PRECISION NOT NULL,
    mar DOUBLE PRECISION NOT NULL,
    abr DOUBLE PRECISION NOT NULL,
    mai DOUBLE PRECISION NOT NULL,
    jun DOUBLE PRECISION NOT NULL,
    jul DOUBLE PRECISION NOT NULL,
    ago DOUBLE PRECISION NOT NULL,
    set_ DOUBLE PRECISION NOT NULL,
    out DOUBLE PRECISION NOT NULL,
    nov DOUBLE PRECISION NOT NULL,
    dez DOUBLE PRECISION NOT NULL
);

CREATE TABLE perdas_uf (
    uf VARCHAR(2) PRIMARY KEY,
    perdas DOUBLE PRECISION NOT NULL
);

-- Catálogo de módulos fotovoltaicos (cadastrado uma vez, reutilizado nos orçamentos)
CREATE TABLE modulos (
    id SERIAL PRIMARY KEY,
    modelo TEXT NOT NULL,
    fabricante TEXT,
    potencia_wp INTEGER NOT NULL,
    garantia_defeito_anos INTEGER,
    garantia_eficiencia_anos INTEGER,
    peso_kg NUMERIC
);

-- Catálogo de inversores
CREATE TABLE inversores (
    id SERIAL PRIMARY KEY,
    modelo TEXT NOT NULL,
    fabricante TEXT,
    potencia_kw NUMERIC NOT NULL,
    garantia_anos INTEGER,
    monitoramento TEXT
);

-- Orçamentos salvos
CREATE TABLE orcamentos (
    id SERIAL PRIMARY KEY,
    cliente_nome TEXT NOT NULL,
    cidade_uf TEXT NOT NULL REFERENCES cidades(municipio_uf),

    tarifa_kwh NUMERIC NOT NULL,
    classificacao_rede VARCHAR(20),

    consumo_jan NUMERIC NOT NULL, consumo_fev NUMERIC NOT NULL, consumo_mar NUMERIC NOT NULL,
    consumo_abr NUMERIC NOT NULL, consumo_mai NUMERIC NOT NULL, consumo_jun NUMERIC NOT NULL,
    consumo_jul NUMERIC NOT NULL, consumo_ago NUMERIC NOT NULL, consumo_set NUMERIC NOT NULL,
    consumo_out NUMERIC NOT NULL, consumo_nov NUMERIC NOT NULL, consumo_dez NUMERIC NOT NULL,

    valor_kit NUMERIC NOT NULL,
    custos_extra NUMERIC NOT NULL DEFAULT 0,
    lucro_percentual NUMERIC NOT NULL,
    imposto_percentual NUMERIC NOT NULL DEFAULT 0,
    taxa_financiamento_mensal NUMERIC NOT NULL DEFAULT 0.009,

    modulo_id INTEGER REFERENCES modulos(id),
    modulo_quantidade INTEGER NOT NULL,
    inversor_id INTEGER REFERENCES inversores(id),
    inversor_quantidade INTEGER NOT NULL DEFAULT 1,

    responsavel_nome TEXT,
    responsavel_contato TEXT,
    validade_dias INTEGER NOT NULL DEFAULT 7,
    status VARCHAR(20) NOT NULL DEFAULT 'pendente', -- pendente | aceita | recusada
    data_criacao TIMESTAMP NOT NULL DEFAULT NOW()
);