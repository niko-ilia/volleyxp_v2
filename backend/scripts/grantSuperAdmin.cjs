#!/usr/bin/env node

// Назначает пользователю роль super_admin по email
// Usage:
//   node backend/scripts/grantSuperAdmin.cjs <email>
//   node backend/scripts/grantSuperAdmin.cjs --email=user@example.com

/* eslint-disable no-console */
require('dotenv').config({ path: __dirname + '/../.env' });
const mongoose = require('mongoose');
const User = require('../models/User');

function parseEmailArg() {
  const args = process.argv.slice(2);
  let email = null;

  for (const arg of args) {
    if (arg.startsWith('--email=')) {
      email = arg.split('=')[1];
      break;
    }
  }

  if (!email) {
    // Берем первый позиционный аргумент, если он похож на email
    const positional = args.find(a => !a.startsWith('--'));
    if (positional) email = positional;
  }

  return email;
}

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI не задан. Передайте через переменную окружения или .env в backend/.env');
    process.exit(1);
  }

  const email = parseEmailArg();
  if (!email) {
    console.error('Укажите email:');
    console.error('  node backend/scripts/grantSuperAdmin.cjs <email>');
    console.error('  node backend/scripts/grantSuperAdmin.cjs --email=user@example.com');
    process.exit(1);
  }

  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 15000 });
    console.log('✅ Подключено к БД');

    const user = await User.findOne({ email });
    if (!user) {
      console.error(`❌ Пользователь с email ${email} не найден`);
      process.exitCode = 1;
      return;
    }

    const updated = await User.findOneAndUpdate(
      { _id: user._id },
      { $addToSet: { roles: 'super_admin' }, $set: { role: 'super_admin' } },
      { new: true }
    );

    console.log('👤 Пользователь:', updated.email, `(${updated._id})`);
    console.log('🔒 role:', updated.role);
    console.log('🔑 roles:', Array.isArray(updated.roles) ? updated.roles : []);
    console.log('🎉 Пользователь назначен super_admin');

    await mongoose.disconnect();
  } catch (e) {
    console.error('💥 Ошибка:', e);
    process.exitCode = 1;
  }
}

run();


