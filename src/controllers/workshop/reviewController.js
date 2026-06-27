const reviewService = require('../../services/workshop/reviewService');

exports.getWorkshopReviews = async (req, res) => {
  try {
    const { id } = req.params;
    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Workshop ID parameter is required.'
      });
    }

    const reviews = await reviewService.getReviewsByWorkshopId(id);
    return res.status(200).json({
      success: true,
      data: reviews
    });
  } catch (error) {
    console.error('Error in getWorkshopReviews controller:', error);
    return res.status(500).json({
      success: false,
      message: error.message || 'Server error while fetching reviews.'
    });
  }
};

exports.createWorkshopReview = async (req, res) => {
  try {
    const { id } = req.params;
    const { rating, content } = req.body;
    const userId = req.user._id;

    if (!id) {
      return res.status(400).json({
        success: false,
        message: 'Workshop ID is required.'
      });
    }

    if (rating === undefined || rating === null) {
      return res.status(400).json({
        success: false,
        message: 'Rating score is required.'
      });
    }

    const review = await reviewService.addReview(userId, id, rating, content);
    return res.status(201).json({
      success: true,
      data: review
    });
  } catch (error) {
    console.error('Error in createWorkshopReview controller:', error);
    const status = error.status || 500;
    return res.status(status).json({
      success: false,
      message: error.message || 'Server error while creating review.'
    });
  }
};
