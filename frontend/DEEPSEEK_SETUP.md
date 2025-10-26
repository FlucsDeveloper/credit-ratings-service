# DeepSeek AI Integration

DeepSeek offers a free AI API that's used for extracting credit ratings from scraped HTML.

## Getting a Free DeepSeek API Key

1. **Visit DeepSeek Platform**: Go to https://platform.deepseek.com/
2. **Sign Up**: Create a free account (no credit card required)
3. **Get API Key**: 
   - Navigate to "API Keys" section
   - Click "Create API Key"
   - Copy the generated key

4. **Add to .env.local**:
   ```bash
   DEEPSEEK_API_KEY=your-key-here
   ```

5. **Restart Dev Server**:
   ```bash
   npm run dev
   ```

## DeepSeek Features

- **Free Tier**: Generous free usage limits
- **Model**: `deepseek-chat` (supports JSON mode)
- **Speed**: Fast inference for rating extraction
- **Compatibility**: Works with AI SDK via OpenAI-compatible API

## Fallback Behavior

If `DEEPSEEK_API_KEY` is not configured:
- ✅ API still works
- ⚠️ LLM extraction is skipped
- 📊 Only manual pattern matching is used
- 💡 Lower accuracy for complex rating formats

## Testing

Test with a company query:
```bash
curl "http://localhost:3000/api/ratings-v2?q=Microsoft"
```

Check logs for:
- `⚠️ No DeepSeek API key configured` (without key)
- `🤖 LLM extraction result` (with key)
