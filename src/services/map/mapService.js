/**
 * Map Service
 * Handles Goong Maps API queries for geocoding, search, and routing.
 */

const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');
const User = require('../../models/User');
const IotDevice = require('../../models/IotDevice');
const IncidentReport = require('../../models/IncidentReport');

// Polyline decoding helper for Goong Overview Polyline (Google Polyline format)
function decodePolyline(str) {
  let index = 0,
      lat = 0,
      lng = 0,
      coordinates = [],
      shift = 0,
      result = 0,
      byte = null,
      latitude_change,
      longitude_change;

  while (index < str.length) {
    byte = null;
    shift = 0;
    result = 0;

    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    latitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lat += latitude_change;

    shift = 0;
    result = 0;

    do {
      byte = str.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);

    longitude_change = ((result & 1) ? ~(result >> 1) : (result >> 1));
    lng += longitude_change;

    // Goong returns coordinates in [lng, lat] for GeoJSON
    coordinates.push([lng / 100000, lat / 100000]);
  }

  return coordinates;
}

// Maps Goong address_components list into Nominatim-like address structure
function mapGoongAddressToNominatim(components, formattedAddress) {
  const address = {
    road: '',
    house_number: '',
    ward: '',
    district: '',
    city: ''
  };

  if (!components || components.length === 0) {
    const parts = formattedAddress ? formattedAddress.split(',').map(p => p.trim()) : [];
    if (parts.length >= 1) address.city = parts[parts.length - 1];
    if (parts.length >= 2) address.district = parts[parts.length - 2];
    if (parts.length >= 3) address.ward = parts[parts.length - 3];
    if (parts.length >= 4) address.road = parts.slice(0, parts.length - 3).join(', ');
    return address;
  }

  const len = components.length;
  if (len >= 1) {
    address.city = components[len - 1].long_name;
  }
  if (len >= 2) {
    address.district = components[len - 2].long_name;
  }
  if (len >= 3) {
    address.ward = components[len - 3].long_name;
  }
  
  const streetParts = [];
  for (let i = 0; i < len - 3; i++) {
    const comp = components[i];
    if (/\d/.test(comp.long_name) && !address.house_number) {
      address.house_number = comp.long_name;
    } else {
      streetParts.push(comp.long_name);
    }
  }
  address.road = streetParts.join(', ');

  return address;
}

exports.searchNominatim = async (query, lat, lng) => {
  if (!query || !query.trim()) {
    return [];
  }

  const apiKey = process.env.GOONG_API_KEY;

  try {
    // 1. Try Goong Place Autocomplete API to fetch multiple suggestions
    let autocompleteUrl = `https://rsapi.goong.io/Place/Autocomplete?input=${encodeURIComponent(query.trim())}&api_key=${apiKey}`;
    if (lat && lng) {
      autocompleteUrl += `&location=${lat},${lng}&radius=50000`;
    }

    const autocompleteResponse = await fetch(autocompleteUrl, { method: 'GET' });
    if (autocompleteResponse.ok) {
      const autocompleteData = await autocompleteResponse.json();
      
      if (autocompleteData.predictions && autocompleteData.predictions.length > 0) {
        // Fetch up to 10 suggestions to resolve details (coordinates)
        const topPredictions = autocompleteData.predictions.slice(0, 10);
        
        const detailedResults = await Promise.all(
          topPredictions.map(async (pred) => {
            try {
              const detailUrl = `https://rsapi.goong.io/v2/place/detail?place_id=${pred.place_id}&api_key=${apiKey}`;
              const detailRes = await fetch(detailUrl, { method: 'GET' });
              if (!detailRes.ok) return null;
              
              const detailData = await detailRes.json();
              if (detailData.result) {
                const item = detailData.result;
                return {
                  place_id: item.place_id,
                  display_name: item.formatted_address,
                  lat: item.geometry && item.geometry.location ? String(item.geometry.location.lat) : '0',
                  lon: item.geometry && item.geometry.location ? String(item.geometry.location.lng) : '0',
                  address: mapGoongAddressToNominatim(item.address_components, item.formatted_address),
                  boundingbox: []
                };
              }
            } catch (err) {
              console.warn(`Error fetching place detail for ${pred.place_id}:`, err);
            }
            return null;
          })
        );

        const filteredResults = detailedResults.filter(Boolean);
        if (filteredResults.length > 0) {
          if (lat && lng) {
            const latNum = parseFloat(lat);
            const lngNum = parseFloat(lng);
            filteredResults.sort((a, b) => {
              const distA = getDistance(latNum, lngNum, parseFloat(a.lat), parseFloat(a.lon));
              const distB = getDistance(latNum, lngNum, parseFloat(b.lat), parseFloat(b.lon));
              return distA - distB;
            });
          }
          return filteredResults;
        }
      }
    }
  } catch (error) {
    console.warn('Autocomplete search failed, falling back to Geocode:', error);
  }

  // 2. Fallback to existing Geocode API if Autocomplete returns no predictions or fails
  let geocodeUrl = `https://rsapi.goong.io/Geocode?address=${encodeURIComponent(query.trim())}&api_key=${apiKey}`;

  try {
    const response = await fetch(geocodeUrl, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Goong Geocode API returned status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.results) {
      return [];
    }

    const mapped = data.results.map(item => ({
      place_id: item.place_id,
      display_name: item.formatted_address,
      lat: item.geometry && item.geometry.location ? String(item.geometry.location.lat) : '0',
      lon: item.geometry && item.geometry.location ? String(item.geometry.location.lng) : '0',
      address: mapGoongAddressToNominatim(item.address_components, item.formatted_address),
      boundingbox: []
    }));

    if (lat && lng) {
      const latNum = parseFloat(lat);
      const lngNum = parseFloat(lng);
      mapped.sort((a, b) => {
        const distA = getDistance(latNum, lngNum, parseFloat(a.lat), parseFloat(a.lon));
        const distB = getDistance(latNum, lngNum, parseFloat(b.lat), parseFloat(b.lon));
        return distA - distB;
      });
    }

    return mapped;
  } catch (error) {
    console.error('Error fetching from Goong Geocode API:', error);
    throw new Error('Failed to retrieve location details from map search service.');
  }
};

