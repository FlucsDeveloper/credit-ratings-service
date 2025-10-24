"""Unit tests for LLM-based credit score extraction."""

import pytest
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from app.services.llm_client import CreditScoreData, LLMCreditScoreExtractor
from app.scrapers.llm_scraper import LLMScraper, UniversalLLMScraper
from app.models.enums import RatingAgency, Outlook
from app.models.schemas import AgencyRating


class TestCreditScoreData:
    """Tests for CreditScoreData validation."""

    def test_valid_credit_score_data(self):
        """Test creating valid credit score data."""
        data = CreditScoreData(
            score=75.5,
            score_range_min=0,
            score_range_max=100,
            last_updated="2025-01-15",
            classification="low",
            rating="BBB+",
            outlook="stable",
            source="Fitch Ratings",
            company_name="Test Corp",
            company_identifier="12345678901234",
            confidence=0.95,
            extraction_notes="Clean extraction"
        )

        assert data.score == 75.5
        assert data.classification == "low"
        assert data.rating == "BBB+"
        assert data.confidence == 0.95

    def test_score_validation(self):
        """Test score range validation."""
        # Valid score within range
        data = CreditScoreData(
            score=50,
            score_range_min=0,
            score_range_max=100,
            confidence=0.9
        )
        assert data.score == 50

        # Invalid score outside range
        with pytest.raises(ValueError, match="outside range"):
            CreditScoreData(
                score=150,
                score_range_min=0,
                score_range_max=100,
                confidence=0.9
            )

    def test_confidence_validation(self):
        """Test confidence score validation."""
        # Valid confidence
        data = CreditScoreData(confidence=0.5)
        assert data.confidence == 0.5

        # Invalid confidence > 1
        with pytest.raises(ValueError, match="between 0 and 1"):
            CreditScoreData(confidence=1.5)

        # Invalid confidence < 0
        with pytest.raises(ValueError, match="between 0 and 1"):
            CreditScoreData(confidence=-0.1)


class TestLLMCreditScoreExtractor:
    """Tests for LLMCreditScoreExtractor."""

    @pytest.fixture
    def extractor(self):
        """Create extractor instance with mocked LLM client."""
        with patch('app.services.llm_client.get_llm_client') as mock_get_client:
            mock_client = MagicMock()
            mock_get_client.return_value = mock_client
            extractor = LLMCreditScoreExtractor()
            extractor.client = mock_client
            return extractor

    @pytest.mark.asyncio
    async def test_extract_from_html(self, extractor):
        """Test HTML extraction."""
        # Mock LLM response
        mock_response = CreditScoreData(
            score=85.0,
            score_range_min=0,
            score_range_max=100,
            rating="A+",
            outlook="stable",
            confidence=0.9,
            company_name="Test Company"
        )

        extractor.client.extract_credit_score = AsyncMock(return_value=mock_response)

        # Test extraction
        html_content = "<html><body>Credit Score: 85/100</body></html>"
        url = "https://example.com/ratings"

        result = await extractor.extract_from_html(html_content, url)

        assert result.score == 85.0
        assert result.rating == "A+"
        assert result.source == url

    def test_clean_html(self, extractor):
        """Test HTML cleaning."""
        html_content = """
        <html>
            <head>
                <script>console.log('test');</script>
                <style>body { color: red; }</style>
            </head>
            <body>
                <h1>Credit Rating</h1>
                <p>Score: 750</p>
                <script>alert('test');</script>
            </body>
        </html>
        """

        cleaned = extractor._clean_html(html_content)

        # Check scripts and styles are removed
        assert 'console.log' not in cleaned
        assert 'alert' not in cleaned
        assert 'color: red' not in cleaned

        # Check content is preserved
        assert 'Credit Rating' in cleaned
        assert 'Score: 750' in cleaned

    def test_post_process(self, extractor):
        """Test result post-processing."""
        # Test classification normalization
        result = CreditScoreData(
            classification="EXCELLENT",
            outlook="Positive",
            confidence=0.8
        )

        processed = extractor._post_process(result, "https://example.com")

        assert processed.classification == "excellent"
        assert processed.outlook == "positive"
        assert processed.source == "https://example.com"


