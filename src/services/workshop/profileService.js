const Workshop = require('../../models/Workshop');
const WorkshopStaff = require('../../models/WorkshopStaff');
const User = require('../../models/User');
const { deleteImage, uploadImage } = require('../../utils/uploadCloudinary');

exports.getWorkshop = async (userOrId) => {
  let user;
  let userId;
  if (userOrId && typeof userOrId === 'object' && userOrId._id) {
    user = userOrId;
    userId = user._id;
  } else {
    userId = userOrId;
  }

  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  
  let workshop = null;
  if (staffLinks.length > 0) {
    const workshopIds = staffLinks.map(link => link.workshop_id);
    const workshops = await Workshop.find({
      _id: { $in: workshopIds },
      status: { $in: ['Active', 'Pending_Approval', 'Suspended'] }
    });
    
    if (workshops.length > 0) {
      // Prioritize Active over Pending_Approval and Suspended
      workshop = workshops.find(w => w.status === 'Active') ||
                 workshops.find(w => w.status === 'Pending_Approval') ||
                 workshops.find(w => w.status === 'Suspended');
    }
  }

  if (!workshop) {
    const error = new Error('Could not find your workshop information.');
    error.status = 404;
    throw error;
  }

  // Get owner details (User's full_name)
  if (!user) {
    user = await User.findById(userId);
  }
  const ownerName = user ? user.full_name : '';
  const ownerEmail = user ? user.email : '';
  const ownerPhone = user ? user.phone : '';

  return {
    ...workshop.toObject(),
    owner_name: ownerName,
    owner_email: ownerEmail,
    owner_phone: ownerPhone
  };
};

exports.updateWorkshop = async (userId, updateData) => {
  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  
  let activeWorkshop = null;
  for (const staffLink of staffLinks) {
    const workshop = await Workshop.findById(staffLink.workshop_id);
    if (workshop && ['Active', 'Pending_Approval', 'Suspended'].includes(workshop.status)) {
      activeWorkshop = workshop;
      break;
    }
  }

  if (!activeWorkshop) {
    const error = new Error('Could not find your workshop information.');
    error.status = 404;
    throw error;
  }

  if (updateData.name !== undefined) {
    if (!updateData.name.trim()) {
      const error = new Error('Workshop name is required.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.name = updateData.name.trim();
  }

  if (updateData.phone !== undefined) {
    if (!updateData.phone.trim()) {
      const error = new Error('Phone number is required.');
      error.status = 400;
      throw error;
    }
    // Mobile number validation
    const phoneRegex = /^(03[2-9]|05[25689]|07[06-9]|08[1-9]|09[0-9])\d{7}$/;
    if (!phoneRegex.test(updateData.phone.trim())) {
      const error = new Error('Invalid Vietnamese mobile phone number.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.phone = updateData.phone.trim();
  }

  if (updateData.address !== undefined) {
    if (!updateData.address.trim()) {
      const error = new Error('Address is required.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.address = updateData.address.trim();
  }

  if (updateData.lat !== undefined) {
    const latVal = parseFloat(updateData.lat);
    if (isNaN(latVal) || latVal < -90 || latVal > 90) {
      const error = new Error('Invalid latitude.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.lat = latVal;
  }
  
  if (updateData.lng !== undefined) {
    const lngVal = parseFloat(updateData.lng);
    if (isNaN(lngVal) || lngVal < -180 || lngVal > 180) {
      const error = new Error('Invalid longitude.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.lng = lngVal;
  }

  if (updateData.is_open !== undefined) {
    activeWorkshop.is_open = !!updateData.is_open;
  }

  if (updateData.is_mobile !== undefined) {
    activeWorkshop.is_mobile = !!updateData.is_mobile;
  }

  if (updateData.coverage_radius !== undefined) {
    const radiusVal = parseInt(updateData.coverage_radius, 10);
    if (isNaN(radiusVal) || radiusVal < 1 || radiusVal > 100) {
      const error = new Error('Invalid service radius.');
      error.status = 400;
      throw error;
    }
    activeWorkshop.coverage_radius = radiusVal;
  }

  if (updateData.cover_photo !== undefined) {
    activeWorkshop.cover_photo = updateData.cover_photo;
  }

  await activeWorkshop.save();

  // Also update staff link's workshop_name to match the new name
  if (updateData.name !== undefined) {
    await WorkshopStaff.updateMany(
      { workshop_id: activeWorkshop._id },
      { workshop_name: activeWorkshop.name }
    );
  }

  return activeWorkshop;
};

exports.updateCoverPhoto = async (userId, fileBuffer) => {
  const staffLinks = await WorkshopStaff.find({ user_id: userId, is_owner: true });
  
  let activeWorkshop = null;
  for (const staffLink of staffLinks) {
    const workshop = await Workshop.findById(staffLink.workshop_id);
    if (workshop && ['Active', 'Pending_Approval', 'Suspended'].includes(workshop.status)) {
      activeWorkshop = workshop;
      break;
    }
  }

  if (!activeWorkshop) {
    const error = new Error('Could not find your workshop information.');
    error.status = 404;
    throw error;
  }

  if (activeWorkshop.cover_photo && activeWorkshop.cover_photo.includes('cloudinary.com')) {
    try {
      const regex = /\/upload\/(?:v\d+\/)?([^\.]+)/;
      const match = activeWorkshop.cover_photo.match(regex);
      if (match && match[1]) {
        await deleteImage(match[1]);
      }
    } catch (deleteErr) {
      console.error('Failed to delete old cover photo:', deleteErr);
    }
  }

  const folder = `smart-flood-traffic/workshops/${activeWorkshop._id}`;
  const publicId = `cover-${activeWorkshop._id}-${Date.now()}`;
  const result = await uploadImage(fileBuffer, folder, publicId);

  activeWorkshop.cover_photo = result.secure_url;
  await activeWorkshop.save();


  return result.secure_url;
};

exports.getWorkshopById = async (id) => {
  const workshop = await Workshop.findOne({ _id: id, status: 'Active' }).lean();
  if (!workshop) {
    const error = new Error('Workshop not found.');
    error.status = 404;
    throw error;
  }

  // Lookup owner via WorkshopStaff join
  const ownerLink = await WorkshopStaff.findOne({ workshop_id: id, is_owner: true }).lean();
  let owner_id = null;
  let owner_name = '';
  if (ownerLink) {
    const owner = await User.findById(ownerLink.user_id).select('full_name').lean();
    owner_id = ownerLink.user_id;
    owner_name = owner ? owner.full_name : '';
  }

  return {
    ...workshop,
    id: workshop._id,
    status: workshop.is_open ? 'open' : 'closed',
    rating: workshop.rating_average || 0,
    reviewCount: workshop.rating_count || 0,
    owner_id,
    owner_name,
  };
};
