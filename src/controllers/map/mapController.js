const mapService = require('../../services/map/mapService');

/**
 * GET /api/map/search
 * Proxies OpenStreetMap Nominatim search query
 */
exports.searchArea = async (req, res) => {
  try {
    const { q, lat, lng } = req.query;

    if (!q || !q.trim()) {
      return res.status(400).json({
        success: false,
        message: 'Search query parameter "q" is required.'
      });
    }

    const results = await mapService.searchNominatim(q, lat, lng);
    
    return res.status(200).json({
      success: true,
      data: results
    });
  } catch (error) {
    console.error('Error in searchArea controller:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during map area search.'
    });
  }
};

// Get all active workshops for map
exports.getActiveWorkshops = async (req, res) => {
  try {
    const workshops = await mapService.getActiveWorkshops();

    return res.status(200).json({
      success: true,
      data: workshops
    });
  } catch (error) {
    console.error('Error fetching active workshops for map:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to fetch workshops'
    });
  }
};

// Calculate routing options with flood/hazard avoidance
exports.getRoute = async (req, res) => {
  try {
    const { start, end } = req.query;

    if (!start || !end) {
      return res.status(400).json({
        success: false,
        message: 'Both "start" and "end" query parameters (format: lat,lng) are required.'
      });
    }

    const [startLatStr, startLngStr] = start.split(',');
    const [endLatStr, endLngStr] = end.split(',');

    const startLat = parseFloat(startLatStr);
    const startLng = parseFloat(startLngStr);
    const endLat = parseFloat(endLatStr);
    const endLng = parseFloat(endLngStr);

    if (isNaN(startLat) || isNaN(startLng) || isNaN(endLat) || isNaN(endLng)) {
      return res.status(400).json({
        success: false,
        message: 'Coordinates must be valid numbers.'
      });
    }

    const routes = await mapService.calculateAlternativeRoutes(startLat, startLng, endLat, endLng);

    return res.status(200).json({
      success: true,
      data: routes
    });
  } catch (error) {
    console.error('Error in getRoute controller:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error during path routing.'
    });
  }
};
