"""LLM client for credit score extraction using multiple providers."""

import json
from typing import Any, Dict, Optional, Union
from abc import ABC, abstractmethod

from groq import AsyncGroq
import google.generativeai as genai
from langchain_groq import ChatGroq
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.output_parsers import JsonOutputParser
from pydantic import BaseModel, Field, validator
from tenacity import retry, stop_after_attempt, wait_exponential

from app.core.config import get_settings
from app.core.logging import get_logger

logger = get_logger(__name__)


class CreditScoreData(BaseModel):
    """Structured credit score data extracted from web pages."""

    score: Optional[float] = Field(None, description="The credit score value")
    score_range_min: float = Field(0, description="Minimum possible score")
    score_range_max: float = Field(100, description="Maximum possible score")
    last_updated: Optional[str] = Field(None, description="Date of last update (ISO format)")
    classification: Optional[str] = Field(None, description="Risk classification (low/medium/high/excellent)")
    rating: Optional[str] = Field(None, description="Letter rating (AAA, BB+, etc.)")
    outlook: Optional[str] = Field(None, description="Outlook (stable/positive/negative)")
    source: Optional[str] = Field(None, description="Source of the rating")
    company_name: Optional[str] = Field(None, description="Company name")
    company_identifier: Optional[str] = Field(None, description="CNPJ, tax ID, or other identifier")
    confidence: float = Field(0.0, description="Confidence score of extraction (0-1)")
    extraction_notes: Optional[str] = Field(None, description="Notes about extraction")

    @validator('score')
    def validate_score(cls, v, values):
        """Validate score is within range."""
        if v is not None:
            min_val = values.get('score_range_min', 0)
            max_val = values.get('score_range_max', 100)
            if not min_val <= v <= max_val:
                raise ValueError(f"Score {v} is outside range [{min_val}, {max_val}]")
        return v

    @validator('confidence')
    def validate_confidence(cls, v):
        """Validate confidence is between 0 and 1."""
        if not 0 <= v <= 1:
            raise ValueError(f"Confidence {v} must be between 0 and 1")
        return v


class BaseLLMClient(ABC):
    """Base class for LLM clients."""

    def __init__(self):
        self.settings = get_settings()
        self.parser = JsonOutputParser(pydantic_object=CreditScoreData)

    @abstractmethod
    async def extract_credit_score(self, html_content: str, url: str) -> CreditScoreData:
        """Extract credit score from HTML content."""
        pass

    def _create_prompt(self, html_content: str, url: str) -> str:
        """Create extraction prompt for LLM."""
        return f"""You are an expert at extracting credit score information from web pages.

Analyze the following HTML content from {url} and extract credit score information.

Instructions:
1. Look for numerical credit scores, ratings, or risk assessments
2. Identify the scoring scale (e.g., 0-100, 0-1000, letter grades)
3. Find the date of last update if available
4. Extract risk classification (low/medium/high/excellent)
5. Look for company identifiers (CNPJ, tax ID, registration numbers)
6. Identify the rating agency or source
7. Extract outlook information (stable, positive, negative)
8. Note any letter ratings (AAA, BB+, Ba2, etc.)

Important patterns to look for:
- Credit score, rating, risk score, credit rating
- Numbers followed by scoring context
- Date patterns near scores
- Company names and identifiers
- Rating scales and classifications
- Terms like "outlook", "watch", "stable", "positive", "negative"

HTML Content (truncated to 10000 chars):
{html_content[:10000]}

Return a JSON object with the extracted information following this exact schema:
{self.parser.get_format_instructions()}

If you cannot find certain information, use null for those fields.
Set confidence based on how certain you are about the extraction (0-1).
Add extraction_notes if there are ambiguities or important context.
"""


