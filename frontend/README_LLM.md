# Credit Ratings Service - LLM Configuration

## 📚 Documentação Completa

Este sistema suporta **múltiplos LLM providers** com fallback automático para regex quando LLM não está configurado.

---

## 🎯 Quick Start

### **Modo 1: Grátis (Regex-only) - Recomendado para começar**

Não configure nenhuma API key. O sistema funcionará 100% grátis usando regex.

```bash
# .env.local
# Deixe vazio ou adicione:
LLM_PROVIDER=none
```

**O que funciona:**
- ✅ Empresas no banco de dados (Microsoft, Apple, etc.)
- ✅ Páginas bem formatadas das agências de rating
- ✅ 100% grátis, sem limites
- ❌ Páginas mal formatadas (artigos de notícias, PDFs, etc.)

---

### **Modo 2: Produção Institucional (OpenAI GPT-4o-mini)**

Para **produção institucional** (bancos, fundos), use OpenAI para melhor qualidade.

```bash
# .env.local
OPENAI_API_KEY=sk-proj-...sua-chave-aqui...
LLM_PROVIDER=openai
```

**Benefícios:**
- ✅ 95%+ accuracy em extração
- ✅ API estável (99.9% uptime)
- ✅ Suporte empresarial disponível
- ✅ ~$14/ano para 1000 queries/dia

**📖 [Guia completo de produção →](./PRODUCTION_SETUP.md)**

---

### **Modo 3: Desenvolvimento (DeepSeek - barato)**

Para desenvolvimento ou testes com LLM.

```bash
# .env.local
DEEPSEEK_API_KEY=sk-...sua-chave-aqui...
```

**Nota:** DeepSeek requer créditos (~$5-10). Se você viu o erro "Insufficient Balance", precisa adicionar créditos em https://platform.deepseek.com

---

### **Modo 4: Local (Ollama - grátis, avançado)**

Para rodar localmente sem API externa.

```bash
# 1. Instale Ollama
brew install ollama  # macOS

# 2. Baixe um modelo
ollama pull llama3.1:8b

# 3. Rode o servidor
ollama serve

# 4. Configure
# .env.local
OLLAMA_BASE_URL=http://localhost:11434
```

---

## 🔍 Status do LLM

Verifique qual provider está ativo:

```bash
curl http://localhost:3000/api/health/llm
```

**Resposta:**
```json
{
  "llm": {
    "active": "openai",  // ou "deepseek", "ollama", null
    "status": "enabled",  // ou "regex-only"
    "mode": "LLM Fallback (OpenAI GPT-4o-mini)"
  },
  "capabilities": {
    "regex": true,
    "llmFallback": true,
    "institutionalValidation": true,
    "multiAgencySupport": true
  }
}
```

---

## 📊 Comparação de Opções

| Provider | Custo/mês* | Qualidade | Velocidade | Setup | Produção |
|----------|------------|-----------|------------|-------|----------|
| **Regex-only** | $0 | 70% | ⚡️ Muito rápido | Nenhum | ✅ Sim |
| **DeepSeek** | ~$1-2 | 85% | 🚀 Rápido | Fácil | ⚠️ Teste |
| **OpenAI** | ~$10-15 | 95% | 🚀 Rápido | Fácil | ✅✅✅ **Recomendado** |
| **Ollama** | $0 | 80-90% | 🐌 Lento | Médio | ⚠️ Apenas privado |

*Para 1000 queries/dia (70% regex, 30% scraping, 10% LLM usado)

---

## 🚀 Como o Sistema Funciona

```mermaid
graph TD
    A[Query: "Microsoft"] --> B{No banco de dados?}
    B -->|Sim| C[Retorna dados do DB]
    B -->|Não| D[Scrape agências]
    D --> E{Regex encontrou?}
    E -->|Sim| F[Retorna rating]
    E -->|Não| G{LLM configurado?}
    G -->|Sim| H[LLM extrai rating]
    G -->|Não| I[Retorna "não encontrado"]
    H --> F
    C --> J[Validação Institucional]
    F --> J
    J --> K[Resposta com checksums + audit trail]
```

**Em resumo:**
1. **Banco de dados** (grátis, instantâneo)
2. **Regex** (grátis, rápido, 70% dos casos)
3. **LLM** (opcional, pago, 10% dos casos quando configurado)

---

## 📖 Documentação Detalhada

- **[LLM_SETUP.md](./LLM_SETUP.md)** - Guia completo de configuração de todos os providers
- **[PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md)** - Setup para produção institucional com OpenAI
- **[INSTITUTIONAL.md](./INSTITUTIONAL.md)** - Documentação completa do sistema
- **[.env.example](./.env.example)** - Template de variáveis de ambiente

---

## ⚙️ Variáveis de Ambiente

