#!/usr/bin/env python3
"""Script de debug para investigar estrutura HTML das agências."""

import asyncio
from playwright.async_api import async_playwright


async def debug_page(url: str, name: str):
    """Debug a page structure."""
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=False)
        page = await browser.new_page()

        await page.set_extra_http_headers({
            "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36",
            "Accept-Language": "en-US,en;q=0.9",
        })

        print(f"\n{'='*80}")
        print(f"Debugging: {name}")
        print(f"URL: {url}")
        print(f"{'='*80}\n")

        try:
            response = await page.goto(url, timeout=30000)
            print(f"Status: {response.status}")

            # Wait for page to load
            await page.wait_for_timeout(3000)

            # Save HTML
            html = await page.content()
            filename = f"/tmp/{name.lower().replace(' ', '_')}_debug.html"
            with open(filename, 'w', encoding='utf-8') as f:
                f.write(html)
            print(f"HTML saved to: {filename}")

            # Try to find rating elements
            print("\n--- Looking for rating elements ---")

            # Common selectors
            selectors = [
                "div.rating",
                "span.rating",
                ".rating-value",
                "[data-rating]",
                "td:contains('Rating')",
                "div:contains('IDR')",
                "div:contains('Issuer')",
            ]

            for selector in selectors:
                try:
                    elements = await page.query_selector_all(selector)
                    if elements:
                        print(f"✓ Found {len(elements)} elements with selector: {selector}")
                        for i, elem in enumerate(elements[:3]):
                            text = await elem.text_content()
                            if text and len(text.strip()) > 0:
                                print(f"  [{i}] {text.strip()[:100]}")
                except Exception as e:
                    pass

            # Search for common rating patterns in text
            print("\n--- Searching for rating patterns in page text ---")
            page_text = await page.inner_text("body")

            import re
            # S&P/Fitch pattern
            sp_fitch_pattern = r'\b(AAA|AA[+-]?|A[+-]?|BBB[+-]?|BB[+-]?|B[+-]?|CCC[+-]?|CC|C|D)\b'
            # Moody's pattern
            moodys_pattern = r'\b(Aaa|Aa[1-3]|A[1-3]|Baa[1-3]|Ba[1-3]|B[1-3]|Caa[1-3]|Ca|C)\b'

            sp_fitch_matches = re.findall(sp_fitch_pattern, page_text)
            moodys_matches = re.findall(moodys_pattern, page_text)

            if sp_fitch_matches:
                print(f"S&P/Fitch rating patterns found: {set(sp_fitch_matches)}")
            if moodys_matches:
                print(f"Moody's rating patterns found: {set(moodys_matches)}")

            # Keep browser open for manual inspection
            print("\n--- Browser kept open for 30 seconds for manual inspection ---")
            await page.wait_for_timeout(30000)

        except Exception as e:
            print(f"Error: {e}")

        finally:
            await browser.close()


async def main():
    """Main debug function."""
    # Test URLs
    urls = [
        ("https://www.fitchratings.com/entity/petrobras-90883336", "Fitch Petrobras"),
        ("https://www.spglobal.com/ratings/en/entity/petrobras/3040", "S&P Petrobras"),
        ("https://ratings.moodys.com/ratings-and-research/company/00042400", "Moodys Petrobras"),
    ]

    for url, name in urls:
        await debug_page(url, name)
        print("\n\nPress Enter to continue to next page...")
        # input()


if __name__ == "__main__":
    asyncio.run(main())
