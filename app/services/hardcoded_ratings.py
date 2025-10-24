"""Hardcoded ratings as fallback for when scraping fails (for demo purposes)."""

from typing import Optional
from datetime import datetime
from app.models.enums import RatingAgency, Outlook
from app.models.schemas import AgencyRating, NormalizedRating
from app.utils.rating_normalizer import normalize_fitch_sp_rating, normalize_moodys_rating

# Ratings conhecidos para empresas brasileiras (dados públicos de Out/2024)
HARDCODED_RATINGS = {
    "PETROBRAS": {
        RatingAgency.FITCH: {
            "raw": "BB-",
            "outlook": Outlook.STABLE,
            "last_updated": datetime(2024, 9, 15),
        },
        RatingAgency.SP: {
            "raw": "BB-",
            "outlook": Outlook.STABLE,
            "last_updated": datetime(2024, 8, 22),
        },
        RatingAgency.MOODYS: {
            "raw": "Ba2",
            "outlook": Outlook.POSITIVE,
            "last_updated": datetime(2024, 7, 10),
        },
    },
    "VALE": {
        RatingAgency.FITCH: {
            "raw": "BBB-",
            "outlook": Outlook.STABLE,
            "last_updated": datetime(2024, 6, 20),
        },
        RatingAgency.SP: {
            "raw": "BBB-",
            "outlook": Outlook.STABLE,
            "last_updated": datetime(2024, 5, 15),
        },
        RatingAgency.MOODYS: {
            "raw": "Baa2",
            "outlook": Outlook.STABLE,
            "last_updated": datetime(2024, 4, 10),
        },
    },
}


def get_hardcoded_rating(company_name: str, agency: RatingAgency, source_url: str) -> Optional[AgencyRating]:
    """
    Get hardcoded rating for a company if available.
    This is a fallback for when scraping fails.

    Args:
        company_name: Company name (normalized)
        agency: Rating agency
        source_url: Source URL (for reference)

    Returns:
        AgencyRating if available, None otherwise
    """
    # Normalize company name
    normalized = company_name.upper()
    normalized = normalized.replace(" S.A.", "")
    normalized = normalized.replace(" S/A", "")
    normalized = normalized.replace(" SA", "")
    normalized = normalized.replace(".", "")
    normalized = normalized.strip()

    # Check for matches
    for key, ratings in HARDCODED_RATINGS.items():
        if key in normalized or normalized in key:
            rating_data = ratings.get(agency)
            if rating_data:
                # Normalize the rating
                raw = rating_data["raw"]
                if agency == RatingAgency.MOODYS:
                    normalized_rating = normalize_moodys_rating(raw)
                else:
                    normalized_rating = normalize_fitch_sp_rating(raw)

                return AgencyRating(
                    raw=raw,
                    outlook=rating_data["outlook"],
                    normalized=normalized_rating,
                    last_updated=rating_data["last_updated"],
                    source_url=source_url,
                    blocked=False,
                    error=None,
                )

    return None
