const User = require('../models/User');
const Match = require('../models/Match');
const Result = require('../models/Result');
const bcrypt = require('bcryptjs');

// ===== УПРАВЛЕНИЕ ПОЛЬЗОВАТЕЛЯМИ =====

// Получить всех пользователей с фильтрами
const getAllUsers = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      role,
      isBlocked,
      search,
      sortBy = 'createdAt',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    
    // Фильтры
    if (role) {
      // Поддерживаем как legacy поле role, так и новый массив roles
      if (Array.isArray(role)) {
        query.$or = [
          { role: { $in: role } },
          { roles: { $in: role } }
        ];
      } else {
        query.$or = [
          { role },
          { roles: role }
        ];
      }
    }
    if (isBlocked !== undefined) query.isBlocked = isBlocked === 'true';
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const users = await User.find(query)
      .select('-password -resetPasswordToken')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .lean();

    // Обеспечиваем наличие roles и согласованность role для выдачи в список
    const normalizedUsers = users.map(u => {
      const roles = Array.isArray(u.roles) && u.roles.length > 0 ? u.roles : [u.role || 'player'];
      // Приоритет основной роли: super_admin > court_admin > coach > admin_view > player
      let role = 'player';
      if (roles.includes('super_admin')) role = 'super_admin';
      else if (roles.includes('court_admin')) role = 'court_admin';
      else if (roles.includes('coach')) role = 'coach';
      else if (roles.includes('admin_view')) role = 'admin_view';
      return { ...u, roles, role };
    });

    const total = await User.countDocuments(query);

    res.json({
      users: normalizedUsers, // legacy ключ
      items: normalizedUsers,
      totalPages: Math.ceil(total / limit),
      currentPage: Number(page),
      total
    });
  } catch (error) {
    console.error('Get all users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Обновить роль(и) пользователя
const updateUserRole = async (req, res) => {
  try {
    const { role, roles, permissions, managedCourts, notes } = req.body;
    const allowed = ['player', 'coach', 'court_admin', 'admin_view', 'super_admin'];
    if (roles) {
      if (!Array.isArray(roles) || roles.length === 0 || !roles.every(r => allowed.includes(r))) {
        return res.status(400).json({ error: 'Invalid roles', code: 'INVALID_ROLES' });
      }
    } else if (role) {
      if (!allowed.includes(role)) {
        return res.status(400).json({ error: 'Invalid role', code: 'INVALID_ROLE' });
      }
    } else {
      return res.status(400).json({ error: 'Role(s) required', code: 'ROLE_REQUIRED' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND' });
    }

    // Cannot modify own role
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ code: 'CANNOT_MODIFY_SELF' });
    }

    if (roles) {
      user.roles = roles;
    } else if (role) {
      user.roles = [role];
    }
    if (permissions) user.permissions = permissions;
    if (managedCourts) user.managedCourts = managedCourts;
    if (notes !== undefined) user.notes = notes;

    await user.save();

    const cleanUser = user.toObject({ transform: (doc, ret) => { delete ret.password; return ret; } });
    // Совместимость: возвращаем и legacy ключи, и новые
    res.json({
      message: 'User role updated successfully',
      user: cleanUser,
      success: true,
      item: cleanUser
    });
  } catch (error) {
    console.error('❌ Update user role error:', error);
    res.status(500).json({ error: 'Server error', code: 'SERVER_ERROR' });
  }
};

// Заблокировать пользователя
const blockUser = async (req, res) => {
  try {
    const { reason } = req.body;
    
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND' });
    }

    // Cannot block self
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ code: 'CANNOT_BLOCK_SELF' });
    }

    // Cannot block another super admin
    const roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
    if (roles.includes('super_admin')) {
      return res.status(400).json({ code: 'CANNOT_BLOCK_SUPER_ADMIN' });
    }

    user.isBlocked = true;
    if (reason) {
      user.notes = (user.notes || '') + `\nBlocked: ${reason} (${new Date().toISOString()})`;
    }

    await user.save();

    res.json({ message: 'User blocked successfully' });
  } catch (error) {
    console.error('Block user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Разблокировать пользователя
const unblockUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND' });
    }

    user.isBlocked = false;
    user.notes = (user.notes || '') + `\nUnblocked (${new Date().toISOString()})`;

    await user.save();

    res.json({ message: 'User unblocked successfully' });
  } catch (error) {
    console.error('Unblock user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Удалить пользователя
const deleteUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND' });
    }

    // Cannot delete self
    if (user._id.toString() === req.user._id.toString()) {
      return res.status(400).json({ code: 'CANNOT_DELETE_SELF' });
    }

    // Cannot delete another super admin
    const roles = Array.isArray(user.roles) && user.roles.length > 0 ? user.roles : [user.role];
    if (roles.includes('super_admin')) {
      return res.status(400).json({ code: 'CANNOT_DELETE_SUPER_ADMIN' });
    }

    // Удаляем пользователя из всех матчей
    await Match.updateMany(
      { participants: user._id },
      { $pull: { participants: user._id } }
    );

    // Cancel matches where the user was the creator
    await Match.updateMany(
      { creator: user._id },
      { status: 'cancelled' }
    );

    await User.findByIdAndDelete(req.params.id);

    res.json({ message: 'User deleted successfully' });
  } catch (error) {
    console.error('Delete user error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Сбросить пароль пользователя
const resetUserPassword = async (req, res) => {
  try {
    const { newPassword } = req.body;
    
    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ code: 'INVALID_PASSWORD' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND' });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.notes = (user.notes || '') + `\nPassword reset by admin (${new Date().toISOString()})`;

    await user.save();

    res.json({ message: 'Password reset successfully' });
  } catch (error) {
    console.error('Reset user password error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Объединить пользователей
const mergeUsers = async (req, res) => {
  try {
    const { primaryUserId, secondaryUserId } = req.body;
    
    if (!primaryUserId || !secondaryUserId) {
      return res.status(400).json({ code: 'MISSING_USER_IDS' });
    }

    if (primaryUserId === secondaryUserId) {
      return res.status(400).json({ code: 'SAME_USER_ID' });
    }

    const primaryUser = await User.findById(primaryUserId);
    const secondaryUser = await User.findById(secondaryUserId);

    if (!primaryUser || !secondaryUser) {
      return res.status(404).json({ code: 'USER_NOT_FOUND' });
    }

    // Move data from secondary account to primary
    primaryUser.ratingHistory = [...primaryUser.ratingHistory, ...secondaryUser.ratingHistory];
    
    // Update matches
    await Match.updateMany(
      { creator: secondaryUser._id },
      { creator: primaryUser._id }
    );

    await Match.updateMany(
      { participants: secondaryUser._id },
      { $set: { 'participants.$': primaryUser._id } }
    );

    // Delete secondary account
    await User.findByIdAndDelete(secondaryUserId);

    res.json({ message: 'Users merged successfully' });
  } catch (error) {
    console.error('Merge users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить статистику пользователя
const getUserStats = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND' });
    }

    const matchesCreated = await Match.countDocuments({ creator: user._id });
    const participatedMatches = await Match.find({ participants: user._id }, { _id: 1 });
    const matchesParticipated = participatedMatches.length;
    const resultsConfirmed = await Result.countDocuments({ confirmedBy: user._id });

    // Aggregate personal stats across all confirmed results of these matches
    let gamesPlayed = 0;
    let wins = 0;
    let losses = 0;
    let draws = 0;
    // head-to-head: opponentId -> { games, wins, losses, draws }
    const h2hMap = new Map();
    try {
      const matchIds = participatedMatches.map(m => m._id);
      if (matchIds.length > 0) {
        const results = await Result.find({ match: { $in: matchIds } });
        for (const r of results) {
          for (const g of (r.games || [])) {
            const inTeam1 = (g.team1 || []).some(p => p.toString() === user._id.toString());
            const inTeam2 = !inTeam1 && (g.team2 || []).some(p => p.toString() === user._id.toString());
            if (!inTeam1 && !inTeam2) continue;
            gamesPlayed++;
            if (g.team1Score === g.team2Score) { draws++; continue; }
            const userWon = (inTeam1 && g.team1Score > g.team2Score) || (inTeam2 && g.team2Score > g.team1Score);
            if (userWon) wins++; else losses++;

            // update h2h against each opponent from the opposite team
            const opponents = (inTeam1 ? g.team2 : g.team1) || [];
            for (const opp of opponents) {
              const oid = opp.toString();
              if (!h2hMap.has(oid)) h2hMap.set(oid, { games: 0, wins: 0, losses: 0, draws: 0 });
              const rec = h2hMap.get(oid);
              rec.games += 1;
              if (g.team1Score === g.team2Score) rec.draws += 1; else if (userWon) rec.wins += 1; else rec.losses += 1;
            }
          }
        }
      }
    } catch (e) {
      console.warn('getUserStats: failed to aggregate game stats', e);
    }
    const winPercent = gamesPlayed > 0 ? +((wins / gamesPlayed) * 100).toFixed(1) : 0;

    // подтягиваем имена/почты оппонентов и сортируем по количеству игр
    let headToHead = [];
    try {
      const opponentIds = Array.from(h2hMap.keys());
      if (opponentIds.length > 0) {
        const opponents = await User.find({ _id: { $in: opponentIds } }).select('name email');
        const byId = new Map(opponents.map(o => [o._id.toString(), o]));
        headToHead = opponentIds.map(id => {
          const base = h2hMap.get(id) || { games: 0, wins: 0, losses: 0, draws: 0 };
          const u = byId.get(id);
          return {
            opponentId: id,
            name: u?.name,
            email: u?.email,
            games: base.games,
            wins: base.wins,
            losses: base.losses,
            draws: base.draws,
            score: `${base.wins} - ${base.losses}`
          };
        }).sort((a, b) => b.games - a.games);
      }
    } catch (e) {
      console.warn('getUserStats: failed to enrich headToHead', e);
    }

    const stats = {
      user: user.toObject({ transform: (doc, ret) => { delete ret.password; return ret; } }),
      matchesCreated,
      matchesParticipated,
      resultsConfirmed,
      ratingHistory: user.ratingHistory.length,
      gamesPlayed,
      wins,
      losses,
      draws,
      winPercent,
      headToHead
    };

    res.json(stats);
  } catch (error) {
    console.error('Get user stats error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== УПРАВЛЕНИЕ МАТЧАМИ =====

// Получить все матчи
const getAllMatches = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 20,
      status,
      isPrivate,
      search,
      sortBy = 'startDateTime',
      sortOrder = 'desc'
    } = req.query;

    const query = {};
    
    if (status) query.status = status;
    if (isPrivate !== undefined) query.isPrivate = isPrivate === 'true';
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: 'i' } },
        { description: { $regex: search, $options: 'i' } }
      ];
    }

    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === 'desc' ? -1 : 1;

    const matches = await Match.find(query)
      .populate('creator', 'name email role roles')
      .populate('participants', 'name email rating')
      .sort(sortOptions)
      .limit(limit * 1)
      .skip((page - 1) * limit);

    const total = await Match.countDocuments(query);

    res.json({
      matches,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Get all matches error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Принудительно удалить матч
const forceDeleteMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ code: 'MATCH_NOT_FOUND' });
    }

    // Удаляем результат если есть
    await Result.findOneAndDelete({ match: match._id });

    // Удаляем записи из ratingHistory участников
    const users = await User.find({ _id: { $in: match.participants } });
    for (const user of users) {
      user.ratingHistory = user.ratingHistory.filter(
        rh => rh.matchId?.toString() !== match._id.toString()
      );
      user.markModified('ratingHistory');
      await user.save();
    }

    await Match.findByIdAndDelete(req.params.id);

    res.json({ message: 'Match force deleted successfully' });
  } catch (error) {
    console.error('Force delete match error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Принудительно отменить матч
const forceCancelMatch = async (req, res) => {
  try {
    const { reason } = req.body;
    
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ code: 'MATCH_NOT_FOUND' });
    }

    match.status = 'cancelled';
    if (reason) {
      match.description = (match.description || '') + `\n\nCancelled by admin: ${reason}`;
    }

    await match.save();

    res.json({ message: 'Match force cancelled successfully' });
  } catch (error) {
    console.error('Force cancel match error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Обновить результат матча
const updateMatchResult = async (req, res) => {
  try {
    const { games } = req.body;
    
    const match = await Match.findById(req.params.id);
    if (!match) {
      return res.status(404).json({ code: 'MATCH_NOT_FOUND' });
    }

    let result = await Result.findOne({ match: match._id });
    
    if (result) {
      result.games = games;
      await result.save();
    } else {
      result = new Result({
        match: match._id,
        games,
        confirmedBy: req.user._id
      });
      await result.save();
    }

    match.status = 'finished';
    await match.save();

    res.json({ message: 'Match result updated successfully', result });
  } catch (error) {
    console.error('Update match result error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== АНАЛИТИКА =====

// Общая аналитика
const getAnalyticsOverview = async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const totalMatches = await Match.countDocuments();
    const totalResults = await Result.countDocuments();
    
    // Combined activity over the last 30 days
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    // Get user IDs for different types of activity
    const matchParticipants = await Match.distinct('participants', { 
      startDateTime: { $gte: last30Days } 
    });
    const matchCreators = await Match.distinct('creator', { 
      createdAt: { $gte: last30Days } 
    });
    const resultConfirmers = await Result.distinct('confirmedBy', { 
      createdAt: { $gte: last30Days } 
    });
    
    // Подсчитываем уникальных активных пользователей
    const activeUsers = await User.countDocuments({
      $or: [
        { _id: { $in: matchParticipants } },
        { _id: { $in: matchCreators } },
        { _id: { $in: resultConfirmers } },
        { lastLoginAt: { $gte: last30Days } } // backwards compatibility
      ]
    });

    const usersByRole = await User.aggregate([
      {
        $addFields: {
          role: { $ifNull: ['$role', 'player'] },
          isBlocked: { $ifNull: ['$isBlocked', false] }
        }
      },
      {
        $group: {
          _id: {
            role: '$role',
            isBlocked: '$isBlocked'
          },
          count: { $sum: 1 }
        }
      },
      {
        $project: {
          _id: {
            $cond: {
              if: { $eq: ['$_id.role', 'player'] },
              then: {
                $cond: {
                  if: { $eq: ['$_id.isBlocked', true] },
                  then: 'blocked_player',
                  else: 'active_player'
                }
              },
              else: '$_id.role'
            }
          },
          count: 1
        }
      }
    ]);

    const matchesByStatus = await Match.aggregate([
      { $group: { _id: '$status', count: { $sum: 1 } } },
      {
        $project: {
          _id: 1,
          count: 1
        }
      }
    ]);

    // Add statuses with zero counts
    const allStatuses = ['upcoming', 'finished', 'cancelled'];
    const statusMap = new Map(matchesByStatus.map(item => [item._id, item.count]));
    
    const completeMatchesByStatus = allStatuses.map(status => ({
      _id: status,
      count: statusMap.get(status) || 0
    }));

    // Detailed activity stats
    const activityDetails = {
      matchParticipants: matchParticipants.length,
      matchCreators: matchCreators.length,
      resultConfirmers: resultConfirmers.length,
      loginUsers: await User.countDocuments({ lastLoginAt: { $gte: last30Days } })
    };

    res.json({
      totalUsers,
      totalMatches,
      totalResults,
      activeUsers,
      activityDetails,
      usersByRole,
      matchesByStatus: completeMatchesByStatus
    });
  } catch (error) {
    console.error('Get analytics overview error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// User analytics
const getUserAnalytics = async (req, res) => {
  try {
    const registrationsByMonth = await User.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$createdAt' },
            month: { $month: '$createdAt' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const topPlayersByRating = await User.find({ 
      $or: [
        { role: 'player' },
        { role: 'super_admin' },
        { role: 'court_admin' }
      ]
    })
      .sort({ rating: -1 })
      .limit(10)
      .select('name email rating role');

    const blockedUsers = await User.countDocuments({ isBlocked: true });

    res.json({
      registrationsByMonth,
      topPlayersByRating,
      blockedUsers
    });
  } catch (error) {
    console.error('Get user analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Match analytics
const getMatchAnalytics = async (req, res) => {
  try {
    const matchesByMonth = await Match.aggregate([
      {
        $group: {
          _id: {
            year: { $year: '$startDateTime' },
            month: { $month: '$startDateTime' }
          },
          count: { $sum: 1 }
        }
      },
      { $sort: { '_id.year': 1, '_id.month': 1 } }
    ]);

    const popularCourts = await Match.aggregate([
      { $group: { _id: '$place', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    const avgParticipants = await Match.aggregate([
      { $project: { participantCount: { $size: '$participants' } } },
      { $group: { _id: null, avgParticipants: { $avg: '$participantCount' } } }
    ]);

    res.json({
      matchesByMonth,
      popularCourts,
      avgParticipants: avgParticipants[0]?.avgParticipants || 0
    });
  } catch (error) {
    console.error('Get match analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Activity analytics
const getActivityAnalytics = async (req, res) => {
  try {
    const last30Days = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    
    const recentMatches = await Match.countDocuments({
      createdAt: { $gte: last30Days }
    });

    const recentResults = await Result.countDocuments({
      createdAt: { $gte: last30Days }
    });

    // Комбинированная активность пользователей
    const matchParticipants = await Match.distinct('participants', { 
      startDateTime: { $gte: last30Days } 
    });
    const matchCreators = await Match.distinct('creator', { 
      createdAt: { $gte: last30Days } 
    });
    const resultConfirmers = await Result.distinct('confirmedBy', { 
      createdAt: { $gte: last30Days } 
    });
    
    const activeUsers = await User.countDocuments({
      $or: [
        { _id: { $in: matchParticipants } },
        { _id: { $in: matchCreators } },
        { _id: { $in: resultConfirmers } },
        { lastLoginAt: { $gte: last30Days } } // для обратной совместимости
      ]
    });

    res.json({
      recentMatches,
      recentResults,
      activeUsers
    });
  } catch (error) {
    console.error('Get activity analytics error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== SYSTEM SETTINGS =====

// Get system settings (stub)
const getSystemSettings = async (req, res) => {
  try {
    // In the future we can create a separate Settings model
    const settings = {
      maxMatchDuration: 180,
      resultConfirmationHours: 24,
      matchCancellationHours: 48,
      maxParticipants: 6,
      defaultRating: 2.0,
      emailNotifications: true
    };

    res.json(settings);
  } catch (error) {
    console.error('Get system settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Update system settings (stub)
const updateSystemSettings = async (req, res) => {
  try {
    // In the future, update settings in DB
    const settings = req.body;
    
    res.json({ message: 'Settings updated successfully', settings });
  } catch (error) {
    console.error('Update system settings error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// ===== DATA EXPORT =====

// Export users
const exportUsers = async (req, res) => {
  try {
    const users = await User.find({})
      .select('-password -resetPasswordToken')
      .lean();

    // Convert to CSV-like format
    const csvData = users.map(user => ({
      id: user._id,
      name: user.name,
      email: user.email,
      role: user.role,
      rating: user.rating,
      isBlocked: user.isBlocked,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt
    }));

    res.json({ data: csvData, filename: `users-export-${new Date().toISOString().split('T')[0]}.json` });
  } catch (error) {
    console.error('Export users error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Export matches
const exportMatches = async (req, res) => {
  try {
    const matches = await Match.find({})
      .populate('creator', 'name email')
      .populate('participants', 'name email')
      .lean();

    const csvData = matches.map(match => ({
      id: match._id,
      title: match.title,
      place: match.place,
      startDateTime: match.startDateTime,
      duration: match.duration,
      status: match.status,
      isPrivate: match.isPrivate,
      participantCount: match.participants.length,
      creatorName: match.creator?.name,
      creatorEmail: match.creator?.email,
      createdAt: match.createdAt
    }));

    res.json({ data: csvData, filename: `matches-export-${new Date().toISOString().split('T')[0]}.json` });
  } catch (error) {
    console.error('Export matches error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  // Управление пользователями
  getAllUsers,
  updateUserRole,
  blockUser,
  unblockUser,
  deleteUser,
  resetUserPassword,
  mergeUsers,
  getUserStats,
  
  // Управление матчами
  getAllMatches,
  forceDeleteMatch,
  forceCancelMatch,
  updateMatchResult,
  
  // Аналитика
  getAnalyticsOverview,
  getUserAnalytics,
  getMatchAnalytics,
  getActivityAnalytics,
  
  // Системные настройки
  getSystemSettings,
  updateSystemSettings,
  
  // Экспорт
  exportUsers,
  exportMatches
}; 