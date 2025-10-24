"""Example usage of the Credit Ratings Service API."""

import asyncio

import httpx


async def get_ratings_example():
    """Example: Fetch ratings for a company."""
    async with httpx.AsyncClient() as client:
        # Request ratings
        response = await client.post(
            "http://localhost:8000/api/v1/ratings",
            json={
                "company_name": "Petrobras S.A.",
                "country": "BR",
                "prefer_exact_match": True,
            },
            timeout=60.0,  # Scraping can take time
        )

        if response.status_code == 200:
            data = response.json()

            print(f"\n{'='*60}")
            print(f"Credit Ratings for: {data['query']}")
            print(f"{'='*60}\n")

            # Resolved entity
            if data.get("resolved"):
                resolved = data["resolved"]
                print(f"Resolved Entity: {resolved['name']}")
                print(f"Confidence: {resolved['confidence']}")
                print(f"Source: {resolved.get('canonical_url', 'N/A')}\n")

            # Ratings by agency
            print("Ratings:\n")
            for agency, rating in data["ratings"].items():
                print(f"  {agency.upper()}:")

                if rating.get("blocked"):
                    print(f"    Status: BLOCKED")
                    print(f"    Reason: {rating.get('error', 'N/A')}")
                elif rating.get("error"):
                    print(f"    Status: ERROR")
                    print(f"    Error: {rating['error']}")
                elif rating.get("raw"):
                    print(f"    Rating: {rating['raw']}")
                    print(f"    Outlook: {rating.get('outlook', 'N/A')}")

                    if rating.get("normalized"):
                        norm = rating["normalized"]
                        print(f"    Bucket: {norm['bucket']}")
                        print(f"    Score: {norm['score']}/21")

                    print(f"    Source: {rating.get('source_url', 'N/A')}")
                else:
                    print(f"    Status: No rating found")

                print()

            # Notes
            if data.get("notes"):
                print("Notes:")
                for note in data["notes"]:
                    print(f"  - {note}")
                print()

            # Metadata
            print(f"Cached: {'Yes' if data.get('cached') else 'No'}")
            print(f"Timestamp: {data['timestamp']}")

        else:
            print(f"Error: HTTP {response.status_code}")
            print(response.text)


async def health_check_example():
    """Example: Check service health."""
    async with httpx.AsyncClient() as client:
        response = await client.get("http://localhost:8000/api/v1/health")
        print(f"Health Check: {response.json()}")


async def main():
    """Run examples."""
    print("Credit Ratings Service - Example Usage\n")

    # Health check
    print("1. Health Check")
    await health_check_example()
    print()

    # Get ratings
    print("2. Fetch Ratings")
    await get_ratings_example()


if __name__ == "__main__":
    asyncio.run(main())