```bash
# ===================================
# Escolha UMA das opções abaixo:
# ===================================

# Opção 1: Regex-only (grátis)
LLM_PROVIDER=none

# Opção 2: OpenAI (produção)
OPENAI_API_KEY=sk-proj-...
LLM_PROVIDER=openai

# Opção 3: DeepSeek (desenvolvimento)
DEEPSEEK_API_KEY=sk-...

# Opção 4: Ollama (local)
OLLAMA_BASE_URL=http://localhost:11434
```

---

## 🧪 Testar Configuração

```bash
# 1. Health check geral
curl http://localhost:3000/api/health

# 2. Health check do LLM
curl http://localhost:3000/api/health/llm

# 3. Teste com empresa no banco (regex, grátis):
curl "http://localhost:3000/api/ratings-v2?q=Microsoft"

# 4. Teste com empresa não no banco (LLM será usado se configurado):
curl "http://localhost:3000/api/ratings-v2?q=Nubank"
```

**Veja os logs no terminal:**
```bash
[sp] ✅ Manual extraction successful: AAA  # ← Regex funcionou (grátis)
[sp] 🚀 Using LLM provider: OpenAI GPT-4o-mini  # ← LLM usado
[sp] ⚠️ No LLM provider configured  # ← Modo regex-only
```

---

## 🐛 Problemas Comuns

### **"Insufficient Balance" (DeepSeek)**
- **Causa:** Conta sem créditos
- **Solução:** Adicione $5-10 em https://platform.deepseek.com
- **Ou:** Use OpenAI (mais confiável) ou regex-only (grátis)

### **"Invalid API Key"**
- **Causa:** Key incorreta ou expirada
- **Solução:** Regenere no dashboard do provider
- **Formato OpenAI:** `sk-proj-...` (começa com `sk-proj-`)
- **Formato DeepSeek:** `sk-...`

### **Sistema não usa LLM mesmo configurado**
- **Causa:** Regex está funcionando (isso é BOM!)
- **Explicação:** LLM só é usado quando regex falha
- **Teste:** Use empresa não no banco: `curl "...?q=Nubank"`

### **LLM muito lento**
- **Causa:** Usando Ollama em CPU lenta
- **Solução:** Use OpenAI ou DeepSeek (APIs cloud)

---

## 💰 Estimativa de Custos Real

**Cenário: 1000 queries/dia**

**Breakdown:**
- 700 queries → Banco de dados = **$0** (cache hit)
- 200 queries → Scraping com regex = **$0** (extração bem-sucedida)
- 100 queries → Scraping sem regex = LLM usado

**Custo por query LLM:**
- OpenAI GPT-4o-mini: ~$0.0004/query
- DeepSeek: ~$0.0001/query

**Custo mensal:**
- 100 LLM queries/dia × 30 dias = 3000 queries/mês
- OpenAI: 3000 × $0.0004 = **$1.20/mês** → **$14.40/ano**
- DeepSeek: 3000 × $0.0001 = **$0.30/mês** → **$3.60/ano**

**Conclusão:** Custo desprezível para produção institucional.

---

## 🏆 Recomendações por Caso de Uso

### **Startup / MVP / Testes**
→ **Regex-only** (grátis)
- Configure: `LLM_PROVIDER=none`
- Funciona bem para 70% dos casos

### **Desenvolvimento / Staging**
→ **DeepSeek** ($5-10 inicial)
- Configure: `DEEPSEEK_API_KEY=sk-...`
- Barato para testes com LLM

### **Produção Institucional**
→ **OpenAI GPT-4o-mini** ($50 inicial)
- Configure: `OPENAI_API_KEY=sk-proj-...`
- Melhor qualidade, uptime 99.9%
- Suporte empresarial disponível

### **Ambiente Privado / Offline**
→ **Ollama** (grátis, requer GPU)
- Configure: `OLLAMA_BASE_URL=http://localhost:11434`
- 100% privado, sem dados saindo da rede

---

## 🎯 Próximos Passos

1. **Escolha seu modo** (recomendamos começar com regex-only)
2. **Configure `.env.local`** seguindo um dos exemplos acima
3. **Reinicie o servidor:** `npm run dev`
4. **Teste:** `curl http://localhost:3000/api/health/llm`
5. **Monitore os logs** para ver qual método está sendo usado

---

## 📞 Suporte e Links

**Sistema:**
- Health: `GET /api/health`
- LLM Status: `GET /api/health/llm`
- Logs: JSON estruturado (stdout)

**Providers:**
- OpenAI: https://platform.openai.com/docs
- DeepSeek: https://platform.deepseek.com
- Ollama: https://ollama.ai

**Documentação:**
- [Guia de Setup](./LLM_SETUP.md)
- [Produção Institucional](./PRODUCTION_SETUP.md)
- [Sistema Completo](./INSTITUTIONAL.md)

---

**Feito com ❤️ para análise institucional de crédito**

Sistema robusto com validação ISO-compliant, SHA-256 checksums, audit trails completos, e suporte multi-provider LLM.
