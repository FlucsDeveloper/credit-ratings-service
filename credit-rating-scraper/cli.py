#!/usr/bin/env python3
"""
CLI wrapper for the Credit Ratings Service.
Uses the existing FastAPI microservice backend.
"""

import asyncio
import json
import sys
from datetime import datetime
from typing import Optional

import aiohttp


API_URL = "http://localhost:8000/api/v1"


async def get_ratings(company_name: str, country: str = "BR") -> dict:
    """
    Get credit ratings for a company from all agencies.
    
    Args:
        company_name: Company legal name
        country: ISO country code (default: BR)
        
    Returns:
        Dictionary with ratings from all agencies
    """
    async with aiohttp.ClientSession() as session:
        try:
            async with session.post(
                f"{API_URL}/ratings",
                json={
                    "company_name": company_name,
                    "country": country,
                    "prefer_exact_match": True
                },
                timeout=aiohttp.ClientTimeout(total=180)
            ) as response:
                if response.status == 200:
                    return await response.json()
                else:
                    error_text = await response.text()
                    return {
                        "error": f"API returned {response.status}: {error_text}",
                        "query": company_name
                    }
        except aiohttp.ClientConnectorError:
            return {
                "error": "Could not connect to API. Make sure the backend is running on http://localhost:8000",
                "query": company_name
            }
        except asyncio.TimeoutError:
            return {
                "error": "Request timed out after 180 seconds",
                "query": company_name
            }


def format_output(data: dict) -> str:
    """Format the API response for CLI display."""
    if "error" in data and not data.get("ratings"):
        return f"❌ Error: {data['error']}"
    
    lines = []
    lines.append(f"\n{'='*80}")
    lines.append(f"🔍 Credit Ratings for: {data['query']}")
    lines.append(f"{'='*80}\n")
    
    # Resolved entity info
    if data.get("resolved"):
        resolved = data["resolved"]
        lines.append(f"✅ Resolved Entity: {resolved['name']}")
        lines.append(f"   Confidence: {resolved['confidence']:.0%}")
        if resolved.get("country"):
            lines.append(f"   Country: {resolved['country']}")
        if resolved.get("ambiguous_candidates"):
            lines.append(f"   Alternative matches: {len(resolved['ambiguous_candidates'])}")
        lines.append("")
    
    # Ratings by agency
    ratings = data.get("ratings", {})
    
    for agency_name, rating_data in ratings.items():
        agency_display = agency_name.upper()
        lines.append(f"📊 {agency_display}")
        lines.append(f"   {'-'*70}")
        
        if rating_data.get("error"):
            lines.append(f"   ❌ Error: {rating_data['error']}")
        elif rating_data.get("blocked"):
            lines.append(f"   🚫 Blocked: Access denied or rate limited")
        elif rating_data.get("raw"):
            lines.append(f"   Rating: {rating_data['raw']}")
            
            if rating_data.get("outlook"):
                lines.append(f"   Outlook: {rating_data['outlook']}")
            
            if rating_data.get("normalized"):
                norm = rating_data["normalized"]
                lines.append(f"   Score: {norm['score']}/21 ({norm['bucket']})")
                lines.append(f"   Scale: {norm['scale']}")
            
            if rating_data.get("last_updated"):
                lines.append(f"   Updated: {rating_data['last_updated']}")
            
            if rating_data.get("source_url"):
                lines.append(f"   Source: {rating_data['source_url'][:70]}...")
        else:
            lines.append(f"   ℹ️  No rating found")
        
        lines.append("")
    
    # Notes
    if data.get("notes"):
        lines.append(f"📝 Notes:")
        for note in data["notes"]:
            lines.append(f"   • {note}")
        lines.append("")
    
    # Metadata
    lines.append(f"⏱️  Timestamp: {data.get('timestamp', 'N/A')}")
    if data.get("cached"):
        lines.append(f"💾 Cached: Yes")
    
    lines.append(f"{'='*80}\n")
    
    return "\n".join(lines)


async def main():
    """Main CLI entry point."""
    if len(sys.argv) < 2:
        print("Usage: python cli.py <COMPANY_NAME> [COUNTRY_CODE]")
        print("\nExamples:")
        print("  python cli.py 'AEGEA SANEAMENTO'")
        print("  python cli.py 'PETROBRAS' BR")
        print("  python cli.py 'VALE S.A.' BR")
        sys.exit(1)
    
    company_name = sys.argv[1]
    country = sys.argv[2] if len(sys.argv) > 2 else "BR"
    
    print(f"\n🔄 Fetching credit ratings for '{company_name}' ({country})...")
    print("   This may take up to 3 minutes on first request...\n")
    
    result = await get_ratings(company_name, country)
    
    # Print formatted output
    print(format_output(result))
    
    # Optionally save JSON
    if "--json" in sys.argv:
        filename = f"ratings_{company_name.replace(' ', '_')}_{datetime.now().strftime('%Y%m%d_%H%M%S')}.json"
        with open(filename, "w", encoding="utf-8") as f:
            json.dump(result, f, indent=2, ensure_ascii=False)
        print(f"💾 JSON saved to: {filename}\n")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print("\n\n⚠️  Interrupted by user")
        sys.exit(0)
    except Exception as e:
        print(f"\n❌ Unexpected error: {e}")
        sys.exit(1)
