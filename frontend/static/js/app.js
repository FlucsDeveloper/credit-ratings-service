/**
 * Credit Ratings Intelligence Platform - Frontend Application
 */

// Configuration
const API_BASE_URL = 'http://localhost:8000/api/v1';

// Global state
let currentData = null;
let comparisonChart = null;

// Agency configuration
const AGENCY_CONFIG = {
    fitch: {
        name: 'Fitch Ratings',
        color: '#FF6B6B',
        cardId: 'fitchCard'
    },
    sp: {
        name: 'S&P Global',
        color: '#4DABF7',
        cardId: 'spCard'
    },
    moodys: {
        name: "Moody's",
        color: '#51CF66',
        cardId: 'moodysCard'
    }
};

/**
 * Initialize application
 */
document.addEventListener('DOMContentLoaded', () => {
    // Event listeners
    document.getElementById('searchBtn').addEventListener('click', handleSearch);
    document.getElementById('companyInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            handleSearch();
        }
    });

    // Initialize Chart.js defaults
    Chart.defaults.color = '#94A3B8';
    Chart.defaults.borderColor = '#334155';
    Chart.defaults.font.family = "'Inter', -apple-system, BlinkMacSystemFont, sans-serif";
});

/**
 * Handle search button click
 */
async function handleSearch() {
    const companyName = document.getElementById('companyInput').value.trim();

    if (!companyName) {
        showError('Por favor, digite o nome de uma empresa');
        return;
    }

    await fetchRatings(companyName);
}

/**
 * Quick search function
 */
window.quickSearch = async function(companyName) {
    document.getElementById('companyInput').value = companyName;
    await fetchRatings(companyName);
};

/**
 * Fetch ratings from API
 */
async function fetchRatings(companyName) {
    try {
        // Show loading state
        setLoadingState(true);
        hideError();
        hideEmptyState();

        // Make API request
        const response = await fetch(`${API_BASE_URL}/ratings`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                company_name: companyName,
                country: 'BR'
            })
        });

        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }

        const data = await response.json();
        currentData = data;

        // Display results
        displayResults(data);

    } catch (error) {
        console.error('Error fetching ratings:', error);
        showError('Erro ao buscar ratings. Verifique se a API está rodando.');
    } finally {
        setLoadingState(false);
    }
}

/**
 * Display results
 */
function displayResults(data) {
    // Show results section
    document.getElementById('resultsSection').style.display = 'block';

    // Update company header
    updateCompanyHeader(data);

    // Update rating cards
    updateRatingCards(data.ratings);

    // Update comparison chart
    updateComparisonChart(data.ratings);

    // Update notes
    updateNotes(data.notes);
}

/**
 * Update company header
 */
