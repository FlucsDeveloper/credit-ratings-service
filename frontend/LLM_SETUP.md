# LLM Configuration Guide

## Visão Geral

O sistema de extração de ratings funciona em **2 camadas**:

1. **Regex (Sempre ativo)** - Rápido, grátis, determinístico
2. **LLM Fallback (Opcional)** - Usado apenas quando regex falha

---

## 🆓 Opção 1: REGEX-ONLY (Recomendado para começar)

**100% Gratuito | Sem API calls | Rápido**

### Como configurar:

No seu `.env.local`, **NÃO adicione nenhuma chave de API**:

```bash
# Deixe vazio ou não adicione essas linhas:
# OPENAI_API_KEY=
# DEEPSEEK_API_KEY=
# OLLAMA_BASE_URL=

# Ou force modo regex-only:
LLM_PROVIDER=none
```

### O que funciona:
- ✅ Empresas no banco de dados (Microsoft, Apple, etc.) - **Instantâneo**
- ✅ Páginas bem formatadas das agências - **Regex consegue extrair**
- ✅ 100% gratuito, sem limites
- ❌ Páginas mal formatadas ou artigos de notícias - **Regex pode falhar**

---

## 💰 Opção 2: DeepSeek-V2 (Barato, mas pago)

**~$0.14/1M tokens | Requer créditos**

### Status atual:
Você tem o erro: `Insufficient Balance` (status 402) porque sua conta DeepSeek **não tem créditos**.

### Como configurar:

1. Acesse: https://platform.deepseek.com
2. Adicione créditos (ex: $5-10)
3. Copie sua API key

No `.env.local`:
```bash
DEEPSEEK_API_KEY=sk-...sua-chave-aqui...
```

### Custo estimado:
- **Regex funciona**: $0 (maioria dos casos)
- **LLM usado**: ~$0.14/1M tokens
- **1000 extrações com LLM**: ~$0.10-0.20

---

## 🔥 Opção 3: OpenAI GPT-4o-mini (Melhor qualidade)

**~$0.15/1M tokens | Melhor para produção**

### Como configurar:

1. Acesse: https://platform.openai.com/api-keys
2. Crie uma API key
3. Adicione créditos ($5-10)

No `.env.local`:
```bash
OPENAI_API_KEY=sk-proj-...sua-chave-aqui...
```

### Prioridade:
OpenAI tem **prioridade** sobre DeepSeek. Se você configurar ambos, o sistema usa OpenAI.

### Custo estimado:
- **1000 extrações com LLM**: ~$0.50-1.00

---

## 🖥️ Opção 4: Ollama (Local, grátis)

**$0 | Roda localmente | Requer GPU/CPU forte**

### Como configurar:

1. Instale Ollama: https://ollama.ai
2. Baixe um modelo:
   ```bash
   ollama pull llama3.1:8b
   # Ou outros: mistral, command-r-plus, deepseek-v2.5
   ```
3. Rode o servidor:
   ```bash
   ollama serve
   ```

No `.env.local`:
```bash
OLLAMA_BASE_URL=http://localhost:11434
```

### Ajustar modelo (opcional):

Edite `lib/ai/rating-extractor.ts` linha 46:
```typescript
model: 'llama3.1:8b', // Ou 'mistral', 'command-r-plus', etc.
```

### Requisitos:
- **8GB+ RAM** (para modelos 7-8B)
- **16GB+ RAM** (para modelos 13B+)
- GPU NVIDIA recomendada (mas funciona em CPU)

---

## 📊 Comparação de Opções

| Opção | Custo | Qualidade | Velocidade | Setup |
|-------|-------|-----------|------------|-------|
| **Regex-only** | $0 | 70% | ⚡️ Muito rápido | Nenhum |
| **DeepSeek** | $0.10-0.20/1k | 85% | 🚀 Rápido | Fácil |
| **OpenAI** | $0.50-1.00/1k | 95% | 🚀 Rápido | Fácil |
| **Ollama** | $0 | 80-90% | 🐌 Lento (CPU) | Médio |

---

## 🔍 Como o sistema escolhe o provider:

1. Se `LLM_PROVIDER=none` → **Regex-only**
2. Se `OPENAI_API_KEY` existe → **OpenAI**
3. Se `DEEPSEEK_API_KEY` existe → **DeepSeek**
4. Se `OLLAMA_BASE_URL` existe → **Ollama**
5. Caso contrário → **Regex-only**

---

## 🧪 Testar sua configuração:

```bash
# Teste uma empresa no banco de dados (regex apenas):
curl "http://localhost:3000/api/ratings-v2?q=Microsoft"

# Teste uma empresa NÃO no banco (vai tentar LLM se configurado):
curl "http://localhost:3000/api/ratings-v2?q=Raizen"
```

Veja os logs no terminal para saber qual método foi usado:
```
[sp] ✅ Manual extraction successful: AAA  # ← Regex funcionou
[sp] 🤖 LLM extraction result: {...}       # ← LLM foi usado
[sp] ⚠️ No LLM provider configured         # ← Regex-only mode
```

---

## ❓ Qual opção escolher?

### Para testes e desenvolvimento:
→ **Regex-only** (grátis, já funciona bem)

### Para produção (baixo custo):
→ **DeepSeek** (adicione $5-10 de créditos)

### Para produção (máxima qualidade):
→ **OpenAI GPT-4o-mini** (melhor extração)

### Para rodar offline/privado:
→ **Ollama** (100% local, sem API)

---

## 🐛 Troubleshooting

### Erro: "Insufficient Balance" (DeepSeek)
- **Causa**: Conta DeepSeek sem créditos
- **Solução**: Adicione créditos em https://platform.deepseek.com

### Erro: "Invalid API Key" (OpenAI/DeepSeek)
- **Causa**: API key incorreta ou expirada
- **Solução**: Regenere a key no dashboard do provider

### LLM muito lento
- **Causa**: Usando Ollama em CPU lenta
- **Solução**: Use DeepSeek ou OpenAI, ou mude para modelo menor

### Sistema não usa LLM mesmo com API key configurada
- **Causa**: Regex está funcionando (isso é bom!)
- **Solução**: LLM só é usado quando regex falha

---

## 📝 Arquivo .env.local exemplo completo:

```bash
# ===================================
# ESCOLHA UMA OPÇÃO:
# ===================================

# Opção 1: Regex-only (grátis)
LLM_PROVIDER=none

# Opção 2: DeepSeek (barato, requer créditos)
# DEEPSEEK_API_KEY=sk-...

# Opção 3: OpenAI (melhor qualidade)
# OPENAI_API_KEY=sk-proj-...

# Opção 4: Ollama (local, grátis)
# OLLAMA_BASE_URL=http://localhost:11434

# ===================================
# Configurações adicionais
# ===================================
NODE_ENV=development
```

---

## 🚀 Próximos passos

1. Escolha uma opção acima
2. Configure o `.env.local`
3. Reinicie o servidor: `npm run dev`
4. Teste com: `curl "http://localhost:3000/api/ratings-v2?q=Microsoft"`
5. Verifique os logs no terminal

**Recomendação inicial**: Comece com **Regex-only** (grátis). Se precisar de mais cobertura, adicione DeepSeek ($5-10).
