/*
Rating is calculated similarly to Elo:
- For each game compute expected = 1 / (1 + 10^((oppAvg - userAvg)))
- score = 1 (win), 0.5 (draw), 0 (loss)
- delta = K * (score - expected), where K = 0.1
- Final delta for the match is the sum across games; user's rating is updated by this amount
*/
const User = require('../models/User');

/**
 * Updates players' ratings after a match (per-game approach)
 * @param {Array} team1 - array of User IDs for team 1
 * @param {Array} team2 - array of User IDs for team 2
 * @param {Number} team1Wins - number of games won by team 1
 * @param {Number} team2Wins - number of games won by team 2
 * @param {String} matchId - match id
 * @param {Array} games - array of games ({ team1, team2, team1Score, team2Score })
 */
async function updateRatingsAfterMatch(team1, team2, team1Wins, team2Wins, matchId, games, allParticipants) {
  const K = 0.1;
  // Если передан allParticipants — используем его, иначе как раньше (для обратной совместимости)
  let allUsers;
  if (allParticipants) {
    // allParticipants — массив User
    allUsers = allParticipants;
  } else {
    allUsers = [...new Map([...team1, ...team2].map(u => [u._id.toString(), u])).values()];
  }
  for (const user of allUsers) {
    let deltaSum = 0;
    let gamesPlayed = 0;
    const details = [];
    for (const [gameIndex, game] of games.entries()) {
      const inTeam1 = game.team1.some(p => p.toString() === user._id.toString());
      const inTeam2 = game.team2.some(p => p.toString() === user._id.toString());
      if (!inTeam1 && !inTeam2) continue;
      gamesPlayed++;
      const userTeam = inTeam1 ? game.team1 : game.team2;
      const oppTeam = inTeam1 ? game.team2 : game.team1;
      const userTeamObjs = await User.find({ _id: { $in: userTeam } });
      const oppTeamObjs = await User.find({ _id: { $in: oppTeam } });
      // --- joinRating logic ---
      async function getJoinRating(u, matchId) {
        if (Array.isArray(u.ratingHistory)) {
          const rh = u.ratingHistory.find(rh => rh.matchId?.toString() === matchId.toString());
          if (rh) {
            if (typeof rh.joinRating === 'number') return rh.joinRating;
            if (typeof rh.newRating === 'number') return rh.newRating;
          }
        }
      // Fallback: read from Match.joinSnapshots
        try {
          const Match = require('../models/Match');
          const m = await Match.findById(matchId, { joinSnapshots: 1 });
          const snap = m?.joinSnapshots?.find(s => s.userId?.toString() === u._id.toString());
          if (snap && typeof snap.rating === 'number') return snap.rating;
        } catch (e) {
          // no-op fallback
        }
        return 2.0;
      }
      const userJoinRatings = await Promise.all(userTeamObjs.map(u => getJoinRating(u, matchId)));
      const oppJoinRatings = await Promise.all(oppTeamObjs.map(u => getJoinRating(u, matchId)));
      const userAvg = userJoinRatings.reduce((a,b)=>a+b,0) / userJoinRatings.length;
      const oppAvg = oppJoinRatings.reduce((a,b)=>a+b,0) / oppJoinRatings.length;
      
      // Validate averages
      if (isNaN(userAvg) || isNaN(oppAvg)) {
        console.warn(`[rating] Invalid averages: userAvg=${userAvg}, oppAvg=${oppAvg}, skipping game`);
        continue;
      }
      
      const expected = 1 / (1 + Math.pow(10, (oppAvg - userAvg)));
      let score = 0.5; // draw
      if ((inTeam1 && game.team1Score > game.team2Score) || (inTeam2 && game.team2Score > game.team1Score)) score = 1;
      else if ((inTeam1 && game.team1Score < game.team2Score) || (inTeam2 && game.team2Score < game.team1Score)) score = 0;
      const delta = +(K * (score - expected)).toFixed(2);
      deltaSum += delta;
      details.push({
        gameIndex: gameIndex + 1,
        team1: game.team1.map(p => p.toString()),
        team2: game.team2.map(p => p.toString()),
        team1Score: game.team1Score,
        team2Score: game.team2Score,
        userTeam: inTeam1 ? 'team1' : 'team2',
        userAvg,
        oppAvg,
        expected,
        score,
        delta
      });
    }
    // If didn't participate in any game — still add a record with delta=0, details=[]
    let finalDelta = isNaN(deltaSum) ? 0 : deltaSum;
    let newRating = user.rating;
    if (gamesPlayed > 0 && !isNaN(deltaSum)) {
      newRating = +(user.rating + deltaSum).toFixed(2);
      user.rating = newRating;
    }
    // --- joinRating for final record ---
    let joinRatingForMatch = 2.0;
    if (Array.isArray(user.ratingHistory)) {
      const joinRec = user.ratingHistory.find(rh => rh.matchId?.toString() === matchId.toString() && typeof rh.joinRating === 'number');
      if (joinRec) joinRatingForMatch = joinRec.joinRating;
    }
    user.ratingHistory.push({
      date: new Date(),
      delta: finalDelta,
      newRating: newRating,
      matchId,
      comment: 'Per-game individual calculation',
      details,
      joinRating: joinRatingForMatch
    });
    await User.updateOne({ _id: user._id }, {
      $set: {
        rating: user.rating,
        ratingHistory: user.ratingHistory
      }
    });
  }
}

/**
 * Recomputes user's rating from ratingHistory and optionally fixes it
 * @param {User} user - user document
 * @param {boolean} fix - if true, fixes rating to the computed one
 * @returns {Promise<boolean>} - true if fixed
 */
async function checkAndFixUserRatings(user, fix = false) {
  if (!user.ratingHistory || user.ratingHistory.length === 0) return false;
  let rating = 2.0;
  for (const rh of user.ratingHistory) {
    rating = +(rating + rh.delta).toFixed(2);
  }
  if (Math.abs(rating - user.rating) > 0.001) {
    console.warn(`User ${user.email || user._id}: rating=${user.rating}, computed=${rating}`);
    if (fix) {
      user.rating = rating;
      await user.save();
      return true;
    }
    return false;
  }
  return false;
}

module.exports = { updateRatingsAfterMatch, checkAndFixUserRatings }; 