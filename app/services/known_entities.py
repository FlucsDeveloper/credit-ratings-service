"""Known entities with hardcoded URLs for common companies."""

from typing import Optional
from app.models.enums import RatingAgency

# URLs conhecidas para empresas brasileiras famosas
KNOWN_ENTITIES = {
    "PETROBRAS": {
        RatingAgency.FITCH: "https://www.fitchratings.com/entity/petrobras-90883336",
        RatingAgency.SP: "https://www.spglobal.com/ratings/en/entity/petrobras/3040",
        RatingAgency.MOODYS: "https://ratings.moodys.com/ratings-and-research/company/00042400",
    },
    "VALE": {
        RatingAgency.FITCH: "https://www.fitchratings.com/entity/vale-s-a-80433508",
        RatingAgency.SP: "https://www.spglobal.com/ratings/en/entity/vale-sa/2990",
        RatingAgency.MOODYS: "https://ratings.moodys.com/ratings-and-research/company/00118100",
    },
    "AEGEA": {
        RatingAgency.FITCH: "https://www.fitchratings.com/entity/aegea-saneamento-e-participacoes-s-a-80706677",
        RatingAgency.SP: None,  # Não encontrado facilmente
        RatingAgency.MOODYS: None,
    },
}


def get_known_entity_url(company_name: str, agency: RatingAgency) -> Optional[str]:
    """
    Get known URL for a company if available.

    Args:
        company_name: Company name (normalized)
        agency: Rating agency

    Returns:
        URL if known, None otherwise
    """
    # Normalize company name (remove common suffixes, uppercase)
    normalized = company_name.upper()
    normalized = normalized.replace(" S.A.", "")
    normalized = normalized.replace(" S/A", "")
    normalized = normalized.replace(" SA", "")
    normalized = normalized.replace(".", "")
    normalized = normalized.strip()

    # Check for partial matches
    for key, urls in KNOWN_ENTITIES.items():
        if key in normalized or normalized in key:
            return urls.get(agency)

    return None
