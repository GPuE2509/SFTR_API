const WorkshopReview = require('../../models/WorkshopReview');
const Workshop = require('../../models/Workshop');
const User = require('../../models/User');

exports.getReviewsByWorkshopId = async (workshopId) => {
  try {
    const reviews = await WorkshopReview.find({ workshop_id: workshopId })
      .populate('user_id', 'full_name avatar_url')
      .sort({ created_at: -1 })
      .lean();
      
    // Format response to be client-friendly
    return reviews.map(r => ({
      _id: r._id,
      workshop_id: r.workshop_id,
      rating: r.rating,
      content: r.content,
      created_at: r.created_at,
      user: r.user_id ? {
        _id: r.user_id._id,
        full_name: r.user_id.full_name,
        avatar_url: r.user_id.avatar_url
      } : {
        full_name: 'Anonymous',
        avatar_url: ''
      }
    }));
  } catch (error) {
    console.error('Error in reviewService.getReviewsByWorkshopId:', error);
    throw new Error('Failed to fetch reviews.');
  }
};

exports.addReview = async (userId, workshopId, rating, content) => {
  try {
    // Validate rating
    const parsedRating = parseInt(rating, 10);
    if (isNaN(parsedRating) || parsedRating < 1 || parsedRating > 5) {
      throw new Error('Rating score must be an integer between 1 and 5.');
    }

    // Verify workshop exists
    const workshop = await Workshop.findById(workshopId);
    if (!workshop) {
      const error = new Error('Workshop not found.');
      error.status = 404;
      throw error;
    }

    // Create the review
    const newReview = new WorkshopReview({
      workshop_id: workshopId,
      user_id: userId,
      rating: parsedRating,
      content: content ? content.trim() : ''
    });

    await newReview.save();

    // Recalculate rating average and rating count for the workshop
    const allReviews = await WorkshopReview.find({ workshop_id: workshopId });
    const count = allReviews.length;
    const sum = allReviews.reduce((acc, r) => acc + r.rating, 0);
    const average = count > 0 ? parseFloat((sum / count).toFixed(1)) : 0;

    workshop.rating_average = average;
    workshop.rating_count = count;
    await workshop.save();

    // Populate and return the review
    const populated = await WorkshopReview.findById(newReview._id)
      .populate('user_id', 'full_name avatar_url')
      .lean();

    return {
      _id: populated._id,
      workshop_id: populated.workshop_id,
      rating: populated.rating,
      content: populated.content,
      created_at: populated.created_at,
      user: populated.user_id ? {
        _id: populated.user_id._id,
        full_name: populated.user_id.full_name,
        avatar_url: populated.user_id.avatar_url
      } : {
        full_name: 'Anonymous',
        avatar_url: ''
      }
    };
  } catch (error) {
    console.error('Error in reviewService.addReview:', error);
    throw error;
  }
};