class GroqLLMClient(BaseLLMClient):
    """Groq LLM client for credit score extraction."""

    def __init__(self):
        super().__init__()
        if not self.settings.groq_api_key:
            raise ValueError("GROQ_API_KEY is required for Groq LLM client")

        self.client = ChatGroq(
            api_key=self.settings.groq_api_key,
            model=self.settings.llm_model,
            temperature=self.settings.llm_temperature,
            max_tokens=self.settings.llm_max_tokens,
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def extract_credit_score(self, html_content: str, url: str) -> CreditScoreData:
        """Extract credit score using Groq LLM."""
        try:
            prompt = self._create_prompt(html_content, url)

            messages = [
                SystemMessage(content="You are a credit score extraction expert. Always return valid JSON."),
                HumanMessage(content=prompt)
            ]

            response = await self.client.ainvoke(messages)

            # Parse response
            try:
                result = self.parser.parse(response.content)
                logger.info(
                    "groq_extraction_success",
                    url=url,
                    score=result.score,
                    confidence=result.confidence,
                )
                return result
            except Exception as parse_error:
                logger.error(
                    "groq_parsing_error",
                    error=str(parse_error),
                    response=response.content,
                )
                # Return empty result with low confidence
                return CreditScoreData(
                    confidence=0.1,
                    extraction_notes=f"Failed to parse LLM response: {str(parse_error)}"
                )

        except Exception as e:
            logger.error("groq_extraction_error", error=str(e), url=url)
            raise


class GeminiLLMClient(BaseLLMClient):
    """Google Gemini LLM client for credit score extraction."""

    def __init__(self):
        super().__init__()
        if not self.settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is required for Gemini LLM client")

        self.client = ChatGoogleGenerativeAI(
            google_api_key=self.settings.gemini_api_key,
            model="gemini-1.5-flash",
            temperature=self.settings.llm_temperature,
            max_output_tokens=self.settings.llm_max_tokens,
        )

    @retry(
        stop=stop_after_attempt(3),
        wait=wait_exponential(multiplier=1, min=2, max=10),
        reraise=True,
    )
    async def extract_credit_score(self, html_content: str, url: str) -> CreditScoreData:
        """Extract credit score using Gemini LLM."""
        try:
            prompt = self._create_prompt(html_content, url)

            messages = [
                SystemMessage(content="You are a credit score extraction expert. Always return valid JSON."),
                HumanMessage(content=prompt)
            ]

            response = await self.client.ainvoke(messages)

            # Parse response
            try:
                result = self.parser.parse(response.content)
                logger.info(
                    "gemini_extraction_success",
                    url=url,
                    score=result.score,
                    confidence=result.confidence,
                )
                return result
            except Exception as parse_error:
                logger.error(
                    "gemini_parsing_error",
                    error=str(parse_error),
                    response=response.content,
                )
                # Return empty result with low confidence
                return CreditScoreData(
                    confidence=0.1,
                    extraction_notes=f"Failed to parse LLM response: {str(parse_error)}"
                )

        except Exception as e:
            logger.error("gemini_extraction_error", error=str(e), url=url)
            raise


def get_llm_client() -> BaseLLMClient:
    """Factory function to get the appropriate LLM client based on configuration."""
    settings = get_settings()

    if settings.llm_provider == "groq":
        return GroqLLMClient()
    elif settings.llm_provider == "gemini":
        return GeminiLLMClient()
    else:
        raise ValueError(f"Unsupported LLM provider: {settings.llm_provider}")


class LLMCreditScoreExtractor:
    """Main class for extracting credit scores using LLM."""

    def __init__(self):
        self.client = get_llm_client()
        self.settings = get_settings()

    async def extract_from_html(
        self,
        html_content: str,
        url: str,
        company_hint: Optional[str] = None
    ) -> CreditScoreData:
        """
        Extract credit score from HTML content.

        Args:
            html_content: HTML content to analyze
            url: Source URL
            company_hint: Optional company name hint

        Returns:
            Extracted credit score data
        """
        # Clean HTML content
        html_content = self._clean_html(html_content)

        # Add company hint to content if provided
        if company_hint:
            html_content = f"Company: {company_hint}\n\n{html_content}"

        # Extract using LLM
        result = await self.client.extract_credit_score(html_content, url)

        # Post-process result
        result = self._post_process(result, url)

        return result

    def _clean_html(self, html_content: str) -> str:
        """Clean and simplify HTML content for LLM processing."""
        import html2text
        from bs4 import BeautifulSoup

        try:
            # Parse HTML
            soup = BeautifulSoup(html_content, 'html.parser')

            # Remove script and style elements
            for script in soup(["script", "style"]):
                script.decompose()

            # Convert to text while preserving structure
            h = html2text.HTML2Text()
            h.ignore_links = False
            h.ignore_images = True
            h.ignore_emphasis = False
            h.body_width = 0  # Don't wrap lines

            text = h.handle(str(soup))

            # Remove excessive whitespace
            lines = [line.strip() for line in text.split('\n')]
            text = '\n'.join(line for line in lines if line)

            return text

        except Exception as e:
            logger.warning("html_cleaning_error", error=str(e))
            return html_content

    def _post_process(self, result: CreditScoreData, url: str) -> CreditScoreData:
        """Post-process extraction results."""
        # Add source URL if not present
        if not result.source:
            result.source = url

        # Normalize classification
        if result.classification:
            classification_map = {
                'excellent': 'excellent',
                'good': 'good',
                'fair': 'medium',
                'poor': 'high',
                'very poor': 'high',
                'baixo': 'low',
                'medio': 'medium',
                'alto': 'high',
                'low': 'low',
                'medium': 'medium',
                'high': 'high',
            }
            result.classification = classification_map.get(
                result.classification.lower(),
                result.classification
            )

        # Normalize outlook
        if result.outlook:
            outlook_map = {
                'stable': 'stable',
                'positive': 'positive',
                'negative': 'negative',
                'developing': 'developing',
                'watch': 'watch',
                'estável': 'stable',
                'positivo': 'positive',
                'negativo': 'negative',
            }
            result.outlook = outlook_map.get(
                result.outlook.lower(),
                result.outlook
            )

        return result


class LLMClient:
    """Simple LLM client for text extraction."""

    def __init__(self):
        """Initialize LLM client."""
        self.settings = get_settings()
        self.client = None

        if self.settings.groq_api_key:
            from groq import Groq
            self.client = Groq(api_key=self.settings.groq_api_key)
            self.model = self.settings.llm_model or "llama3-8b-8192"
        else:
            logger.warning("no_llm_api_key", provider="groq")

    async def extract_text(self, prompt: str) -> str:
        """
        Extract text using LLM.

        Args:
            prompt: The prompt to send to LLM

        Returns:
            Extracted text response
        """
        if not self.client:
            return "[]"

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You are a helpful assistant that extracts information from text. Always respond with valid JSON."},
                    {"role": "user", "content": prompt}
                ],
                temperature=0.1,
                max_tokens=1000
            )

            return response.choices[0].message.content or "[]"

        except Exception as e:
            logger.error(
                "llm_extraction_error",
                error=str(e)
            )
            return "[]"
