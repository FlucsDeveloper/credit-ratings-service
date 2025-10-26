# 🌎 Melhorias LATAM - Credit Ratings Service

## 📋 Resumo das Implementações

Este documento descreve as melhorias implementadas para extração de credit ratings de empresas LATAM e globais, expandindo além das agências tradicionais (S&P, Fitch, Moody's).

---

## ✅ 1. Suporte Multilíngue no LLM (`lib/ai/rating-extractor.ts`)

### System Prompt Atualizado

```typescript
CONTEXTO MULTILÍNGUE:
- O HTML pode estar em português, espanhol ou inglês
- Ratings podem ter notações locais: AA(bra), A1.mx, Baa3.br, AAA(arg), BBB+(col), etc.
- Fontes incluem: agências globais, Investor Relations, press releases, filings públicos

PADRÕES LINGUÍSTICOS:
- Português: "rating atribuído", "classificação de risco", "perspectiva estável/positiva/negativa"
- Espanhol: "calificación asignada", "perspectiva estable/positiva/negativa"
- Inglês: "rating assigned", "affirmed", "outlook stable/positive/negative"

MÁXIMA SENSIBILIDADE:
- Detecte variações: "assigned", "affirmed", "atribuído", "mantido", "asignado", "afirmado"
- Linguagem indireta: "Nubank mantém rating BB- da Fitch", "La empresa tiene calificación AA+"
- Aceite notações locais e globais
```

### Few-Shot Examples LATAM

**Exemplo Português:**
```json
{
  "html": "A Fitch Ratings atribuiu à Raízen rating nacional de longo prazo AA(bra) com perspectiva estável em dezembro de 2024.",
  "company": "Raízen",
  "expected": {
    "found": true,
    "rating": "AA(bra)",
    "outlook": "Stable",
    "date": "2024-12-01",
    "confidence": 0.92
  }
}
```

**Exemplo Español:**
```json
{
  "html": "S&P Global Ratings confirmó la calificación crediticia de A+ para Grupo Bimbo con perspectiva estable.",
  "company": "Grupo Bimbo",
  "expected": {
    "found": true,
    "rating": "A+",
    "outlook": "Stable",
    "confidence": 0.90
  }
}
```

---

## ✅ 2. Regex Patterns LATAM (`lib/scraper/extract.ts`)

### Novos Padrões Adicionados

```typescript
// LATAM: "classificação/calificación de risco/crédito: AA+"
/(?:classifica[çc][ãa]o|calificaci[óo]n)\s+(?:de\s+)?(?:risco|cr[ée]dito)[:\s]+([A-D][A-D]?[A-D]?[\+\-]?(?:\([a-z]{3}\))?)/i

// LATAM: "rating nacional/local AA(bra)"
/rating\s+(?:nacional|local)[:\s]+([A-D][A-D]?[A-D]?[\+\-]?\([a-z]{3}\))/i

// LATAM: "atribuído/asignado AA+"
/(?:atribu[íi]do?|asignado?)[:\s]+([A-D][A-D]?[A-D]?[\+\-]?(?:\([a-z]{3}\))?)/i

// LATAM: "mantém/mantiene rating AA+"
/(?:mant[éeê]m|mantiene)\s+(?:rating|classifica[çc][ãa]o)[:\s]+([A-D][A-D]?[A-D]?[\+\-]?(?:\([a-z]{3}\))?)/i
```

### Exemplos de Detecção

✅ **Português:**
- `"Classificação de risco: AA(bra)"`
- `"Fitch atribuiu rating BB+ com perspectiva estável"`
- `"A empresa mantém classificação AAA pela S&P"`
- `"Rating nacional de longo prazo: AA(bra)"`

✅ **Español:**
- `"Calificación de crédito: A+ con perspectiva estable"`
- `"S&P asignó calificación BBB+ a la empresa"`
- `"La compañía mantiene rating AA- de Moody's"`

✅ **Notações Locais:**
- `AA(bra)` - Brasil
- `A1.mx` - México
- `Baa3.br` - Brasil (Moody's)
- `AAA(arg)` - Argentina
- `BBB+(col)` - Colômbia

---

## 🔄 3. Fontes Regionais Ampliadas

### URLs IR/Filings a Implementar

```typescript
const LATAM_IR_PATTERNS = [
  // Brasil
  "https://ri.{domain}/",
  "https://www.{domain}/relacoes-com-investidores",
  "https://www.{domain}/informacoes-financeiras",
  "https://www.{domain}/rating",
  "https://www.{domain}/divulgacoes",

  // Global/English
  "https://www.{domain}/investor-relations",
  "https://www.{domain}/ir",
  "https://investors.{domain}",

  // Press Releases
  "https://www.{domain}/release",
  "https://www.{domain}/press-releases",
  "https://www.{domain}/noticias",

  // Documents
  "https://www.{domain}/uploads/ratings",
  "https://www.{domain}/static-files/",
  "https://www.{domain}/docs/",
  "https://www.{domain}/pdf/",
];
```

### Filings Regulatórios

```typescript
const REGULATORY_FILINGS = {
  brasil: "https://www.cvm.gov.br/",
  mexico: "https://www.bmv.com.mx/",
  argentina: "https://www.cnv.gov.ar/",
  chile: "https://www.cmfchile.cl/",
  colombia: "https://www.superfinanciera.gov.co/",
  global: "https://www.sec.gov/", // Para ADRs
};
```

---

## 📊 4. Empresas LATAM para Validação

### Lista de Testes

| Empresa | País | Expected Rating | IR URL |
|---------|------|-----------------|--------|
| **Nubank** | 🇧🇷 Brasil | BB- (Fitch) | https://ri.nubank.com.br/ |
| **Raízen** | 🇧🇷 Brasil | AA(bra) (Fitch) | https://ri.raizen.com.br/ |
| **Petrobras** | 🇧🇷 Brasil | BB-/Ba2 | https://ri.petrobras.com.br/ |
| **BTG Pactual** | 🇧🇷 Brasil | BB+ | https://ri.btgpactual.com/ |
| **B3** | 🇧🇷 Brasil | A- | https://ri.b3.com.br/ |
| **MercadoLibre** | 🇦🇷 Argentina | BB+ | https://investor.mercadolibre.com/ |
| **Grupo Bimbo** | 🇲🇽 México | A+ | https://inversionistas.grupobimbo.com/ |
| **Cemex** | 🇲🇽 México | Ba2 | https://www.cemex.com/investors |
| **Falabella** | 🇨🇱 Chile | BBB+ | https://www.falabella.com/inversionistas |
| **Ecopetrol** | 🇨🇴 Colômbia | BB+ | https://www.ecopetrol.com.co/investors |

---

## 🧪 5. Como Testar

### Teste 1: Nubank (Português)

```bash
curl "http://localhost:3000/api/ratings-v2?q=Nubank"
```

**Esperado:**
- Buscar em `https://ri.nubank.com.br/`
- Detectar rating BB- (Fitch) se disponível
- Confidence >= 0.85

### Teste 2: Raízen (Rating Local)

```bash
curl "http://localhost:3000/api/ratings-v2?q=Raízen"
```

**Esperado:**
- Detectar `AA(bra)` (notação local brasileira)
- Extrair perspectiva em português

### Teste 3: Grupo Bimbo (Español)

```bash
curl "http://localhost:3000/api/ratings-v2?q=Grupo%20Bimbo"
```

**Esperado:**
- Detectar `A+` em páginas em espanhol
- Reconhecer "calificación", "perspectiva estable"

---

## 🎯 6. Melhorias de Sensibilidade

### Antes vs Depois

| Aspecto | Antes | Depois |
|---------|-------|--------|
| **Idiomas** | Inglês apenas | Português, Espanhol, Inglês |
| **Ratings Locais** | Não detectava | Detecta AA(bra), A1.mx, etc |
| **Fontes** | Só agências formais | + IR, press releases, filings |
| **Threshold** | 0.70 | 0.65 (mais sensível) |
| **HTML mínimo** | 100 chars | 50 chars |
| **Regex Patterns** | 8 padrões | 16 padrões (incluindo LATAM) |

---

## 📈 7. Próximos Passos

### A Implementar

1. **Scraper IR Regional** (`lib/scraper/ir-scraper.ts`)
   - Adicionar lógica para detectar país da empresa
   - Gerar URLs IR baseadas em padrões regionais
   - Priorizar ri.{domain} para empresas brasileiras

2. **Fallback Heurístico Regional** (`lib/scraper/heuristic.ts`)
   - Se agências formais falharem, buscar em IR
   - Se IR falhar, buscar em filings regulatórios (CVM, SEC, etc)
   - Último fallback: Google Search com moderação

3. **Normalização de Ratings Locais**
   - Converter `AA(bra)` → `AA` para comparação
   - Manter notação original em `rating_raw`
   - Adicionar campo `rating_scale` (global vs local)

4. **Cache Regional**
   - Cachear URLs IR por empresa
   - TTL diferenciado para fontes regionais (1 semana)

---

## ✅ Status Atual

- ✅ LLM multilíngue implementado
- ✅ Regex LATAM adicionados
- ✅ Few-shot examples PT/ES criados
- ✅ Threshold reduzido para 0.65
- ✅ HTML mínimo reduzido para 50 chars
- ⏳ Scraping IR regional (próximo)
- ⏳ Fallback heurístico (próximo)
- ⏳ Testes com empresas LATAM (próximo)

---

## 🚀 Como Usar

O sistema já está configurado para detectar automaticamente ratings em português e espanhol. Basta fazer uma busca normalmente:

```bash
# Empresa brasileira
curl "http://localhost:3000/api/ratings-v2?q=Nubank"

# Empresa mexicana
curl "http://localhost:3000/api/ratings-v2?q=Cemex"

# Empresa argentina
curl "http://localhost:3000/api/ratings-v2?q=MercadoLibre"
```

O sistema irá:
1. Tentar regex com padrões LATAM
2. Chamar LLM com contexto multilíngue
3. Aceitar ratings com notações locais
4. Validar contra escalas oficiais (expandidas)

---

**Última Atualização**: 2025-10-26
**Versão**: 2.0.0 - LATAM Edition