function updateCompanyHeader(data) {
    document.getElementById('companyName').textContent = data.query;

    if (data.resolved && data.resolved.country) {
        document.getElementById('companyCountry').textContent = data.resolved.country;
    } else {
        document.getElementById('companyCountry').textContent = 'International';
    }

    // Calculate average score
    const scores = Object.values(data.ratings)
        .filter(r => r.normalized && r.normalized.score)
        .map(r => r.normalized.score);

    if (scores.length > 0) {
        const avgScore = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
        const bucket = getScoreBucket(avgScore);

        document.getElementById('overallScore').querySelector('.score-value').textContent = avgScore;
        document.getElementById('overallScore').querySelector('.score-bucket').textContent = bucket;
    }

    // Update timestamp
    const now = new Date();
    document.getElementById('lastUpdated').textContent =
        `Atualizado em ${now.toLocaleDateString('pt-BR')} às ${now.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
}

/**
 * Update rating cards
 */
function updateRatingCards(ratings) {
    Object.entries(ratings).forEach(([agency, rating]) => {
        const config = AGENCY_CONFIG[agency];
        if (!config) return;

        const card = document.getElementById(config.cardId);
        if (!card) return;

        // Update status badge
        const statusBadge = card.querySelector('.status-badge');
        if (rating.error) {
            statusBadge.className = 'status-badge status-error';
            statusBadge.innerHTML = `
                <span class="status-dot"></span>
                Erro
            `;
        } else if (rating.raw) {
            statusBadge.className = 'status-badge status-success';
            statusBadge.innerHTML = `
                <span class="status-dot"></span>
                Disponível
            `;
        } else {
            statusBadge.className = 'status-badge status-error';
            statusBadge.innerHTML = `
                <span class="status-dot"></span>
                Indisponível
            `;
        }

        // Update rating value
        const ratingValue = card.querySelector('.rating-value');
        ratingValue.textContent = rating.raw || '-';

        // Update outlook
        const outlookSpan = card.querySelector('.rating-outlook span');
        outlookSpan.textContent = rating.outlook || '-';

        // Update details
        const detailRows = card.querySelectorAll('.detail-row');

        // Score
        const scoreValue = detailRows[0].querySelector('.detail-value');
        if (rating.normalized && rating.normalized.score) {
            scoreValue.textContent = rating.normalized.score;
        } else {
            scoreValue.textContent = '-';
        }

        // Bucket
        const bucketValue = detailRows[1].querySelector('.detail-value');
        if (rating.normalized && rating.normalized.bucket) {
            bucketValue.textContent = rating.normalized.bucket;
        } else if (rating.error) {
            bucketValue.textContent = 'Erro';
        } else {
            bucketValue.textContent = '-';
        }

        // Last updated
        const dateValue = detailRows[2].querySelector('.detail-value');
        if (rating.last_updated) {
            const date = new Date(rating.last_updated);
            dateValue.textContent = date.toLocaleDateString('pt-BR');
        } else {
            dateValue.textContent = '-';
        }

        // Update source link
        const cardLink = card.querySelector('.card-link');
        if (rating.source_url) {
            cardLink.href = rating.source_url;
            cardLink.style.display = 'inline';
        } else {
            cardLink.style.display = 'none';
        }
    });
}

/**
 * Update comparison chart
 */
function updateComparisonChart(ratings) {
    const ctx = document.getElementById('comparisonChart');
    if (!ctx) return;

    // Prepare data
    const labels = [];
    const scores = [];
    const colors = [];

    Object.entries(ratings).forEach(([agency, rating]) => {
        const config = AGENCY_CONFIG[agency];
        if (!config) return;

        labels.push(config.name);

        if (rating.normalized && rating.normalized.score) {
            scores.push(rating.normalized.score);
            colors.push(config.color);
        } else {
            scores.push(null);
            colors.push('#64748B');
        }
    });

    // Destroy existing chart
    if (comparisonChart) {
        comparisonChart.destroy();
    }

    // Create new chart
    comparisonChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Score (menor = melhor)',
                data: scores,
                backgroundColor: colors.map(c => c + '40'),
                borderColor: colors,
                borderWidth: 2,
                borderRadius: 8,
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1E293B',
                    titleColor: '#F1F5F9',
                    bodyColor: '#94A3B8',
                    borderColor: '#334155',
                    borderWidth: 1,
                    padding: 12,
                    displayColors: false,
                    callbacks: {
                        label: function(context) {
                            const score = context.parsed.y;
                            if (score === null) return 'Não disponível';
                            const bucket = getScoreBucket(score);
                            return `Score: ${score} (${bucket})`;
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    max: 21,
                    reverse: true,
                    ticks: {
                        stepSize: 3
                    },
                    grid: {
                        color: '#334155'
                    }
                },
                x: {
                    grid: {
                        display: false
                    }
                }
            }
        }
    });
}

/**
 * Update notes section
 */
function updateNotes(notes) {
    const notesSection = document.getElementById('notesSection');
    const notesList = document.getElementById('notesList');

    if (!notes || notes.length === 0) {
        notesSection.style.display = 'none';
        return;
    }

    notesList.innerHTML = notes.map(note => `<li>${note}</li>`).join('');
    notesSection.style.display = 'block';
}

/**
 * Get score bucket classification
 */
function getScoreBucket(score) {
    if (score <= 10) return 'Investment Grade';
    if (score <= 16) return 'Speculative';
    return 'Default Risk';
}

/**
 * Set loading state
 */
function setLoadingState(isLoading) {
    const btn = document.getElementById('searchBtn');
    const btnText = document.getElementById('btnText');
    const btnLoader = document.getElementById('btnLoader');

    if (isLoading) {
        btn.disabled = true;
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-block';
    } else {
        btn.disabled = false;
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    }
}

/**
 * Show error state
 */
function showError(message) {
    document.getElementById('errorTitle').textContent = 'Erro';
    document.getElementById('errorMessage').textContent = message;
    document.getElementById('errorState').style.display = 'block';
    document.getElementById('emptyState').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'none';
}

/**
 * Hide error state
 */
window.hideError = function() {
    document.getElementById('errorState').style.display = 'none';
};

/**
 * Hide empty state
 */
function hideEmptyState() {
    document.getElementById('emptyState').style.display = 'none';
}

/**
 * Format date
 */
function formatDate(dateString) {
    if (!dateString) return '-';

    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
    });
}

// Export for debugging
if (typeof window !== 'undefined') {
    window.appDebug = {
        getCurrentData: () => currentData,
        getChart: () => comparisonChart,
        fetchRatings: fetchRatings
    };
}
