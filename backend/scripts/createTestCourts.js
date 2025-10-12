const mongoose = require('mongoose');
require('dotenv').config();

const Court = require('../models/Court');
const User = require('../models/User');

async function createTestCourts() {
  try {
    console.log('🔌 Подключение к MongoDB...');
    await mongoose.connect(process.env.MONGODB_URI);
    console.log('✅ Подключение к MongoDB успешно');

    // Находим пользователей с ролью court_manager или super_admin
    const managers = await User.find({
      role: { $in: ['court_manager', 'court_admin', 'super_admin'] }
    }).select('_id name email role');

    if (managers.length === 0) {
      console.log('❌ Не найдено пользователей с ролью court_manager, court_admin или super_admin');
      console.log('Создайте пользователя с соответствующей ролью или используйте скрипт makeSuperAdmin.js');
      return;
    }

    console.log(`👥 Найдено ${managers.length} менеджеров:`);
    managers.forEach(manager => {
      console.log(`   - ${manager.name} (${manager.email}) - ${manager.role}`);
    });

    // Тестовые корты
    const testCourts = [
      {
        name: 'Спортивный комплекс "Волейбол"',
        description: 'Современный спортивный комплекс с профессиональными кортами для волейбола',
        address: 'ул. Спортивная, 15, Москва',
        coordinates: [37.5665, 55.7558], // Москва
        status: 'active',
        isPaid: true,
        price: 1500,
        managerId: managers[0]._id,
        amenities: ['parking', 'shower', 'equipment', 'cafe'],
        workingHours: {
          monday: { open: '09:00', close: '22:00' },
          tuesday: { open: '09:00', close: '22:00' },
          wednesday: { open: '09:00', close: '22:00' },
          thursday: { open: '09:00', close: '22:00' },
          friday: { open: '09:00', close: '22:00' },
          saturday: { open: '10:00', close: '20:00' },
          sunday: { open: '10:00', close: '20:00' }
        }
      },
      {
        name: 'Бесплатный корт "Парк Победы"',
        description: 'Открытый корт в парке для бесплатных игр',
        address: 'Парк Победы, Москва',
        coordinates: [37.5153, 55.7308], // Парк Победы
        status: 'active',
        isPaid: false,
        managerId: managers.length > 1 ? managers[1]._id : managers[0]._id,
        amenities: ['parking'],
        workingHours: {
          monday: { open: '08:00', close: '23:00' },
          tuesday: { open: '08:00', close: '23:00' },
          wednesday: { open: '08:00', close: '23:00' },
          thursday: { open: '08:00', close: '23:00' },
          friday: { open: '08:00', close: '23:00' },
          saturday: { open: '08:00', close: '23:00' },
          sunday: { open: '08:00', close: '23:00' }
        }
      },
      {
        name: 'Спортзал "Атлет"',
        description: 'Крытый спортивный зал с профессиональным покрытием',
        address: 'ул. Атлетическая, 8, Москва',
        coordinates: [37.5800, 55.7500], // Москва
        status: 'active',
        isPaid: true,
        price: 2000,
        managerId: managers[0]._id,
        amenities: ['parking', 'shower', 'equipment', 'locker'],
        workingHours: {
          monday: { open: '07:00', close: '23:00' },
          tuesday: { open: '07:00', close: '23:00' },
          wednesday: { open: '07:00', close: '23:00' },
          thursday: { open: '07:00', close: '23:00' },
          friday: { open: '07:00', close: '23:00' },
          saturday: { open: '08:00', close: '22:00' },
          sunday: { open: '08:00', close: '22:00' }
        }
      },
      {
        name: 'Корт на обслуживании "Ремонт"',
        description: 'Корт временно закрыт на техническое обслуживание',
        address: 'ул. Ремонтная, 5, Москва',
        coordinates: [37.5900, 55.7600], // Москва
        status: 'maintenance',
        isPaid: false,
        managerId: managers[0]._id,
        amenities: [],
        workingHours: {
          monday: { open: '', close: '' },
          tuesday: { open: '', close: '' },
          wednesday: { open: '', close: '' },
          thursday: { open: '', close: '' },
          friday: { open: '', close: '' },
          saturday: { open: '', close: '' },
          sunday: { open: '', close: '' }
        }
      }
    ];

    console.log('\n🏟️ Создание тестовых кортов...');

    const createdCourts = [];
    const existingCourts = [];

    for (const courtData of testCourts) {
      // Проверяем, существует ли корт с таким названием
      const existingCourt = await Court.findOne({ 
        name: courtData.name,
        isDeleted: false 
      });

      if (existingCourt) {
        existingCourts.push(existingCourt);
        console.log(`   ⚠️ Корт "${courtData.name}" уже существует`);
      } else {
        const court = new Court(courtData);
        await court.save();
        createdCourts.push(court);
        console.log(`   ✅ Создан корт "${courtData.name}"`);
      }
    }

    console.log(`\n🎯 Итог:`);
    console.log(`   Создано кортов: ${createdCourts.length}`);
    console.log(`   Уже существовало: ${existingCourts.length}`);
    console.log(`   Всего кортов: ${createdCourts.length + existingCourts.length}`);

    if (createdCourts.length > 0) {
      console.log(`\n📋 Созданные корты:`);
      createdCourts.forEach(court => {
        console.log(`   - ${court.name} (${court.isPaid ? 'Платный' : 'Бесплатный'}) - ${court.status}`);
      });
    }

  } catch (error) {
    console.error('❌ Ошибка:', error.message);
  } finally {
    await mongoose.disconnect();
    console.log('🔌 Отключение от MongoDB');
  }
}

// Запуск скрипта
if (require.main === module) {
  createTestCourts();
}

module.exports = createTestCourts; 