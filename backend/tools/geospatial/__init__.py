# Tool package for chatbot-callable analytical wrappers.

from .region import resolve_region
from .climate import load_climate_projection
from .spatial import clip_to_region
from .temporal import compare_climate_periods
from .scenario import compare_climate_scenarios
from .statistics import summarize_climate_by_region
from .thresholds import get_threshold_exceedance
from .extremes import find_extreme_locations
from .aggregation import aggregate_by_admin_region
from .ranking import rank_regions
from .assets import sample_hazard_at_assets

__all__ = [
    "resolve_region",
    "load_climate_projection",
    "clip_to_region",
    "compare_climate_periods",
    "compare_climate_scenarios",
    "summarize_climate_by_region",
    "get_threshold_exceedance",
    "find_extreme_locations",
    "aggregate_by_admin_region",
    "rank_regions",
    "sample_hazard_at_assets",
]