class TestLLMScraper:
    """Tests for LLMScraper."""

    @pytest.fixture
    def scraper(self):
        """Create LLMScraper instance."""
        with patch('app.scrapers.llm_scraper.LLMCreditScoreExtractor'):
            return LLMScraper(RatingAgency.FITCH)

    def test_domain_property(self, scraper):
        """Test domain property for different agencies."""
        fitch_scraper = LLMScraper(RatingAgency.FITCH)
        assert fitch_scraper.domain == "www.fitchratings.com"

        sp_scraper = LLMScraper(RatingAgency.SP)
        assert sp_scraper.domain == "www.spglobal.com"

        moodys_scraper = LLMScraper(RatingAgency.MOODYS)
        assert moodys_scraper.domain == "www.moodys.com"

    def test_is_allowed_property(self):
        """Test scraping permission check."""
        with patch('app.scrapers.llm_scraper.get_settings') as mock_settings:
            mock_settings.return_value.scraping_allowed_fitch = True
            mock_settings.return_value.scraping_allowed_sp = False

            fitch_scraper = LLMScraper(RatingAgency.FITCH)
            sp_scraper = LLMScraper(RatingAgency.SP)

            assert fitch_scraper.is_allowed == True
            assert sp_scraper.is_allowed == False

    def test_score_to_rating_fitch(self, scraper):
        """Test score to rating conversion for Fitch."""
        scraper.agency = RatingAgency.FITCH

        # Test various scores
        assert scraper._score_to_rating(98, 0, 100) == "AAA"
        assert scraper._score_to_rating(75, 0, 100) == "A+"
        assert scraper._score_to_rating(50, 0, 100) == "BBB-"
        assert scraper._score_to_rating(25, 0, 100) == "B"
        assert scraper._score_to_rating(2, 0, 100) == "D"

    def test_score_to_rating_moodys(self, scraper):
        """Test score to rating conversion for Moody's."""
        scraper.agency = RatingAgency.MOODYS

        # Test various scores
        assert scraper._score_to_rating(98, 0, 100) == "Aaa"
        assert scraper._score_to_rating(75, 0, 100) == "A1"
        assert scraper._score_to_rating(50, 0, 100) == "Baa3"
        assert scraper._score_to_rating(25, 0, 100) == "B2"
        assert scraper._score_to_rating(2, 0, 100) == "C"

    def test_convert_to_agency_rating(self, scraper):
        """Test conversion from CreditScoreData to AgencyRating."""
        extraction = CreditScoreData(
            rating="BBB+",
            outlook="stable",
            last_updated="2025-01-15",
            confidence=0.9,
            extraction_notes="Test extraction"
        )

        result = scraper._convert_to_agency_rating(extraction, "https://example.com")

        assert result.raw == "BBB+"
        assert result.outlook == Outlook.STABLE
        assert result.source_url == "https://example.com"
        assert result.blocked == False
        assert result.error is None

    def test_convert_to_agency_rating_low_confidence(self, scraper):
        """Test conversion with low confidence score."""
        extraction = CreditScoreData(
            rating="BBB+",
            confidence=0.3,
            extraction_notes="Uncertain extraction"
        )

        result = scraper._convert_to_agency_rating(extraction, "https://example.com")

        assert result.raw == "BBB+"
        assert "Low confidence" in result.error
        assert "Uncertain extraction" in result.error

    @pytest.mark.asyncio
    async def test_scrape_not_allowed(self, scraper):
        """Test scraping when not allowed."""
        scraper.is_allowed = False

        result = await scraper.scrape("https://example.com")

        assert result.blocked == True
        assert "not allowed" in result.error
        assert result.raw is None

    @pytest.mark.asyncio
    async def test_scrape_rate_limited(self, scraper):
        """Test scraping when rate limited."""
        scraper.is_allowed = True
        scraper._check_rate_limit = AsyncMock(return_value=(False, "Rate limit exceeded"))

        result = await scraper.scrape("https://example.com")

        assert result.blocked == True
        assert "Rate limited" in result.error
        assert result.raw is None


