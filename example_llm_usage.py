"""Example usage of the LLM-based credit score extraction API."""

import asyncio
import json
from typing import Optional, Dict, Any
import httpx
from datetime import datetime


class CreditScoreExtractor:
    """Client for the LLM-based credit score extraction API."""

    def __init__(self, base_url: str = "http://localhost:8000"):
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=60.0)

    async def extract_from_url(
        self,
        url: str,
        company_name: Optional[str] = None,
        wait_selector: Optional[str] = None
    ) -> Dict[str, Any]:
        """
        Extract credit score from a single URL.

        Args:
            url: Target URL to extract from
            company_name: Optional company name for better extraction
            wait_selector: Optional CSS selector to wait for

        Returns:
            Extraction result with credit score data
        """
        payload = {"url": url}
        if company_name:
            payload["company_name"] = company_name
        if wait_selector:
            payload["wait_selector"] = wait_selector

        response = await self.client.post(
            f"{self.base_url}/api/v2/extract",
            json=payload
        )
        response.raise_for_status()
        return response.json()

    async def extract_multi_source(
        self,
        company_name: str,
        urls: Optional[Dict[str, str]] = None,
        sources: Optional[list] = None
    ) -> Dict[str, Any]:
        """
        Extract credit scores from multiple sources.

        Args:
            company_name: Company name to search for
            urls: Optional URLs for each source
            sources: List of sources to query

        Returns:
            Multi-source extraction results
        """
        payload = {"company_name": company_name}

        if sources:
            payload["sources"] = sources
        else:
            payload["sources"] = ["fitch", "sp", "moodys"]

        if urls:
            payload["urls"] = urls

        response = await self.client.post(
            f"{self.base_url}/api/v2/extract/multi",
            json=payload
        )
        response.raise_for_status()
        return response.json()

    async def close(self):
        """Close HTTP client."""
        await self.client.aclose()


def print_score_data(data: Dict[str, Any], source: str = ""):
    """Pretty print credit score data."""
    prefix = f"[{source}] " if source else ""

    print(f"\n{prefix}Credit Score Information:")
    print("=" * 50)

    if data.get("score") is not None:
        print(f"Score: {data['score']} (Range: {data.get('score_range_min', 0)}-{data.get('score_range_max', 100)})")

    if data.get("rating"):
        print(f"Rating: {data['rating']}")

    if data.get("outlook"):
        print(f"Outlook: {data['outlook']}")

    if data.get("classification"):
        print(f"Classification: {data['classification']}")

    if data.get("last_updated"):
        print(f"Last Updated: {data['last_updated']}")

    if data.get("company_name"):
        print(f"Company: {data['company_name']}")

    if data.get("company_identifier"):
        print(f"Identifier: {data['company_identifier']}")

    if data.get("confidence"):
        confidence_pct = data['confidence'] * 100
        print(f"Confidence: {confidence_pct:.1f}%")

    if data.get("extraction_notes"):
        print(f"Notes: {data['extraction_notes']}")


async def example_single_extraction():
    """Example: Extract from a single URL."""
    print("\n" + "="*60)
    print("EXAMPLE 1: Single URL Extraction")
    print("="*60)

    extractor = CreditScoreExtractor()

    try:
        # Example with Fitch Ratings
        result = await extractor.extract_from_url(
            url="https://www.fitchratings.com/entity/petrobras",
            company_name="Petrobras S.A."
        )

        if result["success"]:
            print("\n✅ Extraction successful!")
            print_score_data(result["data"])
        else:
            print(f"\n❌ Extraction failed: {result.get('error', 'Unknown error')}")

    finally:
        await extractor.close()


async def example_multi_source_extraction():
    """Example: Extract from multiple sources."""
    print("\n" + "="*60)
    print("EXAMPLE 2: Multi-Source Extraction")
    print("="*60)

    extractor = CreditScoreExtractor()

    try:
        # Extract from multiple rating agencies
        result = await extractor.extract_multi_source(
            company_name="Petrobras S.A.",
            urls={
                "fitch": "https://www.fitchratings.com/entity/petrobras",
                "sp": "https://www.spglobal.com/ratings/en/research/petrobras",
                "moodys": "https://www.moodys.com/credit-ratings/Petrobras"
            }
        )

        print(f"\nCompany: {result['company']}")
        print(f"Timestamp: {result['timestamp']}")

        # Print individual scores
        for source, data in result["scores"].items():
            if data.get("confidence", 0) > 0:
                print_score_data(data, source.upper())

        # Print summary
        if result.get("summary"):
            print("\n📊 Summary Statistics:")
            print("=" * 50)
            summary = result["summary"]
            print(f"Sources checked: {summary.get('sources_checked', 0)}")
            print(f"Sources with data: {summary.get('sources_with_data', 0)}")
            print(f"Average confidence: {summary.get('average_confidence', 0):.2%}")

            if summary.get("ratings"):
                print(f"Ratings found: {', '.join(summary['ratings'])}")

            if summary.get("consensus_outlook"):
                print(f"Consensus outlook: {summary['consensus_outlook']}")

    finally:
        await extractor.close()


