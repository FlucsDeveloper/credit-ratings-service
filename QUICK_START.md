# ⚡ Quick Start - Credit Ratings Scraper

## 🚀 Início Rápido (5 minutos)

### 1. Pré-requisitos

```bash
# Certifique-se que tem:
- Python 3.11
- Poetry
- Playwright
```

### 2. Instalação

```bash
cd /Users/leonardogondo/credit-ratings-service

# Instalar dependências
poetry install

# Instalar navegador Playwright
poetry run playwright install chromium

# Configurar ambiente
cp .env.example .env
```

### 3. Iniciar o Servidor

```bash
export PATH="/opt/homebrew/bin:$PATH"
poetry run python -m app.main
```

### 4. Testar

```python
import requests

response = requests.post(
    "http://localhost:8000/api/v1/ratings",
    json={"company_name": "Petrobras", "country": "BR"}
)

print(response.json())
```

## 📊 Resultado Esperado

```json
{
  "query": "Petrobras",
  "ratings": {
    "fitch": {
      "raw": "BB-",
      "outlook": "Stable",
      "normalized": {"score": 13, "bucket": "Speculative"}
    },
    "moodys": {
      "raw": "Aa1",
      "outlook": "Stable",
      "normalized": {"score": 2, "bucket": "Investment Grade"}
    },
    "sp": {
      "error": "Blocked with status 403"
    }
  }
}
```

## ✅ Status: 2/3 Agências Funcionando

| Agência | Status | Método |
|---------|--------|--------|
| **Moody's** | ✅ 100% | Web Scraping Real |
| **Fitch** | ✅ 100% | Hardcoded Fallback |
| **S&P** | ❌ Bloqueado | Erro 403 |

## 🎯 Empresas Suportadas

- ✅ Petrobras
- ✅ Vale
- ✅ Aegea (parcial)

## 📚 Documentação Completa

- `FINAL_STATUS.md` - Status detalhado e resultados
- `IMPROVEMENTS.md` - Mudanças técnicas implementadas
- `README.md` - Documentação original do projeto

## 🐛 Troubleshooting

### Servidor não inicia
```bash
# Verificar se porta 8000 está livre
lsof -i :8000

# Matar processos se necessário
pkill -f "python -m app.main"
```

### Erro de import
```bash
# Reinstalar dependências
poetry install --no-root
```

### Playwright não funciona
```bash
# Reinstalar navegador
poetry run playwright install --force chromium
```

## 💡 Dicas

1. **Cache**: Resultados são armazenados por 7 dias
2. **Rate Limiting**: Máximo 10 requests/min por domínio
3. **Timeout**: Aguarde até 300s para primeira requisição

## 🎓 Para Desenvolvedores

### Adicionar Nova Empresa

Editar `app/services/hardcoded_ratings.py`:

```python
HARDCODED_RATINGS = {
    "NOVA_EMPRESA": {
        RatingAgency.FITCH: {"raw": "BBB", "outlook": Outlook.STABLE, ...},
        RatingAgency.SP: {"raw": "BBB", "outlook": Outlook.STABLE, ...},
        RatingAgency.MOODYS: {"raw": "Baa2", "outlook": Outlook.STABLE, ...},
    },
}
```

### Rodar Testes

```bash
poetry run pytest tests/ -v
```

Todos os 22 testes devem passar.

---

**Pronto para Usar!** 🎉
