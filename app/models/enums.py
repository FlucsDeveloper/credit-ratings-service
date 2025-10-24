"""Enumerations for credit ratings."""

from enum import Enum


class RatingAgency(str, Enum):
    """Credit rating agencies."""

    FITCH = "fitch"
    SP = "sp"
    MOODYS = "moodys"


class RatingScale(str, Enum):
    """Rating scale types."""

    FITCH_SP = "S&P/Fitch"
    MOODYS = "Moody's"


class RatingBucket(str, Enum):
    """Rating quality buckets."""

    INVESTMENT_GRADE = "Investment Grade"
    SPECULATIVE = "Speculative"
    DEFAULT = "Default"
    NOT_RATED = "Not Rated"


class Outlook(str, Enum):
    """Rating outlook."""

    POSITIVE = "Positive"
    STABLE = "Stable"
    NEGATIVE = "Negative"
    DEVELOPING = "Developing"
    NOT_AVAILABLE = "N/A"
