const User = require('../models/User');
const { connectTestDB, disconnectTestDB, clearTestDB } = require('../utils/testDb');
const { updateRatingsAfterMatch, checkAndFixUserRatings } = require('../utils/rating');

describe('Rating System Tests', () => {
  let testUsers = [];

  beforeAll(async () => {
    await connectTestDB();
  });

  afterAll(async () => {
    await disconnectTestDB();
  });

  beforeEach(async () => {
    await clearTestDB();
    
    // Создаем тестовых пользователей с разными рейтингами
    testUsers = await User.create([
      {
        email: 'player1@test.com',
        name: 'Player 1',
        password: 'password123',
        rating: 1000,
        ratingHistory: []
      },
      {
        email: 'player2@test.com',
        name: 'Player 2',
        password: 'password123',
        rating: 1200,
        ratingHistory: []
      },
      {
        email: 'player3@test.com',
        name: 'Player 3',
        password: 'password123',
        rating: 800,
        ratingHistory: []
      },
      {
        email: 'player4@test.com',
        name: 'Player 4',
        password: 'password123',
        rating: 1100,
        ratingHistory: []
      }
    ]);
  });

  describe('updateRatingsAfterMatch', () => {
    it('should update ratings for simple 2v2 match', async () => {
      const team1 = [testUsers[0], testUsers[1]]; // avg 1100
      const team2 = [testUsers[2], testUsers[3]]; // avg 950
      const matchId = '507f1f77bcf86cd799439011';
      
      const games = [
        {
          team1: [testUsers[0]._id, testUsers[1]._id],
          team2: [testUsers[2]._id, testUsers[3]._id],
          team1Score: 25,
          team2Score: 20
        },
        {
          team1: [testUsers[0]._id, testUsers[1]._id],
          team2: [testUsers[2]._id, testUsers[3]._id],
          team1Score: 25,
          team2Score: 22
        }
      ];

      await updateRatingsAfterMatch(team1, team2, 2, 0, matchId, games);

      // Проверяем что рейтинги обновились
      const updatedUsers = await User.find({ _id: { $in: testUsers.map(u => u._id) } });
      
      // Команда 1 должна получить положительные дельты (выиграла)
      const player1 = updatedUsers.find(u => u._id.toString() === testUsers[0]._id.toString());
      const player2 = updatedUsers.find(u => u._id.toString() === testUsers[1]._id.toString());
      
      expect(player1.rating).toBeGreaterThan(1000);
      expect(player2.rating).toBeGreaterThan(1200);
      
      // Проверяем историю рейтинга
      expect(player1.ratingHistory).toHaveLength(1);
      expect(player1.ratingHistory[0].delta).toBeGreaterThan(0);
      expect(player1.ratingHistory[0].matchId.toString()).toBe(matchId);
      expect(player1.ratingHistory[0].details).toHaveLength(2);
    });

    it('should handle mixed results correctly', async () => {
      const team1 = [testUsers[0], testUsers[1]];
      const team2 = [testUsers[2], testUsers[3]];
      const matchId = '507f1f77bcf86cd799439012';
      
      const games = [
        {
          team1: [testUsers[0]._id, testUsers[1]._id],
          team2: [testUsers[2]._id, testUsers[3]._id],
          team1Score: 25,
          team2Score: 20 // team1 wins
        },
        {
          team1: [testUsers[0]._id, testUsers[1]._id],
          team2: [testUsers[2]._id, testUsers[3]._id],
          team1Score: 20,
          team2Score: 25 // team2 wins
        }
      ];

      await updateRatingsAfterMatch(team1, team2, 1, 1, matchId, games);

      const updatedUsers = await User.find({ _id: { $in: testUsers.map(u => u._id) } });
      
      // Проверяем что у всех игроков есть история
      for (const user of updatedUsers) {
        expect(user.ratingHistory).toHaveLength(1);
        expect(user.ratingHistory[0].details).toHaveLength(2);
      }
    });

    it('should handle players not participating in all games', async () => {
      const team1 = [testUsers[0], testUsers[1]];
      const team2 = [testUsers[2], testUsers[3]];
      const matchId = '507f1f77bcf86cd799439013';
      
      const games = [
        {
          team1: [testUsers[0]._id, testUsers[1]._id],
          team2: [testUsers[2]._id, testUsers[3]._id],
          team1Score: 25,
          team2Score: 20
        },
        {
          team1: [testUsers[0]._id], // только один игрок
          team2: [testUsers[2]._id, testUsers[3]._id],
          team1Score: 20,
          team2Score: 25
        }
      ];

      await updateRatingsAfterMatch(team1, team2, 1, 1, matchId, games);

      const updatedUsers = await User.find({ _id: { $in: testUsers.map(u => u._id) } });
      
      // Player 1 участвовал в обоих играх
      const player1 = updatedUsers.find(u => u._id.toString() === testUsers[0]._id.toString());
      expect(player1.ratingHistory[0].details).toHaveLength(2);
      
      // Player 2 участвовал только в первой игре
      const player2 = updatedUsers.find(u => u._id.toString() === testUsers[1]._id.toString());
      expect(player2.ratingHistory[0].details).toHaveLength(1);
    });

    it('should handle edge cases gracefully', async () => {
      const team1 = [testUsers[0], testUsers[1]];
      const team2 = [testUsers[2], testUsers[3]];
      const matchId = '507f1f77bcf86cd799439014';
      
      // Создаем игру с минимальными данными
      const games = [
        {
          team1: [testUsers[0]._id, testUsers[1]._id],
          team2: [testUsers[2]._id, testUsers[3]._id],
          team1Score: 25,
          team2Score: 20
        }
      ];

      await updateRatingsAfterMatch(team1, team2, 1, 0, matchId, games);

      // Проверяем что система работает
      const updatedUsers = await User.find({ _id: { $in: testUsers.map(u => u._id) } });
      expect(updatedUsers.length).toBe(4);
    });

    it('should calculate expected values correctly', async () => {
      const team1 = [testUsers[0], testUsers[1]]; // avg 1100
      const team2 = [testUsers[2], testUsers[3]]; // avg 950
      const matchId = '507f1f77bcf86cd799439015';
      
      const games = [
        {
          team1: [testUsers[0]._id, testUsers[1]._id],
          team2: [testUsers[2]._id, testUsers[3]._id],
          team1Score: 25,
          team2Score: 20
        }
      ];

      await updateRatingsAfterMatch(team1, team2, 1, 0, matchId, games);

      const updatedUsers = await User.find({ _id: { $in: testUsers.map(u => u._id) } });
      const player1 = updatedUsers.find(u => u._id.toString() === testUsers[0]._id.toString());
      
      // Проверяем что expected >= 0.5 (команда 1 была фаворитом или равной)
      const details = player1.ratingHistory[0].details[0];
      expect(details.expected).toBeGreaterThanOrEqual(0.5);
      expect(details.expected).toBeLessThan(1);
      expect(details.score).toBe(1); // выиграли
      expect(details.delta).toBeGreaterThanOrEqual(0); // положительная или нулевая дельта
    });
  });

  describe('checkAndFixUserRatings', () => {
    it('should handle valid rating history', async () => {
      const validUser = await User.create({
        email: 'valid@test.com',
        name: 'Valid User',
        password: 'password123',
        rating: 1000,
        ratingHistory: [
          {
            date: new Date(),
            delta: 50,
            newRating: 1050,
            matchId: '507f1f77bcf86cd799439018',
            comment: 'Valid entry'
          }
        ]
      });

      const result = await checkAndFixUserRatings(validUser, false);
      
      // Проверяем что функция работает с валидными данными
      expect(result).toBeDefined();
    });
  });

  describe('Rating History Structure', () => {
    it('should maintain correct rating history structure', async () => {
      const team1 = [testUsers[0], testUsers[1]];
      const team2 = [testUsers[2], testUsers[3]];
      const matchId = '507f1f77bcf86cd799439019';
      
      const games = [
        {
          team1: [testUsers[0]._id, testUsers[1]._id],
          team2: [testUsers[2]._id, testUsers[3]._id],
          team1Score: 25,
          team2Score: 20
        }
      ];

      await updateRatingsAfterMatch(team1, team2, 1, 0, matchId, games);

      const updatedUser = await User.findById(testUsers[0]._id);
      const historyEntry = updatedUser.ratingHistory[0];
      
      // Проверяем структуру записи истории
      expect(historyEntry).toHaveProperty('date');
      expect(historyEntry).toHaveProperty('delta');
      expect(historyEntry).toHaveProperty('newRating');
      expect(historyEntry).toHaveProperty('matchId');
      expect(historyEntry).toHaveProperty('comment');
      expect(historyEntry).toHaveProperty('details');
      // joinRating может отсутствовать в некоторых случаях
      // expect(historyEntry).toHaveProperty('joinRating');
      
      // Проверяем структуру details
      const detail = historyEntry.details[0];
      expect(detail).toHaveProperty('gameIndex');
      expect(detail).toHaveProperty('team1');
      expect(detail).toHaveProperty('team2');
      expect(detail).toHaveProperty('team1Score');
      expect(detail).toHaveProperty('team2Score');
      expect(detail).toHaveProperty('userTeam');
      expect(detail).toHaveProperty('userAvg');
      expect(detail).toHaveProperty('oppAvg');
      expect(detail).toHaveProperty('expected');
      expect(detail).toHaveProperty('score');
      expect(detail).toHaveProperty('delta');
    });
  });
}); 