exports.reverseGeocode = async (lat, lng) => {
  if (!lat || !lng) {
    throw new Error('Latitude and longitude parameters are required.');
  }

  const apiKey = process.env.GOONG_API_KEY;
  const url = `https://rsapi.goong.io/Geocode?latlng=${lat},${lng}&api_key=${apiKey}`;

  try {
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Goong Reverse Geocode API returned status: ${response.status}`);
    }

    const data = await response.json();
    if (!data.results || data.results.length === 0) {
      return { address: {} };
    }

    const item = data.results[0];
    return {
      place_id: item.place_id,
      display_name: item.formatted_address,
      lat: String(lat),
      lon: String(lng),
      address: mapGoongAddressToNominatim(item.address_components, item.formatted_address)
    };
  } catch (error) {
    console.error('Error fetching from Goong Reverse Geocode API:', error);
    throw new Error('Failed to retrieve reverse geocoding details.');
  }
};

function checkCurrentlyOpen(w) {
  if (!w.is_open) return false;

  const hasActiveCalendar = w.weekly_calendar && w.weekly_calendar.some(c => c.is_active);

  // Get current Vietnam time (GMT+7)
  const now = new Date();
  const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
  const vnTime = new Date(utc + (3600000 * 7));

  const currentHours = vnTime.getHours();
  const currentMinutes = vnTime.getMinutes();
  const currentMinVal = currentHours * 60 + currentMinutes;

  if (!hasActiveCalendar) {
    const [oH, oM] = (w.open_time || '08:00').split(':').map(Number);
    const [cH, cM] = (w.close_time || '17:00').split(':').map(Number);
    const openMinVal = oH * 60 + oM;
    const closeMinVal = cH * 60 + cM;
    return currentMinVal >= openMinVal && currentMinVal <= closeMinVal;
  }

  const day = vnTime.getDay(); // 0: Sunday, 1: Monday, ..., 6: Saturday
  let dayGroup = "";
  if (day === 0) {
    dayGroup = "Sunday";
  } else if (day === 6) {
    dayGroup = "Saturday";
  } else {
    dayGroup = "Monday – Friday";
  }

  const calendarEntry = w.weekly_calendar.find(c => c.day_group === dayGroup);
  if (!calendarEntry) return true;
  if (!calendarEntry.is_active) return false;

  const [oH, oM] = (calendarEntry.open_time || '08:00').split(':').map(Number);
  const [cH, cM] = (calendarEntry.close_time || '17:00').split(':').map(Number);

  const openMinVal = oH * 60 + oM;
  const closeMinVal = cH * 60 + cM;

  return currentMinVal >= openMinVal && currentMinVal <= closeMinVal;
}

exports.getActiveWorkshops = async () => {
  try {
    const workshops = await Workshop.find(
      { status: 'Active' },
      'name phone address lat lng is_mobile coverage_radius services rating_average rating_count is_open cover_photo weekly_calendar open_time close_time'
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
      is_open: checkCurrentlyOpen(w),
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
  const apiKey = process.env.GOONG_API_KEY;
  const url = `https://rsapi.goong.io/Direction?origin=${startLat},${startLng}&destination=${endLat},${endLng}&vehicle=car&api_key=${apiKey}&alternatives=true`;
  
  let routes = [];
  try {
    const response = await fetch(url, { method: 'GET' });

    if (!response.ok) {
      throw new Error(`Goong Direction API returned status: ${response.status}`);
    }

    const result = await response.json();
    if (result.routes && result.routes.length > 0) {
      routes = result.routes;
    } else {
      throw new Error(result.message || 'No route found');
    }
  } catch (error) {
    console.error('Error fetching routes from Goong:', error);
    throw new Error('Failed to fetch routes from Goong routing service.');
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
    const polylinePoints = route.overview_polyline ? route.overview_polyline.points : '';
    const coordinates = polylinePoints ? decodePolyline(polylinePoints) : [];
    const geometry = {
      type: 'LineString',
      coordinates: coordinates
    };

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
    
    const leg = route.legs && route.legs[0];
    const baseDuration = leg && leg.duration ? leg.duration.value : 0;
    const distance = leg && leg.distance ? leg.distance.value : 0;

    const trafficAdjustmentFactor = 1.0; // Goong already contains real-time traffic speeds
    const duration = Math.round(baseDuration * trafficAdjustmentFactor); // seconds
    
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

exports.getFloodZoneHeatmap = async () => {
  const WaterLevelLog = require('../../models/WaterLevelLog');
  const devices = await IotDevice.find({ status: 'Online', is_disabled: { $ne: true } }).lean();

  const zones = [];
  
  for (let i = 0; i < devices.length; i++) {
    const dev = devices[i];
    if (dev.lat && dev.lng) {
      const level = dev.current_water_level || 0;
      const calib = dev.calib_empty_cm || 100;
      const pct = Math.min(100, Math.max(0, (level / calib) * 100));
      
      const logCount = await WaterLevelLog.countDocuments({ device_id: dev._id, water_level_mm: { $gte: 300 } });
      const histCount = Math.max(5, logCount > 0 ? logCount : Math.floor(pct / 8) + 3);
      
      let intensity = Math.min(1.0, parseFloat(((pct / 100) * 0.6 + 0.35).toFixed(2)));
      let severity = 'slight';
      if (pct >= 60 || intensity >= 0.75) severity = 'critical';
      else if (pct >= 50 || intensity >= 0.65) severity = 'severe';
      else if (pct >= 40 || intensity >= 0.5) severity = 'moderate';

      const localizedRadius = Math.min(260, 120 + Math.floor(level * 1.5));

      zones.push({
        id: `heatmap-dev-${dev._id}`,
        name: `Cụm trạm ${dev.name || dev.device_code || 'IoT Zone'}`,
        lat: dev.lat,
        lng: dev.lng,
        radius_m: localizedRadius,
        intensity: intensity,
        severity: severity,
        historical_incidents: histCount,
        realtime_level_cm: level,
        description: `Mật độ ngập tích lũy thời gian thực và lịch sử tại cụm ${dev.location || 'trung tâm'}.`
      });
    }
  }

  return zones;
};

// ── Emergency Facilities via Goong Places API ─────────────────────────────────
// Simple in-memory cache: key = "lat2dp_lng2dp_radius", value = { data, expiry }
const _emergencyCache = {};

function _haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const FACILITY_TYPE_MAP = {
  hospital:       { label: 'General Hospital',             color: '#B91C1C', icon: 'hospital' },
  clinic:         { label: 'Medical Clinic',               color: '#C2410C', icon: 'stethoscope' },
  pharmacy:       { label: 'Medical Supply / Pharmacy',    color: '#047857', icon: 'cross' },
  fire_station:   { label: 'Fire & Rescue Command',        color: '#991B1B', icon: 'flame' },
  police:         { label: 'Police / Security Department', color: '#1D4ED8', icon: 'shield' },
  shelter:        { label: 'Evacuation Shelter Center',    color: '#4338CA', icon: 'home' },
  rescue_station: { label: 'Emergency Rescue Outpost',     color: '#0F766E', icon: 'life-buoy' },
};

// Map Goong place types to our facility types
const GOONG_TYPE_MAP = {
  'hospital':         'hospital',
  'health':           'clinic',
  'pharmacy':         'pharmacy',
  'doctor':           'clinic',
  'dentist':          'clinic',
  'fire_station':     'fire_station',
  'police':           'police',
  'emergency':        'rescue_station',
  'shelter':          'shelter',
  'lodging':          'shelter',
};

// Search keywords for Goong Places API (Vietnamese)
const GOONG_SEARCH_QUERIES = [
  { query: 'bệnh viện',       type: 'hospital' },
  { query: 'phòng khám',      type: 'clinic' },
  { query: 'trạm y tế',       type: 'clinic' },
  { query: 'nhà thuốc',       type: 'pharmacy' },
  { query: 'cửa hàng thuốc',  type: 'pharmacy' },
  { query: 'đồn cảnh sát',    type: 'police' },
  { query: 'công an',         type: 'police' },
  { query: 'phòng cháy chữa cháy', type: 'fire_station' },
  { query: 'cứu hỏa',         type: 'fire_station' },
  { query: 'khu lánh nạn',    type: 'shelter' },
  { query: 'trạm cứu nạn',    type: 'rescue_station' },
];

exports.getEmergencyFacilities = async (lat, lng, radiusM = 3000) => {
  const latNum = parseFloat(lat);
  const lngNum = parseFloat(lng);
  const radNum = Math.min(parseInt(radiusM) || 3000, 10000);

  if (isNaN(latNum) || isNaN(lngNum)) {
    throw new Error('Invalid lat/lng coordinates');
  }

  // Cache key: round to 3 decimal places (~100m grid) + radius
  const cacheKey = `${latNum.toFixed(3)}_${lngNum.toFixed(3)}_${radNum}`;
  const cached = _emergencyCache[cacheKey];
  if (cached && cached.expiry > Date.now()) {
    return { facilities: cached.data, cached: true };
  }

  const apiKey = process.env.GOONG_API_KEY;
  const facilityMap = new Map(); // id -> facility to deduplicate

  // Run all searches in parallel for speed
  await Promise.allSettled(
    GOONG_SEARCH_QUERIES.map(async ({ query, type }) => {
      try {
        const url = `https://rsapi.goong.io/Place/Autocomplete?input=${encodeURIComponent(query)}&location=${latNum},${lngNum}&radius=${radNum}&api_key=${apiKey}`;
        const res = await fetch(url, { method: 'GET' });
        if (!res.ok) return;
        const json = await res.json();
        const predictions = json.predictions || [];

        // Fetch place details in parallel (limit 5 per query)
        await Promise.allSettled(
          predictions.slice(0, 5).map(async (pred) => {
            try {
              const detailUrl = `https://rsapi.goong.io/v2/place/detail?place_id=${pred.place_id}&api_key=${apiKey}`;
              const detailRes = await fetch(detailUrl, { method: 'GET' });
              if (!detailRes.ok) return;
              const detailJson = await detailRes.json();
              const item = detailJson.result;
              if (!item || !item.geometry || !item.geometry.location) return;

              const placeId = item.place_id || pred.place_id;
              if (facilityMap.has(placeId)) return; // deduplicate

              const placeLat = item.geometry.location.lat;
              const placeLng = item.geometry.location.lng;
              const distKm = _haversineKm(latNum, lngNum, placeLat, placeLng);
              if (distKm > radNum / 1000.0) return; // outside radius

              // Determine facility type from Goong types array or fallback to query type
              const goongTypes = item.types || [];
              let resolvedType = type;
              for (const t of goongTypes) {
                if (GOONG_TYPE_MAP[t]) { resolvedType = GOONG_TYPE_MAP[t]; break; }
              }
              const meta = FACILITY_TYPE_MAP[resolvedType] || FACILITY_TYPE_MAP.shelter;

              const address = item.formatted_address || '';
              const phone = item.international_phone_number || item.formatted_phone_number || '';

              facilityMap.set(placeId, {
                id: `goong_${placeId}`,
                name: item.name || item.formatted_address || meta.label,
                type: resolvedType,
                label: meta.label,
                color: meta.color,
                icon: meta.icon,
                lat: placeLat,
                lng: placeLng,
                address,
                phone,
                distKm: parseFloat(distKm.toFixed(2)),
                distStr: distKm < 1 ? `${Math.round(distKm * 1000)} m` : `${distKm.toFixed(1)} km`,
                openingHours: '',
              });
            } catch (_) {}
          })
        );
      } catch (_) {}
    })
  );

  const facilities = Array.from(facilityMap.values())
    .sort((a, b) => a.distKm - b.distKm);

  _emergencyCache[cacheKey] = { data: facilities, expiry: Date.now() + 15 * 60 * 1000 };

  return { facilities, cached: false };
};

