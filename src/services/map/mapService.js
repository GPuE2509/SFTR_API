/**
 * Map Service
 * Handles map utilities, proxying Nominatim OpenStreetMap queries.
 */

const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');
const User = require('../../models/User');
const IotDevice = require('../../models/IotDevice');
const IncidentReport = require('../../models/IncidentReport');

exports.searchNominatim = async (query, lat, lng) => {
  if (!query || !query.trim()) {
    return [];
  }

  // Restrict searches strictly to Vietnam (countrycodes=vn)
  let url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query.trim())}&format=json&limit=5&addressdetails=1&countrycodes=vn`;

  // Default search bias center to Can Tho coordinates
  let biasLat = 10.03711;
  let biasLng = 105.78825;

  if (lat && lng) {
    const latFloat = parseFloat(lat);
    const lngFloat = parseFloat(lng);
    if (!isNaN(latFloat) && !isNaN(lngFloat)) {
      biasLat = latFloat;
      biasLng = lngFloat;
    }
  }

  const minLon = biasLng - 1.0;
  const minLat = biasLat - 1.0;
  const maxLon = biasLng + 1.0;
  const maxLat = biasLat + 1.0;
  url += `&viewbox=${minLon},${minLat},${maxLon},${maxLat}&bounded=1`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        // Nominatim policy requires a valid User-Agent to identify the application
        'User-Agent': 'SmartFloodTrafficRescue/1.0 (contact@sftr.org)'
      }
    });

    if (!response.ok) {
      throw new Error(`Nominatim API returned status: ${response.status}`);
    }

    const data = await response.json();

    // Map and format results to expose clean fields
    return data.map(item => ({
      place_id: item.place_id,
      display_name: item.display_name,
      lat: parseFloat(item.lat),
      lon: parseFloat(item.lon),
      boundingbox: item.boundingbox ? item.boundingbox.map(b => parseFloat(b)) : []
    }));
  } catch (error) {
    console.error('Error fetching from Nominatim OpenStreetMap:', error);
    throw new Error('Failed to retrieve location details from map search service.');
  }
};

exports.getActiveWorkshops = async () => {
  try {
    const workshops = await Workshop.find(
      { status: 'Active' },
      'name phone address lat lng is_mobile coverage_radius services rating_average rating_count is_open cover_photo'
    ).lean();

    // Populate owner names
    const workshopIds = workshops.map(w => w._id);
    const staffLinks = await WorkshopStaff.find({ workshop_id: { $in: workshopIds }, is_owner: true }).lean();
    const userIds = staffLinks.map(s => s.user_id);
    const users = await User.find({ _id: { $in: userIds } }, 'full_name').lean();

    const userMap = users.reduce((acc, u) => {
      acc[u._id.toString()] = u.full_name;
      return acc;
    }, {});

    const ownerMap = staffLinks.reduce((acc, s) => {
      acc[s.workshop_id.toString()] = userMap[s.user_id.toString()] || '';
      return acc;
    }, {});

    const ownerIdMap = staffLinks.reduce((acc, s) => {
      acc[s.workshop_id.toString()] = s.user_id.toString();
      return acc;
    }, {});

    return workshops.map(w => ({
      ...w,
      owner_name: ownerMap[w._id.toString()] || '',
      owner_id: ownerIdMap[w._id.toString()] || ''
    }));
  } catch (error) {
    console.error('Error in mapService.getActiveWorkshops:', error);
    throw new Error('Database error while fetching active workshops.');
  }
};

// Haversine distance formula (in meters)
function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371e3; // Earth radius in meters
  const phi1 = lat1 * Math.PI / 180;
  const phi2 = lat2 * Math.PI / 180;
  const deltaPhi = (lat2 - lat1) * Math.PI / 180;
  const deltaLambda = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
            Math.cos(phi1) * Math.cos(phi2) *
            Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Calculate alternative routes and assess flooding & hazards along them
exports.calculateAlternativeRoutes = async (startLat, startLng, endLat, endLng) => {
  // Query OSRM API for driving routes
  const url = `https://router.project-osrm.org/route/v1/driving/${startLng},${startLat};${endLng},${endLat}?overview=full&geometries=geojson&alternatives=true`;
  
  let routes = [];
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'SmartFloodTrafficRescue/1.0 (contact@sftr.org)'
      }
    });

    if (!response.ok) {
      throw new Error(`OSRM API returned status: ${response.status}`);
    }

    const result = await response.json();
    if (result.code === 'Ok' && result.routes) {
      routes = result.routes;
    } else {
      throw new Error(result.message || 'No route found');
    }
  } catch (error) {
    console.error('Error fetching routes from OSRM:', error);
    throw new Error('Failed to fetch routes from OSRM routing service.');
  }

  // Fetch active flooded IoT sensors
  const floodedSensors = await IotDevice.find({
    is_disabled: false,
    status: 'Online',
    warning_water_status: { $ne: 'safe' }
  }).lean();

  // Fetch active hazard points
  const activeHazards = await IncidentReport.find({
    moderation_status: 'Approved'
  }).lean();

  // Filter hazards where confirm votes >= deny votes
  const hazardsStillExist = activeHazards.filter(h => {
    const confirm = h.vote_still_exist || 0;
    const deny = h.vote_no_more || 0;
    return confirm >= deny;
  });

  const floodThreshold = 150; // meters
  const hazardThreshold = 100; // meters
  const hazardPenaltySeconds = 600; // 10 minutes weight penalty per hazard point

  const evaluatedRoutes = routes.map((route, index) => {
    const geometry = route.geometry; // GeoJSON LineString
    const coordinates = geometry.coordinates; // Array of [lng, lat]

    const encounteredFloods = [];
    const encounteredHazards = [];

    // Check intersection with flooded sensors
    floodedSensors.forEach(sensor => {
      let minDistance = Infinity;
      for (const coord of coordinates) {
        const d = getDistance(coord[1], coord[0], sensor.lat, sensor.lng);
        if (d < minDistance) {
          minDistance = d;
        }
      }
      if (minDistance <= floodThreshold) {
        encounteredFloods.push({
          device_code: sensor.device_code,
          name: sensor.name,
          location: sensor.location,
          water_percent: sensor.water_percent,
          warning_water_status: sensor.warning_water_status,
          current_water_level: sensor.current_water_level,
          distance: minDistance,
          lat: sensor.lat,
          lng: sensor.lng
        });
      }
    });

    // Check intersection with active hazard points
    hazardsStillExist.forEach(hazard => {
      let minDistance = Infinity;
      for (const coord of coordinates) {
        const d = getDistance(coord[1], coord[0], hazard.lat, hazard.lng);
        if (d < minDistance) {
          minDistance = d;
        }
      }
      if (minDistance <= hazardThreshold) {
        encounteredHazards.push({
          id: hazard._id,
          title: hazard.title || 'Hazard Report',
          description: hazard.description,
          report_type: hazard.report_type,
          vote_still_exist: hazard.vote_still_exist,
          vote_no_more: hazard.vote_no_more,
          distance: minDistance,
          lat: hazard.lat,
          lng: hazard.lng
        });
      }
    });

    const isFlooded = encounteredFloods.length > 0;
    const baseDuration = route.duration; // seconds (OSRM free-flow estimate)
    const trafficAdjustmentFactor = 1.6; // Scale OSRM time to match realistic urban traffic speeds
    const duration = Math.round(baseDuration * trafficAdjustmentFactor); // seconds (realistic estimate)
    
    const distance = route.distance; // meters
    const hazardCount = encounteredHazards.length;
    const weightedDuration = duration + (hazardCount * hazardPenaltySeconds);

    return {
      index,
      distance,
      duration,
      weighted_duration: weightedDuration,
      is_flooded: isFlooded,
      floods: encounteredFloods,
      hazards: encounteredHazards,
      geometry: geometry
    };
  });

  // Sort routes:
  // 1. Safe routes (is_flooded = false) first, sorted by weighted_duration
  // 2. Flooded routes (is_flooded = true) last, sorted by weighted_duration
  evaluatedRoutes.sort((a, b) => {
    if (a.is_flooded && !b.is_flooded) return 1;
    if (!a.is_flooded && b.is_flooded) return -1;
    return a.weighted_duration - b.weighted_duration;
  });

  return evaluatedRoutes;
};