async def example_brazilian_companies():
    """Example: Extract scores for Brazilian companies."""
    print("\n" + "="*60)
    print("EXAMPLE 3: Brazilian Companies")
    print("="*60)

    extractor = CreditScoreExtractor()

    companies = [
        {
            "name": "Petrobras",
            "urls": {
                "fitch": "https://www.fitchratings.com/entity/petrobras",
                "moodys": "https://www.moodys.com/credit-ratings/Petrobras"
            }
        },
        {
            "name": "Vale S.A.",
            "urls": {
                "fitch": "https://www.fitchratings.com/entity/vale",
                "sp": "https://www.spglobal.com/ratings/en/research/vale"
            }
        },
        {
            "name": "Itaú Unibanco",
            "urls": {
                "fitch": "https://www.fitchratings.com/entity/itau-unibanco",
                "moodys": "https://www.moodys.com/credit-ratings/Itau-Unibanco"
            }
        }
    ]

    try:
        for company_info in companies:
            print(f"\n🏢 Processing: {company_info['name']}")
            print("-" * 40)

            result = await extractor.extract_multi_source(
                company_name=company_info["name"],
                urls=company_info["urls"]
            )

            # Show summary for each company
            summary = result.get("summary", {})
            if summary.get("ratings"):
                print(f"Ratings: {', '.join(summary['ratings'])}")
            if summary.get("consensus_outlook"):
                print(f"Outlook: {summary['consensus_outlook']}")
            if summary.get("average_confidence"):
                print(f"Confidence: {summary['average_confidence']:.1%}")

    finally:
        await extractor.close()


async def example_custom_website():
    """Example: Extract from a custom/non-standard website."""
    print("\n" + "="*60)
    print("EXAMPLE 4: Custom Website Extraction")
    print("="*60)

    extractor = CreditScoreExtractor()

    try:
        # This demonstrates extraction from any website
        # The LLM will attempt to find credit score information
        result = await extractor.extract_from_url(
            url="https://example-credit-site.com/company/abc-corp",
            company_name="ABC Corporation",
            wait_selector=".rating-container"  # Optional: wait for specific element
        )

        if result["success"]:
            print("\n✅ Custom extraction successful!")
            print_score_data(result["data"])

            # Show how to handle low confidence
            if result["data"]["confidence"] < 0.5:
                print("\n⚠️ Warning: Low confidence extraction")
                print("Consider manual verification of the data")

        else:
            print(f"\n❌ Extraction failed: {result.get('error', 'Unknown error')}")

    except httpx.HTTPStatusError as e:
        print(f"\n❌ HTTP Error: {e.response.status_code}")
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")

    finally:
        await extractor.close()


async def example_batch_processing():
    """Example: Batch process multiple companies efficiently."""
    print("\n" + "="*60)
    print("EXAMPLE 5: Batch Processing")
    print("="*60)

    extractor = CreditScoreExtractor()

    # List of companies to process
    companies = [
        ("Petrobras", "https://www.fitchratings.com/entity/petrobras"),
        ("Vale", "https://www.fitchratings.com/entity/vale"),
        ("Embraer", "https://www.fitchratings.com/entity/embraer"),
    ]

    try:
        # Process all companies concurrently
        tasks = [
            extractor.extract_from_url(url, company_name)
            for company_name, url in companies
        ]

        results = await asyncio.gather(*tasks, return_exceptions=True)

        # Process results
        for (company_name, _), result in zip(companies, results):
            print(f"\n🏢 {company_name}:")
            print("-" * 30)

            if isinstance(result, Exception):
                print(f"❌ Error: {str(result)}")
            elif result.get("success"):
                data = result["data"]
                if data.get("rating"):
                    print(f"Rating: {data['rating']}")
                if data.get("outlook"):
                    print(f"Outlook: {data['outlook']}")
                print(f"Confidence: {data.get('confidence', 0):.1%}")
            else:
                print(f"❌ Failed: {result.get('error', 'Unknown error')}")

    finally:
        await extractor.close()


def main():
    """Run all examples."""
    print("""
    ╔════════════════════════════════════════════════════════╗
    ║     LLM-Based Credit Score Extraction Examples        ║
    ╚════════════════════════════════════════════════════════╝

    This script demonstrates various ways to use the LLM-based
    credit score extraction API.

    Prerequisites:
    1. Service running: docker-compose up
    2. Valid API keys in .env file
    3. Internet connection for web scraping
    """)

    # Run examples
    asyncio.run(example_single_extraction())
    asyncio.run(example_multi_source_extraction())
    asyncio.run(example_brazilian_companies())
    # asyncio.run(example_custom_website())  # Uncomment with real URL
    asyncio.run(example_batch_processing())

    print("\n" + "="*60)
    print("✅ All examples completed!")
    print("="*60)


if __name__ == "__main__":
    main()