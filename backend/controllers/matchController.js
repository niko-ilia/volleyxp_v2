const Match = require('../models/Match');
const User = require('../models/User');
const Result = require('../models/Result');
const Court = require('../models/Court');

// Создать матч
const createMatch = async (req, res) => {
  try {
    const { title, description, place, startDateTime, duration, maxParticipants, level, courtId } = req.body;
    // Валидация обязательных полей (place может прийти пустым, если есть courtId)
    if (!title || !startDateTime || !duration || !level || (!place && !courtId)) {
      return res.status(400).json({ code: 'VALIDATION_ERROR', message: 'Missing required fields' });
    }
    // Проверка, что дата в будущем
    const start = new Date(startDateTime);
    if (isNaN(start) || start < new Date()) {
      return res.status(400).json({ code: 'DATE_MUST_BE_FUTURE', message: 'Start date must be in the future' });
    }
    
    let finalPlace = place;
    let finalCourtId = undefined;
    if (courtId) {
      // Валидируем корт и берем его имя
      const court = await Court.findById(courtId);
      if (!court || court.isDeleted) {
        return res.status(400).json({ code: 'COURT_NOT_FOUND', message: 'Court not found' });
      }
      if (court.status !== 'active') {
        return res.status(400).json({ code: 'COURT_NOT_ACTIVE', message: 'Court is not active' });
      }
      finalPlace = court.name;
      finalCourtId = court._id;
    }

    const match = new Match({
      title,
      description,
      place: finalPlace,
      courtId: finalCourtId,
      level,
      startDateTime,
      duration,
      maxParticipants: maxParticipants || 6,
      creator: req.user._id,
      participants: [req.user._id], // Создатель автоматически участвует
      isPrivate: req.body.isPrivate === true
    });

    await match.save();

    // Фиксируем join snapshot для создателя
    match.joinSnapshots = match.joinSnapshots || [];
    match.joinSnapshots.push({ userId: req.user._id, rating: req.user.rating });
    await match.save();

    // Добавляем запись в ratingHistory для всех участников (на старте только создатель)
    const user = await User.findById(req.user._id);
    if (user) {
      user.ratingHistory.push({
        date: new Date(),
        delta: 0,
        newRating: user.rating,
        matchId: match._id,
        comment: 'Match without result',
        details: [],
        joinRating: user.rating // сохраняем рейтинг на момент входа
      });
      user.markModified('ratingHistory');
      await user.save();
    }
    
    // Заполняем данные создателя
    await match.populate('creator', 'name email');
    await match.populate('participants', 'name email');
    await match.populate('courtId', 'name address status');

    res.status(201).json(match);
  } catch (error) {
    console.error('Create match error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить все матчи (или только будущие, если future=1)
const getMatches = async (req, res) => {
  try {
    const { future } = req.query;
    let query;
    if (req.user) {
      query = {
        $or: [
          { isPrivate: false },
          { isPrivate: true, participants: req.user._id }
        ]
      };
    } else {
      query = { isPrivate: false };
    }
    if (future === '1') {
      // Показываем только матчи, которые еще не закончились
      // (startDateTime + duration*60*1000) > сейчас
      query.$expr = {
        $gt: [
          { $add: ["$startDateTime", { $multiply: ["$duration", 60000] }] },
          new Date()
        ]
      };
    }
    const matches = await Match.find(query)
      .populate('creator', 'name email')
      .populate('participants', 'name email rating')
      .populate('courtId', 'name address status')
      .sort({ startDateTime: 1 });
    res.json(matches);
  } catch (error) {
    console.error('Get matches error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить матч по ID
const getMatchById = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id)
      .populate('creator', 'name email')
      .populate('participants', 'name email rating')
      .populate('courtId', 'name address status');

    if (!match) {
      return res.status(404).json({ code: 'MATCH_NOT_FOUND' });
    }

    res.json(match);
  } catch (error) {
    console.error('Get match by id error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Присоединиться к матчу
const joinMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    
    if (!match) {
      return res.status(404).json({ code: 'MATCH_NOT_FOUND' });
    }

    // Проверяем, не участвует ли уже пользователь
    if (match.participants.some(p => p.toString() === req.user._id.toString())) {
      return res.status(400).json({ code: 'ALREADY_JOINED' });
    }

    // Нельзя присоединиться к матчу, если с начала прошло более 12 часов
    const joinDeadline = new Date(match.startDateTime.getTime() + 12 * 60 * 60 * 1000);
    if (new Date() > joinDeadline) {
      return res.status(400).json({ code: 'MATCH_ALREADY_PASSED' });
    }

    // Проверяем, есть ли место
    if (match.participants.length >= match.maxParticipants) {
      return res.status(400).json({ code: 'MATCH_FULL' });
    }

    match.participants.push(req.user._id);
    match.joinSnapshots = match.joinSnapshots || [];
    match.joinSnapshots.push({ userId: req.user._id, rating: req.user.rating });
    await match.save();

    // Добавляем запись в ratingHistory для нового участника
    const user = await User.findById(req.user._id);
    if (user) {
      // Проверяем, нет ли уже записи для этого матча
      const already = user.ratingHistory.some(rh => rh.matchId?.toString() === match._id.toString());
      if (!already) {
        user.ratingHistory.push({
          date: new Date(),
          delta: 0,
          newRating: user.rating,
          matchId: match._id,
          comment: 'Match without result',
          details: [],
          joinRating: user.rating // сохраняем рейтинг на момент входа
        });
        user.markModified('ratingHistory');
        await user.save();
      }
    }

    await match.populate('creator', 'name email');
    await match.populate('participants', 'name email rating');

    res.json(match);
  } catch (error) {
    console.error('Join match error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Добавить пользователя в матч (создатель или админ)
const addPlayerToMatch = async (req, res) => {
  try {
    const { playerEmail } = req.body;
    const match = await Match.findById(req.params.id);
    
    if (!match) {
      return res.status(404).json({ code: 'MATCH_NOT_FOUND' });
    }

    // Проверяем права: только создатель матча или админ может добавлять игроков
    const isCreator = match.creator.toString() === req.user._id.toString();
    const roles = Array.isArray(req.user.roles) && req.user.roles.length > 0 ? req.user.roles : [req.user.role];
    let isAdmin = roles.includes('super_admin');
    if (!isAdmin && roles.includes('court_admin')) {
      // court_admin может добавлять только в матчи на своих кортах
      if (match.courtId) {
        const courtIdStr = match.courtId.toString();
        const managed = Array.isArray(req.user.managedCourts) ? req.user.managedCourts.map(String) : [];
        isAdmin = managed.includes(courtIdStr);
      } else {
        isAdmin = false;
      }
    }
    
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ code: 'INSUFFICIENT_PERMISSIONS' });
    }

    // Получаем пользователя по email
    const user = await User.findOne({ email: { $regex: new RegExp(`^${playerEmail}$`, 'i') } });
    if (!user) {
      return res.status(404).json({ code: 'USER_NOT_FOUND' });
    }

    // Проверяем, не участвует ли уже пользователь
    if (match.participants.some(p => p.toString() === user._id.toString())) {
      return res.status(400).json({ code: 'ALREADY_JOINED' });
    }

    // Нельзя присоединиться к матчу, если с начала прошло более 12 часов
    const joinDeadline = new Date(match.startDateTime.getTime() + 12 * 60 * 60 * 1000);
    if (new Date() > joinDeadline) {
      return res.status(400).json({ code: 'MATCH_ALREADY_PASSED' });
    }

    // Проверяем, есть ли место
    if (match.participants.length >= match.maxParticipants) {
      return res.status(400).json({ code: 'MATCH_FULL' });
    }

    match.participants.push(user._id);
    match.joinSnapshots = match.joinSnapshots || [];
    match.joinSnapshots.push({ userId: user._id, rating: user.rating });
    await match.save();

    // Добавляем запись в ratingHistory для нового участника
    if (user) {
      // Проверяем, нет ли уже записи для этого матча
      const already = user.ratingHistory.some(rh => rh.matchId?.toString() === match._id.toString());
      if (!already) {
        user.ratingHistory.push({
          date: new Date(),
          delta: 0,
          newRating: user.rating,
          matchId: match._id,
          comment: 'Match without result',
          details: [],
          joinRating: user.rating // сохраняем рейтинг на момент входа
        });
        user.markModified('ratingHistory');
        await user.save();
      }
    }

    await match.populate('creator', 'name email');
    await match.populate('participants', 'name email rating');

    res.json(match);
  } catch (error) {
    console.error('Add player to match error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Покинуть матч
const leaveMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    
    if (!match) {
      return res.status(404).json({ code: 'MATCH_NOT_FOUND' });
    }

    // Нельзя покинуть матч, если он уже прошёл
    if (new Date(match.startDateTime) < new Date()) {
      return res.status(400).json({ code: 'MATCH_ALREADY_PASSED' });
    }

    // Проверяем, участвует ли пользователь
    if (!match.participants.some(p => p.toString() === req.user._id.toString())) {
      return res.status(400).json({ code: 'NOT_JOINED' });
    }

    // Создатель не может покинуть матч
    if (match.creator.toString() === req.user._id.toString()) {
      return res.status(400).json({ code: 'CREATOR_CANNOT_LEAVE' });
    }

    match.participants = match.participants.filter(
      participant => participant.toString() !== req.user._id.toString()
    );
    await match.save();

    // Удаляем запись из ratingHistory для этого матча
    const user = await User.findById(req.user._id);
    if (user) {
      user.ratingHistory = user.ratingHistory.filter(rh => rh.matchId?.toString() !== match._id.toString());
      user.markModified('ratingHistory');
      await user.save();
    }

    await match.populate('creator', 'name email');
    await match.populate('participants', 'name email rating');

    res.json(match);
  } catch (error) {
    console.error('Leave match error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Удалить участника из матча (создатель/админ, с ограничениями)
const removePlayerFromMatch = async (req, res) => {
  try {
    const { id, participantId } = { id: req.params.id, participantId: req.params.participantId };
    const match = await Match.findById(id);
    if (!match) return res.status(404).json({ code: 'MATCH_NOT_FOUND' });

    // Права: организатор матча или админ
    const isCreator = match.creator.toString() === req.user._id.toString();
    const roles = Array.isArray(req.user.roles) && req.user.roles.length > 0 ? req.user.roles : [req.user.role];
    let isAdmin = roles.includes('super_admin');
    if (!isAdmin && roles.includes('court_admin')) {
      if (match.courtId) {
        const managed = Array.isArray(req.user.managedCourts) ? req.user.managedCourts.map(String) : [];
        isAdmin = managed.includes(match.courtId.toString());
      } else {
        isAdmin = false;
      }
    }
    if (!isCreator && !isAdmin) {
      return res.status(403).json({ code: 'INSUFFICIENT_PERMISSIONS' });
    }

    // Нельзя удалять создателя
    if (match.creator.toString() === String(participantId)) {
      return res.status(400).json({ code: 'CANNOT_REMOVE_CREATOR' });
    }

    // Участник должен быть в матче
    if (!match.participants.some(p => p.toString() === String(participantId))) {
      return res.status(404).json({ code: 'PARTICIPANT_NOT_FOUND' });
    }

    // Ограничение 24 часа после начала (кроме супер-админа)
    if (!roles.includes('super_admin')) {
      const now = new Date();
      const matchStart = new Date(match.startDateTime);
      const diffHours = (now - matchStart) / (1000 * 60 * 60);
      if (diffHours > 24) {
        return res.status(403).json({ code: 'REMOVE_TOO_LATE' });
      }
    }

    // Нельзя удалять, если есть подтвержденный результат
    const existingResult = await Result.findOne({ match: match._id });
    if (existingResult && existingResult.isConfirmed) {
      return res.status(400).json({ code: 'RESULT_CONFIRMED' });
    }

    // Если есть черновик, вычищаем игрока из всех геймов, а геймы без полноценных команд удаляем
    if (existingResult && !existingResult.isConfirmed) {
      const pid = String(participantId);
      const cleaned = (existingResult.games || []).map(g => ({
        ...g.toObject?.() || g,
        team1: (g.team1 || []).filter(u => u.toString() !== pid),
        team2: (g.team2 || []).filter(u => u.toString() !== pid)
      })).filter(g => (g.team1?.length === 2 && g.team2?.length === 2));
      if (cleaned.length !== (existingResult.games || []).length) {
        existingResult.games = cleaned;
        await existingResult.save();
      }
    }

    // Удаляем участника
    match.participants = match.participants.filter(p => p.toString() !== String(participantId));
    await match.save();

    // Чистим ratingHistory у пользователя для этого матча
    const user = await User.findById(participantId);
    if (user) {
      user.ratingHistory = (user.ratingHistory || []).filter(rh => rh.matchId?.toString() !== match._id.toString());
      user.markModified('ratingHistory');
      await user.save();
    }

    await match.populate('creator', 'name email');
    await match.populate('participants', 'name email rating');
    return res.json({ item: match, success: true });
  } catch (error) {
    console.error('Remove player from match error:', error);
    return res.status(500).json({ message: 'Server error' });
  }
};

// Обновить матч (удалить или отменить)
const updateMatch = async (req, res) => {
  try {
    const match = await Match.findById(req.params.id);
    if (!match) return res.status(404).json({ code: 'MATCH_NOT_FOUND' });
    if (match.creator.toString() !== req.user._id.toString()) {
      return res.status(403).json({ code: 'NOT_AUTHORIZED' });
    }
    const action = req.body?.action;
    if (action === 'delete') {
      // Можно удалить только если матч не начался или есть результат
      const now = new Date();
      const matchEnd = new Date(match.startDateTime.getTime() + match.duration * 60000);
      const result = await Result.findOne({ match: match._id });
      
      // Проверяем: матч не начался ИЛИ уже закончился и есть результат
      const canDelete = now < match.startDateTime || (now > matchEnd && result);
      
      if (canDelete) {
    // Удаляем запись из ratingHistory для всех участников
    const users = await User.find({ _id: { $in: match.participants } });
    for (const user of users) {
      user.ratingHistory = user.ratingHistory.filter(rh => rh.matchId?.toString() !== match._id.toString());
      user.markModified('ratingHistory');
      await user.save();
    }
    await Match.findByIdAndDelete(req.params.id);
        return res.json({ message: 'Match deleted' });
      } else {
        // Определяем причину невозможности удаления
        if (now >= match.startDateTime && now <= matchEnd && !result) {
          return res.status(400).json({ code: 'MATCH_IN_PROGRESS' });
        } else {
          return res.status(400).json({ code: 'CANNOT_DELETE_MATCH' });
        }
      }
    } else if (action === 'cancel') {
      // Разрешаем:
      // 1) До начала матча (always, если нет результата)
      // 2) После конца матча, если нет результата и прошло ≤48ч
      if (match.status === 'cancelled') {
        return res.status(400).json({ code: 'ALREADY_CANCELLED' });
      }
      const start = new Date(match.startDateTime);
      const end = new Date(match.startDateTime.getTime() + match.duration * 60000);
      const now = new Date();
      const result = await Result.findOne({ match: match._id });
      if (result) {
        return res.status(400).json({ code: 'RESULT_EXISTS' });
      }
      // В процессе игры отменять нельзя
      if (now >= start && now < end) {
        return res.status(400).json({ code: 'MATCH_IN_PROGRESS' });
      }
      // Если уже закончился — ограничение 48 часов
      if (now >= end && (now - end) > 48 * 60 * 60 * 1000) {
        return res.status(400).json({ code: 'CANCEL_TOO_LATE' });
      }
      match.status = 'cancelled';
      await match.save();
      return res.json({ ok: true, status: 'cancelled' });
    } else {
      return res.status(400).json({ code: 'INVALID_ACTION' });
    }
  } catch (e) {
    console.error('Update match error:', e);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createMatch,
  getMatches,
  getMatchById,
  joinMatch,
  leaveMatch,
  updateMatch,
  addPlayerToMatch,
  removePlayerFromMatch
}; 