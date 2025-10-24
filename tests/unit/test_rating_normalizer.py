"""Tests for rating normalization utilities."""

import pytest

from app.models.enums import RatingBucket, RatingScale
from app.utils.rating_normalizer import (
    convert_fitch_sp_to_moodys,
    convert_moodys_to_fitch_sp,
    is_investment_grade,
    normalize_fitch_sp_rating,
    normalize_moodys_rating,
)


class TestFitchSPNormalization:
    """Tests for Fitch/S&P rating normalization."""

    def test_normalize_aaa(self):
        """Test AAA rating normalization."""
        result = normalize_fitch_sp_rating("AAA")
        assert result is not None
        assert result.scale == RatingScale.FITCH_SP
        assert result.score == 1
        assert result.bucket == RatingBucket.INVESTMENT_GRADE

    def test_normalize_bbb_minus(self):
        """Test BBB- rating (lowest investment grade)."""
        result = normalize_fitch_sp_rating("BBB-")
        assert result is not None
        assert result.score == 10
        assert result.bucket == RatingBucket.INVESTMENT_GRADE

    def test_normalize_bb_plus(self):
        """Test BB+ rating (highest speculative)."""
        result = normalize_fitch_sp_rating("BB+")
        assert result is not None
        assert result.score == 11
        assert result.bucket == RatingBucket.SPECULATIVE

    def test_normalize_default(self):
        """Test default rating."""
        result = normalize_fitch_sp_rating("D")
        assert result is not None
        assert result.score == 21
        assert result.bucket == RatingBucket.DEFAULT

    def test_normalize_not_rated(self):
        """Test not rated values."""
        assert normalize_fitch_sp_rating("NR") is None
        assert normalize_fitch_sp_rating("WR") is None
        assert normalize_fitch_sp_rating("N/A") is None

    def test_normalize_with_suffix(self):
        """Test rating with suffix removal."""
        result = normalize_fitch_sp_rating("AA- (local)")
        assert result is not None
        assert result.score == 4

    def test_normalize_case_insensitive(self):
        """Test case insensitivity."""
        result1 = normalize_fitch_sp_rating("aa-")
        result2 = normalize_fitch_sp_rating("AA-")
        assert result1 == result2


class TestMoodysNormalization:
    """Tests for Moody's rating normalization."""

    def test_normalize_aaa(self):
        """Test Aaa rating normalization."""
        result = normalize_moodys_rating("Aaa")
        assert result is not None
        assert result.scale == RatingScale.MOODYS
        assert result.score == 1
        assert result.bucket == RatingBucket.INVESTMENT_GRADE

    def test_normalize_baa3(self):
        """Test Baa3 rating (lowest investment grade)."""
        result = normalize_moodys_rating("Baa3")
        assert result is not None
        assert result.score == 10
        assert result.bucket == RatingBucket.INVESTMENT_GRADE

    def test_normalize_ba1(self):
        """Test Ba1 rating (highest speculative)."""
        result = normalize_moodys_rating("Ba1")
        assert result is not None
        assert result.score == 11
        assert result.bucket == RatingBucket.SPECULATIVE

    def test_normalize_not_rated(self):
        """Test not rated values."""
        assert normalize_moodys_rating("NR") is None
        assert normalize_moodys_rating("WR") is None

    def test_normalize_with_suffix(self):
        """Test rating with suffix removal."""
        result = normalize_moodys_rating("Baa2 (local)")
        assert result is not None
        assert result.score == 9


class TestRatingConversion:
    """Tests for cross-scale rating conversion."""

    def test_moodys_to_fitch_sp(self):
        """Test Moody's to Fitch/S&P conversion."""
        assert convert_moodys_to_fitch_sp("Aaa") == "AAA"
        assert convert_moodys_to_fitch_sp("Baa2") == "BBB"
        assert convert_moodys_to_fitch_sp("Ba1") == "BB+"

    def test_fitch_sp_to_moodys(self):
        """Test Fitch/S&P to Moody's conversion."""
        assert convert_fitch_sp_to_moodys("AAA") == "Aaa"
        assert convert_fitch_sp_to_moodys("BBB") == "Baa2"
        assert convert_fitch_sp_to_moodys("BB+") == "Ba1"

    def test_roundtrip_conversion(self):
        """Test that conversions are consistent."""
        original = "AA-"
        moodys = convert_fitch_sp_to_moodys(original)
        back = convert_moodys_to_fitch_sp(moodys)
        assert back == original


class TestInvestmentGrade:
    """Tests for investment grade classification."""

    def test_fitch_sp_investment_grade(self):
        """Test Fitch/S&P investment grade detection."""
        assert is_investment_grade("AAA", RatingScale.FITCH_SP)
        assert is_investment_grade("BBB-", RatingScale.FITCH_SP)
        assert not is_investment_grade("BB+", RatingScale.FITCH_SP)
        assert not is_investment_grade("D", RatingScale.FITCH_SP)

    def test_moodys_investment_grade(self):
        """Test Moody's investment grade detection."""
        assert is_investment_grade("Aaa", RatingScale.MOODYS)
        assert is_investment_grade("Baa3", RatingScale.MOODYS)
        assert not is_investment_grade("Ba1", RatingScale.MOODYS)
        assert not is_investment_grade("C", RatingScale.MOODYS)
