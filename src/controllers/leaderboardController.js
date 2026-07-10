const User = require('../models/User');
const RankHistory = require('../models/RankHistory');
const snapshotService = require('../services/snapshotService');

const getPreviousPeriodValue = (time, year) => {
  const y = parseInt(year) || new Date().getFullYear();
  if (time === 'Weekly') {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    return snapshotService.getPeriodValue('Weekly', d);
  } else if (time === 'Monthly') {
    const d = new Date();
    d.setMonth(d.getMonth() - 1);
    return snapshotService.getPeriodValue('Monthly', d);
  } else if (time.startsWith('Q')) {
    const q = parseInt(time.replace('Q', ''));
    if (q === 1) return `${y - 1}-Q4`;
    return `${y}-Q${q - 1}`;
  }
  return null;
};

exports.getLeaderboard = async (req, res) => {
  try {
    const { tab = 'All', time = 'AllTime', year, page = 1, limit = 5 } = req.query;

    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    let query = {};
    if (tab === 'User') {
      query.role = 'User';
    } else if (tab === 'Volunteer') {
      query.role = 'Volunteer';
    } else if (tab === 'Workshop') {
      query.role = 'Workshop';
    } else {
      query.role = { $in: ['User', 'Volunteer', 'Workshop'] };
    }

    let sortField = 'contribution_points';
    if (time === 'Weekly') sortField = 'weekly_points';
    if (time === 'Monthly') sortField = 'monthly_points';

    if (time.startsWith('Q') || time.match(/^\d{4}$/)) {
      sortField = 'contribution_points'; 
    }

    const totalItems = await User.countDocuments(query);

    const pipeline = [
      { $match: query },
      { $sort: { [sortField]: -1 } },
      { $skip: skip },
      { $limit: limitNum },
      {
        $lookup: {
          from: 'volunteers',
          localField: '_id',
          foreignField: 'user_id',
          as: 'volunteer_info'
        }
      },
      {
        $lookup: {
          from: 'workshopstaffs',
          localField: '_id',
          foreignField: 'user_id',
          as: 'staff_info'
        }
      },
      {
        $lookup: {
          from: 'workshops',
          localField: 'staff_info.workshop_id',
          foreignField: '_id',
          as: 'workshop_info'
        }
      },
      {
        $project: {
          _id: 1,
          full_name: 1,
          avatar_url: 1,
          role: 1,
          district: 1,
          contribution_points: 1,
          weekly_points: 1,
          monthly_points: 1,
          vehicle_type: { $arrayElemAt: ['$volunteer_info.vehicle_type', 0] },
          vehicle_plate: { $arrayElemAt: ['$volunteer_info.vehicle_plate', 0] },
          workshop_address: { $arrayElemAt: ['$workshop_info.address', 0] },
        }
      }
    ];

    const leaders = await User.aggregate(pipeline);

    // Fetch previous ranks for trend calculation
    const prevPeriodValue = getPreviousPeriodValue(time, year);
    let prevRanksMap = {};
    if (prevPeriodValue) {
      let prevPeriodType = time;
      if (time.startsWith('Q')) prevPeriodType = 'Quarterly';
      const history = await RankHistory.find({
        period_type: prevPeriodType,
        period_value: prevPeriodValue,
        tab: tab
      });
      history.forEach(h => {
        prevRanksMap[h.user_id.toString()] = h.rank;
      });
    }

    const formattedLeaders = leaders.map((user, index) => {
      let info = '';
      if (user.role === 'User') {
        info = user.district || '';
      } else if (user.role === 'Volunteer') {
        if (user.vehicle_type && user.vehicle_plate) {
          info = `${user.vehicle_type} - ${user.vehicle_plate}`;
        } else {
          info = user.district || 'Unknown vehicle';
        }
      } else if (user.role === 'Workshop') {
        info = user.workshop_address || user.district || 'Unknown address';
      }

      let displayPoints = user.contribution_points || 0;
      if (time === 'Weekly') displayPoints = user.weekly_points || 0;
      if (time === 'Monthly') displayPoints = user.monthly_points || 0;

      const currentRank = skip + index + 1;
      const prevRank = prevRanksMap[user._id.toString()];
      let trend = 'same';
      
      if (time === 'AllTime') {
        trend = 'same'; // All-time doesn't have a specific previous period for trend
      } else if (!prevRank) {
        trend = 'new';
      } else if (currentRank < prevRank) {
        trend = 'up';
      } else if (currentRank > prevRank) {
        trend = 'down';
      }

      return {
        id: user._id,
        name: user.full_name,
        avatar_url: user.avatar_url,
        points: displayPoints,
        badge: user.role.toUpperCase(),
        info: info,
        originalRole: user.role,
        trend: trend
      };
    });

    res.json({
      data: formattedLeaders,
      totalItems,
      totalPages: Math.ceil(totalItems / limitNum),
      currentPage: pageNum
    });

  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ message: 'Server error fetching leaderboard' });
  }
};

exports.triggerSnapshot = async (req, res) => {
  try {
    await snapshotService.takeAllSnapshots();
    res.json({ message: 'Snapshots taken successfully!' });
  } catch (error) {
    console.error('Error taking snapshots:', error);
    res.status(500).json({ message: 'Error taking snapshots' });
  }
};
