#!/usr/bin/env node

// Миграция: заполнить поле roles для пользователей на основе legacy role

/* eslint-disable no-console */
const mongoose = require('mongoose');
const dotenv = require('dotenv');
dotenv.config();

const User = require('../models/User');

async function run() {
  try {
    if (!process.env.MONGODB_URI) {
      throw new Error('MONGODB_URI is not set');
    }
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 15000
    });
    console.log('Connected');

    const cursor = User.find({ $or: [ { roles: { $exists: false } }, { roles: { $size: 0 } } ] }).cursor();
    let updated = 0;
    for await (const user of cursor) {
      const role = user.role || 'player';
      // Нормализуем неизвестные значения в 'player'
      const allowed = ['player','court_admin','admin_view','super_admin'];
      const normalized = allowed.includes(role) ? role : 'player';
      user.roles = [normalized];
      await user.save();
      updated += 1;
      if (updated % 100 === 0) console.log('Updated', updated);
    }

    console.log('Done. Updated users:', updated);
    await mongoose.disconnect();
  } catch (e) {
    console.error('Migration failed:', e);
    process.exitCode = 1;
  }
}

run();


