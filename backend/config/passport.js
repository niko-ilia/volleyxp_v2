const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const User = require('../models/User');

passport.serializeUser((user, done) => {
  done(null, user.id);
});

passport.deserializeUser(async (id, done) => {
  try {
    const user = await User.findById(id);
    done(null, user);
  } catch (error) {
    done(error, null);
  }
});

// Инициализируем Google Strategy только если есть необходимые переменные окружения
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  // Определяем callback URL в зависимости от окружения
  const callbackURL = process.env.NODE_ENV === 'development' 
    ? "http://localhost:3000/api/auth/google/callback"
    : (process.env.GOOGLE_CALLBACK_URL || "https://volleyxp.com/api/auth/google/callback");

  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: callbackURL
  }, async (accessToken, refreshToken, profile, done) => {
    try {
      // Ищем пользователя по Google ID
      let user = await User.findOne({ googleId: profile.id });
      
      if (!user) {
        // Проверяем, существует ли пользователь с таким email
        user = await User.findOne({ email: profile.emails[0].value });
        
        if (user) {
          // Если пользователь существует, привязываем Google ID
          user.googleId = profile.id;
          user.emailConfirmed = true;
          await user.save();
        } else {
          // Создаем нового пользователя
          user = new User({
            name: profile.displayName,
            email: profile.emails[0].value,
            googleId: profile.id,
            emailConfirmed: true, // Google подтверждает email
            rating: 2.0,
            ratingHistory: []
          });
          await user.save();
        }
      }

      // Обновляем время последнего входа
      user.lastLoginAt = new Date();
      await user.save();

      return done(null, user);
    } catch (error) {
      return done(error, null);
    }
  }));
}

module.exports = passport; 