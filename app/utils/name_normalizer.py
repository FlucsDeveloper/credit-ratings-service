"""Company name normalization and variation generation."""

import re
import unicodedata
from typing import List, Set


def normalize_company_name(name: str) -> str:
    """
    Normalize company name by removing accents, extra spaces, and lowercasing.

    Args:
        name: Original company name

    Returns:
        Normalized name
    """
    # Remove accents/diacritics
    name = unicodedata.normalize('NFKD', name)
    name = ''.join([c for c in name if not unicodedata.combining(c)])

    # Convert to lowercase
    name = name.lower()

    # Remove multiple spaces
    name = ' '.join(name.split())

    return name


def remove_legal_suffixes(name: str) -> str:
    """
    Remove common legal suffixes from company names.

    Args:
        name: Company name

    Returns:
        Name without legal suffixes
    """
    # Brazilian suffixes
    suffixes = [
        r'\s+s\.?a\.?$',
        r'\s+s/a$',
        r'\s+ltda\.?$',
        r'\s+eireli$',
        r'\s+me$',
        r'\s+epp$',

        # International suffixes
        r'\s+inc\.?$',
        r'\s+corp\.?$',
        r'\s+corporation$',
        r'\s+ltd\.?$',
        r'\s+limited$',
        r'\s+llc$',
        r'\s+plc$',
        r'\s+gmbh$',
        r'\s+ag$',
        r'\s+n\.?v\.?$',
        r'\s+b\.?v\.?$',
    ]

    result = name.lower()
    for suffix in suffixes:
        result = re.sub(suffix, '', result, flags=re.IGNORECASE)

    return result.strip()


def generate_name_variations(company_name: str) -> List[str]:
    """
    Generate multiple variations of a company name for better matching.

    Args:
        company_name: Original company name

    Returns:
        List of name variations (deduplicated)
    """
    variations: Set[str] = set()

    # Original name
    variations.add(company_name)

    # Normalized version
    normalized = normalize_company_name(company_name)
    variations.add(normalized)

    # Without legal suffixes
    without_suffix = remove_legal_suffixes(company_name)
    variations.add(without_suffix)

    # Normalized without suffixes
    normalized_no_suffix = remove_legal_suffixes(normalized)
    variations.add(normalized_no_suffix)

    # Replace "&" variations
    if '&' in company_name:
        variations.add(company_name.replace('&', 'and'))
        variations.add(company_name.replace('&', 'e'))

    if ' e ' in company_name.lower():
        variations.add(re.sub(r'\be\b', 'and', company_name, flags=re.IGNORECASE))
        variations.add(re.sub(r'\be\b', '&', company_name, flags=re.IGNORECASE))

    # Remove "S.A." variants
    for pattern in [r'\s+s\.?a\.?', r'\s+s/a']:
        cleaned = re.sub(pattern, '', company_name, flags=re.IGNORECASE)
        if cleaned != company_name:
            variations.add(cleaned.strip())

    # Add uppercase version (for exact matching)
    variations.add(company_name.upper())

    # Remove empty strings and duplicates
    return sorted([v.strip() for v in variations if v.strip()])


def extract_core_name(company_name: str) -> str:
    """
    Extract the core/essential part of company name.

    Args:
        company_name: Full company name

    Returns:
        Core name without suffixes and filler words
    """
    name = normalize_company_name(company_name)
    name = remove_legal_suffixes(name)

    # Remove common filler words
    fillers = [
        'saneamento', 'participacoes', 'holding', 'group', 'holdings',
        'international', 'corporation', 'company', 'services',
    ]

    words = name.split()
    core_words = [w for w in words if w not in fillers]

    # If we removed too much, keep at least 2 words
    if len(core_words) < 2 and len(words) >= 2:
        return ' '.join(words[:2])

    return ' '.join(core_words) if core_words else name


def calculate_name_similarity(name1: str, name2: str) -> float:
    """
    Calculate similarity between two company names (0-1).

    Uses multiple strategies:
    - Exact match (normalized)
    - Core name match
    - Token overlap

    Args:
        name1: First company name
        name2: Second company name

    Returns:
        Similarity score (0-1)
    """
    n1 = normalize_company_name(name1)
    n2 = normalize_company_name(name2)

    # Exact match
    if n1 == n2:
        return 1.0

    # Core name match
    core1 = extract_core_name(name1)
    core2 = extract_core_name(name2)

    if core1 and core2 and core1 == core2:
        return 0.9

    # Token-based similarity
    tokens1 = set(n1.split())
    tokens2 = set(n2.split())

    if not tokens1 or not tokens2:
        return 0.0

    intersection = tokens1 & tokens2
    union = tokens1 | tokens2

    jaccard = len(intersection) / len(union)

    # Boost if core tokens match
    core_tokens1 = set(core1.split()) if core1 else set()
    core_tokens2 = set(core2.split()) if core2 else set()

    if core_tokens1 and core_tokens2:
        core_intersection = core_tokens1 & core_tokens2
        if core_intersection:
            jaccard = min(1.0, jaccard + 0.2)

    return jaccard
