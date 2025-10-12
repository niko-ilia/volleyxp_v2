const Result = require('../models/Result');
const Match = require('../models/Match');
const User = require('../models/User');
const { updateRatingsAfterMatch } = require('../utils/rating');

// Создать результат матча (черновик без подтверждения)
const createResult = async (req, res) => {
  try {
    const { matchId, games } = req.body;

    const match = await Match.findById(matchId);
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }

    const existingResult = await Result.findOne({ match: matchId });
    if (existingResult) {
      return res.status(400).json({ message: 'Result already exists for this match' });
    }

    const isParticipant = match.participants.some(
      p => p.toString() === req.user._id.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ message: 'Only participants can confirm the result' });
    }

    const result = new Result({
      match: matchId,
      games,
      isConfirmed: false,
    });

    await result.save();

    await result.populate('match');

    return res.status(201).json(result);
  } catch (error) {
    console.error('Create result error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить результат матча
const getResult = async (req, res) => {
  try {
    const result = await Result.findOne({ match: req.params.matchId })
      .populate('match')
      .populate('confirmedBy', 'name email');

    if (!result) {
      return res.status(404).json({ message: 'Result not found' });
    }

    res.json(result);
  } catch (error) {
    console.error('Get result error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Обновить результат матча (без подтверждения)
const updateResult = async (req, res) => {
  try {
    const { games } = req.body;

    const result = await Result.findById(req.params.resultId).populate('match');
    if (!result) {
      return res.status(404).json({ message: 'Result not found' });
    }

    if (result.isConfirmed) {
      return res.status(400).json({ code: 'RESULT_ALREADY_CONFIRMED', message: 'Результат уже подтвержден и не может быть изменён' });
    }

    const match = result.match;
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    const isParticipant = match.participants.some(
      p => p.toString() === req.user._id.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ message: 'Only participants can edit the result' });
    }

    // Обновляем черновик результата
    result.games = games;
    result.isConfirmed = false;
    result.confirmedBy = undefined;
    result.confirmedAt = undefined;
    await result.save();

    await result.populate('match');

    return res.json(result);
  } catch (error) {
    console.error('Update result error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Подтвердить результат матча и пересчитать рейтинг
const confirmResult = async (req, res) => {
  try {
    const { resultId } = req.params;
    const result = await Result.findById(resultId).populate('match');
    if (!result) return res.status(404).json({ message: 'Result not found' });
    if (result.isConfirmed) return res.status(400).json({ code: 'RESULT_ALREADY_CONFIRMED', message: 'Результат уже подтвержден' });
    const match = result.match;
    if (!match) return res.status(404).json({ message: 'Match not found' });

    const isParticipant = match.participants.some(p => p.toString() === req.user._id.toString());
    if (!isParticipant) return res.status(403).json({ message: 'Only participants can confirm the result' });

    // Проверка 24 часов от старта
    const matchStart = new Date(match.startDateTime);
    const now = new Date();
    const diffHours = (now - matchStart) / (1000 * 60 * 60);
    if (diffHours > 24) {
      return res.status(403).json({ message: 'Result can only be confirmed within 24 hours after match start' });
    }

    const games = result.games || [];
    let team1Wins = 0, team2Wins = 0;
    games.forEach(g => {
      if (g.team1Score > g.team2Score) team1Wins++;
      else if (g.team2Score > g.team1Score) team2Wins++;
    });
    const team1Ids = [...new Set(games.flatMap(g => g.team1.map(p => typeof p === 'string' ? p : p._id || p.id)))];
    const team2Ids = [...new Set(games.flatMap(g => g.team2.map(p => typeof p === 'string' ? p : p._id || p.id)))];
    const team1Users = await User.find({ _id: { $in: team1Ids } });
    const team2Users = await User.find({ _id: { $in: team2Ids } });
    const allParticipantUsers = await User.find({ _id: { $in: match.participants } });

    await updateRatingsAfterMatch(team1Users, team2Users, team1Wins, team2Wins, match._id, games, allParticipantUsers);

    // Удаляем join-записи "Матч без результата"
    for (const user of allParticipantUsers) {
      user.ratingHistory = user.ratingHistory.filter(
        rh => !(rh.matchId?.toString() === match._id.toString() && rh.comment?.includes('Матч без результата'))
      );
      await user.save();
    }

    // Фиксируем статус
    match.status = 'finished';
    await match.save();

    result.isConfirmed = true;
    result.confirmedBy = req.user._id;
    result.confirmedAt = new Date();
    await result.save();

    await result.populate('confirmedBy', 'name email');

    return res.json({ item: result });
  } catch (error) {
    console.error('Confirm result error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Получить все результаты
const getAllResults = async (req, res) => {
  try {
    const results = await Result.find()
      .populate('match')
      .populate('confirmedBy', 'name email')
      .sort({ createdAt: -1 });

    res.json(results);
  } catch (error) {
    console.error('Get all results error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

// Удалить результат матча
const deleteResult = async (req, res) => {
  try {
    const result = await Result.findById(req.params.resultId).populate('match');
    if (!result) {
      return res.status(404).json({ message: 'Result not found' });
    }
    const match = result.match;
    if (!match) {
      return res.status(404).json({ message: 'Match not found' });
    }
    const isParticipant = match.participants.some(
      p => p.toString() === req.user._id.toString()
    );
    if (!isParticipant) {
      return res.status(403).json({ message: 'Only participants can delete the result' });
    }
    const matchStart = new Date(match.startDateTime);
    const now = new Date();
    const diffHours = (now - matchStart) / (1000 * 60 * 60);
    if (diffHours > 24) {
      return res.status(403).json({ message: 'Result can only be deleted within 24 hours after match start' });
    }
    await result.deleteOne();
    const participantUsers = await User.find({ _id: { $in: match.participants } });
    for (const user of participantUsers) {
      if (Array.isArray(user.ratingHistory)) {
        const newHistory = user.ratingHistory.filter(rh => rh.matchId?.toString() !== match._id.toString());
        const prev = [...newHistory].sort((a, b) => new Date(b.date) - new Date(a.date))[0];
        user.rating = prev ? prev.newRating : 2.0;
        user.ratingHistory = newHistory;
        await user.save();
      }
    }
    return res.json({ message: 'Result deleted successfully' });
  } catch (error) {
    console.error('Delete result error:', error);
    res.status(500).json({ message: 'Server error' });
  }
};

module.exports = {
  createResult,
  getResult,
  updateResult,
  confirmResult,
  getAllResults,
  deleteResult,
  getResultStats: async (req, res) => {
    try {
      const matchId = req.params.matchId;
      const result = await Result.findOne({ match: matchId });
      if (!result) {
        return res.status(404).json({ error: 'Результат не найден', code: 'RESULT_NOT_FOUND' });
      }
      const match = await Match.findById(matchId).populate('participants', 'name email rating ratingHistory');
      if (!match) {
        return res.status(404).json({ error: 'Матч не найден', code: 'MATCH_NOT_FOUND' });
      }
      let team1Wins = 0;
      let team2Wins = 0;
      const perUser = new Map();
      const ensureUser = (u) => {
        const id = u._id.toString();
        if (!perUser.has(id)) perUser.set(id, { wins: 0, losses: 0, draws: 0, games: 0, user: u });
        return perUser.get(id);
      };
      for (const g of result.games || []) {
        const t1Win = g.team1Score > g.team2Score;
        const t2Win = g.team2Score > g.team1Score;
        if (t1Win) team1Wins++; else if (t2Win) team2Wins++;
        const team1Ids = (g.team1 || []).map(x => x.toString());
        const team2Ids = (g.team2 || []).map(x => x.toString());
        const idToUser = new Map((match.participants || []).map(u => [u._id.toString(), u]));
        for (const uid of team1Ids) {
          const u = idToUser.get(uid) || { _id: uid };
          const stat = ensureUser(u); stat.games++; if (t1Win) stat.wins++; else if (t2Win) stat.losses++; else stat.draws++;
        }
        for (const uid of team2Ids) {
          const u = idToUser.get(uid) || { _id: uid };
          const stat = ensureUser(u); stat.games++; if (t2Win) stat.wins++; else if (t1Win) stat.losses++; else stat.draws++;
        }
      }
      const participants = (match.participants || []).map(u => {
        const rh = Array.isArray(u.ratingHistory)
          ? u.ratingHistory.find(r => r.matchId && r.matchId.toString() === match._id.toString())
          : null;
        const base = perUser.get(u._id.toString()) || { wins: 0, losses: 0, draws: 0, games: 0 };
        return {
          userId: u._id,
          name: u.name,
          email: u.email,
          wins: base.wins,
          losses: base.losses,
          draws: base.draws,
          games: base.games,
          ratingDelta: rh?.delta ?? 0,
          newRating: rh?.newRating ?? u.rating,
          joinRating: rh?.joinRating
        };
      });
      for (const [uid, stat] of perUser.entries()) {
        if (!participants.find(p => p.userId.toString() === uid)) {
          const u = stat.user || { _id: uid };
          participants.push({ userId: u._id, name: u.name, email: u.email, wins: stat.wins, losses: stat.losses, draws: stat.draws, games: stat.games, ratingDelta: 0, newRating: undefined, joinRating: undefined });
        }
      }
      participants.sort((a, b) => { if (b.wins !== a.wins) return b.wins - a.wins; return (b.ratingDelta || 0) - (a.ratingDelta || 0); });
      return res.json({ item: { matchId: match._id, team1Wins, team2Wins, totalGames: (result.games || []).length, participants } });
    } catch (error) {
      console.error('Get result stats error:', error);
      res.status(500).json({ error: 'Ошибка сервера', code: 'SERVER_ERROR' });
    }
  }
}; 