"""Rating normalization utilities for converting between agency scales."""

from typing import Optional

from app.models.enums import RatingBucket, RatingScale
from app.models.schemas import NormalizedRating

# Fitch and S&P use the same scale
FITCH_SP_SCALE = {
    "AAA": 1,
    "AA+": 2,
    "AA": 3,
    "AA-": 4,
    "A+": 5,
    "A": 6,
    "A-": 7,
    "BBB+": 8,
    "BBB": 9,
    "BBB-": 10,
    "BB+": 11,
    "BB": 12,
    "BB-": 13,
    "B+": 14,
    "B": 15,
    "B-": 16,
    "CCC+": 17,
    "CCC": 17,
    "CCC-": 17,
    "CC": 18,
    "C": 19,
    "D": 21,
    "SD": 21,  # Selective Default (S&P)
    "RD": 21,  # Restricted Default (Fitch)
}

# Moody's scale
MOODYS_SCALE = {
    "Aaa": 1,
    "Aa1": 2,
    "Aa2": 3,
    "Aa3": 4,
    "A1": 5,
    "A2": 6,
    "A3": 7,
    "Baa1": 8,
    "Baa2": 9,
    "Baa3": 10,
    "Ba1": 11,
    "Ba2": 12,
    "Ba3": 13,
    "B1": 14,
    "B2": 15,
    "B3": 16,
    "Caa1": 17,
    "Caa2": 17,
    "Caa3": 17,
    "Ca": 18,
    "C": 19,
}

# Special notations that should be treated as "not rated"
NOT_RATED_VALUES = {"NR", "WR", "WD", "N/A", "NA", "WITHDRAWN", "NOT RATED"}


def get_rating_bucket(score: int) -> RatingBucket:
    """Determine rating bucket from numeric score."""
    if score <= 10:
        return RatingBucket.INVESTMENT_GRADE
    elif score <= 19:
        return RatingBucket.SPECULATIVE
    elif score == 21:
        return RatingBucket.DEFAULT
    else:
        return RatingBucket.NOT_RATED


def normalize_fitch_sp_rating(raw_rating: str) -> Optional[NormalizedRating]:
    """
    Normalize Fitch or S&P rating to standardized format.

    Args:
        raw_rating: Raw rating string (e.g., "AA-", "BBB+")

    Returns:
        NormalizedRating object or None if invalid/not rated
    """
    if not raw_rating:
        return None

    # Clean and uppercase
    rating = raw_rating.strip().upper()

    # Check for not rated
    if rating in NOT_RATED_VALUES:
        return None

    # Remove any suffixes like (local), (national), etc.
    rating = rating.split("(")[0].strip()

    # Look up in scale
    score = FITCH_SP_SCALE.get(rating)
    if score is None:
        return None

    return NormalizedRating(
        scale=RatingScale.FITCH_SP,
        score=score,
        bucket=get_rating_bucket(score),
    )


def normalize_moodys_rating(raw_rating: str) -> Optional[NormalizedRating]:
    """
    Normalize Moody's rating to standardized format.

    Args:
        raw_rating: Raw rating string (e.g., "Baa2", "Aa1")

    Returns:
        NormalizedRating object or None if invalid/not rated
    """
    if not raw_rating:
        return None

    # Clean but preserve case (Moody's is case-sensitive)
    rating = raw_rating.strip()

    # Check for not rated
    if rating.upper() in NOT_RATED_VALUES:
        return None

    # Remove any suffixes
    rating = rating.split("(")[0].strip()

    # Look up in scale
    score = MOODYS_SCALE.get(rating)
    if score is None:
        return None

    return NormalizedRating(
        scale=RatingScale.MOODYS,
        score=score,
        bucket=get_rating_bucket(score),
    )


def convert_moodys_to_fitch_sp(moodys_rating: str) -> Optional[str]:
    """
    Convert Moody's rating to approximate Fitch/S&P equivalent.

    Args:
        moodys_rating: Moody's rating (e.g., "Baa2")

    Returns:
        Approximate Fitch/S&P rating or None
    """
    normalized = normalize_moodys_rating(moodys_rating)
    if not normalized:
        return None

    # Reverse lookup in Fitch/S&P scale
    for rating, score in FITCH_SP_SCALE.items():
        if score == normalized.score:
            return rating

    return None


def convert_fitch_sp_to_moodys(fitch_sp_rating: str) -> Optional[str]:
    """
    Convert Fitch/S&P rating to approximate Moody's equivalent.

    Args:
        fitch_sp_rating: Fitch or S&P rating (e.g., "AA-")

    Returns:
        Approximate Moody's rating or None
    """
    normalized = normalize_fitch_sp_rating(fitch_sp_rating)
    if not normalized:
        return None

    # Reverse lookup in Moody's scale
    for rating, score in MOODYS_SCALE.items():
        if score == normalized.score:
            return rating

    return None


def is_investment_grade(raw_rating: str, scale: RatingScale) -> bool:
    """
    Check if a rating is investment grade.

    Args:
        raw_rating: Raw rating string
        scale: Rating scale type

    Returns:
        True if investment grade, False otherwise
    """
    if scale == RatingScale.MOODYS:
        normalized = normalize_moodys_rating(raw_rating)
    else:
        normalized = normalize_fitch_sp_rating(raw_rating)

    if not normalized:
        return False

    return normalized.bucket == RatingBucket.INVESTMENT_GRADE