class TestUniversalLLMScraper:
    """Tests for UniversalLLMScraper."""

    @pytest.fixture
    def scraper(self):
        """Create UniversalLLMScraper instance."""
        with patch('app.scrapers.llm_scraper.LLMCreditScoreExtractor'):
            return UniversalLLMScraper()

    @pytest.mark.asyncio
    async def test_scrape_url_success(self, scraper):
        """Test successful URL scraping."""
        mock_result = CreditScoreData(
            score=800,
            score_range_min=300,
            score_range_max=850,
            rating="Excellent",
            confidence=0.95
        )

        scraper.llm_extractor.extract_from_html = AsyncMock(return_value=mock_result)

        # Mock browser interaction
        with patch('app.scrapers.llm_scraper.async_playwright') as mock_playwright:
            mock_page = AsyncMock()
            mock_page.goto = AsyncMock(return_value=MagicMock(status=200))
            mock_page.content = AsyncMock(return_value="<html>Score: 800</html>")

            mock_browser = AsyncMock()
            mock_browser.new_page = AsyncMock(return_value=mock_page)

            mock_chromium = AsyncMock()
            mock_chromium.launch = AsyncMock(return_value=mock_browser)

            mock_pw_instance = AsyncMock()
            mock_pw_instance.chromium = mock_chromium
            mock_pw_instance.start = AsyncMock(return_value=mock_pw_instance)

            mock_playwright.return_value = mock_pw_instance

            result = await scraper.scrape_url("https://example.com", "Test Company")

            assert result.score == 800
            assert result.rating == "Excellent"
            assert result.confidence == 0.95

    @pytest.mark.asyncio
    async def test_scrape_url_with_selector(self, scraper):
        """Test scraping with wait selector."""
        mock_result = CreditScoreData(confidence=0.8)

        scraper.llm_extractor.extract_from_html = AsyncMock(return_value=mock_result)

        with patch('app.scrapers.llm_scraper.async_playwright') as mock_playwright:
            mock_page = AsyncMock()
            mock_page.goto = AsyncMock(return_value=MagicMock(status=200))
            mock_page.wait_for_selector = AsyncMock()
            mock_page.content = AsyncMock(return_value="<html>Content</html>")

            mock_browser = AsyncMock()
            mock_browser.new_page = AsyncMock(return_value=mock_page)

            mock_chromium = AsyncMock()
            mock_chromium.launch = AsyncMock(return_value=mock_browser)

            mock_pw_instance = AsyncMock()
            mock_pw_instance.chromium = mock_chromium
            mock_pw_instance.start = AsyncMock(return_value=mock_pw_instance)

            mock_playwright.return_value = mock_pw_instance

            result = await scraper.scrape_url(
                "https://example.com",
                wait_selector=".credit-score"
            )

            mock_page.wait_for_selector.assert_called_once_with(
                ".credit-score",
                timeout=5000,
                state="visible"
            )

    @pytest.mark.asyncio
    async def test_scrape_url_http_error(self, scraper):
        """Test handling of HTTP errors."""
        with patch('app.scrapers.llm_scraper.async_playwright') as mock_playwright:
            mock_page = AsyncMock()
            mock_page.goto = AsyncMock(return_value=MagicMock(status=404))

            mock_browser = AsyncMock()
            mock_browser.new_page = AsyncMock(return_value=mock_page)

            mock_chromium = AsyncMock()
            mock_chromium.launch = AsyncMock(return_value=mock_browser)

            mock_pw_instance = AsyncMock()
            mock_pw_instance.chromium = mock_chromium
            mock_pw_instance.start = AsyncMock(return_value=mock_pw_instance)

            mock_playwright.return_value = mock_pw_instance

            result = await scraper.scrape_url("https://example.com")

            assert result.confidence == 0.0
            assert "HTTP 404" in result.extraction_notes