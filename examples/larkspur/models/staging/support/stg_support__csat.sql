select
    id as rating_id,
    ticket_id,
    rated_at,
    score as csat_score,
    score >= 4 as is_satisfied
from {{ source('support', 'satisfaction_ratings') }}
