const Court = require('../models/Court');
const User = require('../models/User');
const CourtReservation = require('../models/CourtReservation');
const Match = require('../models/Match');

// Helpers
function toDate(d) {
  return d instanceof Date ? d : new Date(d);
}

async function hasReservationConflict(courtId, startDateTime, endDateTime, excludeReservationId) {
  const court = await Court.findById(courtId).select('courtsCount');
  const capacity = Math.max(1, court?.courtsCount || 1);
  const overlapQuery = {
    courtId,
    startDateTime: { $lt: endDateTime },
    endDateTime: { $gt: startDateTime }
  };
  const reservationQuery = excludeReservationId ? { ...overlapQuery, _id: { $ne: excludeReservationId } } : overlapQuery;
  const overlappingReservations = await CourtReservation.countDocuments(reservationQuery);
  if (overlappingReservations >= capacity) return { conflict: true, reason: 'CAPACITY_EXCEEDED' };
  return { conflict: false };
}

// GET /api/admin/courts/mine - Корты, доступные текущему court_admin
exports.getManagedCourts = async (req, res) => {
  try {
    const roles = Array.isArray(req.user.roles) && req.user.roles.length > 0 ? req.user.roles : [req.user.role];
    // super_admin видит все, court_admin видит свои, остальные 403
    if (roles.includes('super_admin')) {
      return exports.getAllCourts(req, res);
    }
    if (!roles.includes('court_admin')) {
      return res.status(403).json({ code: 'INSUFFICIENT_PERMISSIONS' });
    }

    const { page = 1, limit = 20, search, status } = req.query;
    const query = { isDeleted: false, _id: { $in: req.user.managedCourts || [] } };

    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } }
      ];
    }
    if (status) query.status = status;

    const skip = (page - 1) * limit;
    const courts = await Court.find(query)
      .populate('managerId ownerId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    const total = await Court.countDocuments(query);

    res.json({
      courts,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error getting managed courts:', error);
    res.status(500).json({ message: 'Ошибка при получении доступных кортов' });
  }
};

// GET /api/admin/courts - Получить список всех кортов
exports.getAllCourts = async (req, res) => {
  try {
    const { page = 1, limit = 20, search, status, managerId, ownerId } = req.query;
    
    const query = { isDeleted: false };
    
    // Поиск по названию или адресу
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: 'i' } },
        { address: { $regex: search, $options: 'i' } }
      ];
    }
    
    // Фильтр по статусу
    if (status) {
      query.status = status;
    }
    
    // Фильтр по менеджеру
    if (managerId) {
      query.managerId = managerId;
    }
    // Фильтр по владельцу
    if (ownerId) {
      query.ownerId = ownerId;
    }
    
    const skip = (page - 1) * limit;
    
    const courts = await Court.find(query)
      .populate('managerId ownerId', 'name email')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit));
    
    const total = await Court.countDocuments(query);
    
    res.json({
      courts,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    console.error('Error getting courts:', error);
    res.status(500).json({ message: 'Ошибка при получении списка кортов' });
  }
};

// GET /api/admin/courts/:id - Получить корт по ID
exports.getCourtById = async (req, res) => {
  try {
    const court = await Court.findById(req.params.id)
      .populate('managerId ownerId', 'name email role');
    
    if (!court || court.isDeleted) {
      return res.status(404).json({ message: 'Корт не найден' });
    }
    
    res.json(court);
  } catch (error) {
    console.error('Error getting court:', error);
    res.status(500).json({ message: 'Ошибка при получении корта' });
  }
};

// POST /api/admin/courts - Создать новый корт
exports.createCourt = async (req, res) => {
  try {
    const {
      name,
      description,
      address,
      coordinates,
      status = 'active',
      isPaid = false,
      price,
      priceOneHourEUR,
      priceTwoHoursEUR,
      workingHours,
      amenities,
      photos,
      managerId,
      ownerId,
      courtsCount
    } = req.body;
    
    // Проверка обязательных полей
    if (!name || !address || !coordinates) {
      return res.status(400).json({ 
        message: 'Название, адрес и координаты обязательны' 
      });
    }
    
    // Проверка менеджера, если указан
    if (managerId) {
      const manager = await User.findById(managerId);
      if (!manager) {
        return res.status(400).json({ message: 'Менеджер не найден' });
      }
      if (!['court_manager', 'court_admin', 'super_admin'].includes(manager.role)) {
        return res.status(400).json({ message: 'Пользователь не может быть менеджером корта' });
      }
    }
    // Проверка владельца, если указан
    if (ownerId) {
      const owner = await User.findById(ownerId);
      if (!owner) {
        return res.status(400).json({ message: 'Владелец не найден' });
      }
      if (!['court_owner', 'court_admin', 'super_admin'].includes(owner.role)) {
        return res.status(400).json({ message: 'Пользователь не может быть владельцем корта' });
      }
    }
    
    // Валидация цен при платном корте
    if (isPaid) {
      const hasNewPrices = priceOneHourEUR !== undefined && priceTwoHoursEUR !== undefined;
      const hasLegacyPrice = price !== undefined;
      if (!hasNewPrices && !hasLegacyPrice) {
        return res.status(400).json({ message: 'Для платного корта укажите стоимость за 1 и 2 часа в евро', code: 'COURT_PRICES_REQUIRED' });
      }
    }

    const court = new Court({
      name,
      description,
      address,
      location: {
        type: 'Point',
        coordinates
      },
      status,
      isPaid,
      price: isPaid ? (priceOneHourEUR ?? price) : undefined,
      pricesEUR: (isPaid && priceOneHourEUR !== undefined && priceTwoHoursEUR !== undefined) ? {
        oneHour: priceOneHourEUR,
        twoHours: priceTwoHoursEUR
      } : undefined,
      workingHours,
      amenities,
      photos,
      managerId,
      ownerId,
      courtsCount: courtsCount || 1
    });
    
    await court.save();
    
    const populatedCourt = await Court.findById(court._id)
      .populate('managerId ownerId', 'name email');
    
    res.status(201).json(populatedCourt);
  } catch (error) {
    console.error('Error creating court:', error);
    res.status(500).json({ message: 'Ошибка при создании корта' });
  }
};

// PUT /api/admin/courts/:id - Обновить корт
exports.updateCourt = async (req, res) => {
  try {
    const court = await Court.findById(req.params.id);
    
    if (!court || court.isDeleted) {
      return res.status(404).json({ message: 'Корт не найден' });
    }
    
    const {
      name,
      description,
      address,
      coordinates,
      status,
      isPaid,
      price,
      priceOneHourEUR,
      priceTwoHoursEUR,
      workingHours,
      amenities,
      photos,
      managerId,
      ownerId,
      courtsCount
    } = req.body;
    
    // Проверка менеджера, если указан
    if (managerId) {
      const manager = await User.findById(managerId);
      if (!manager) {
        return res.status(400).json({ message: 'Менеджер не найден' });
      }
      if (!['court_manager', 'court_admin', 'super_admin'].includes(manager.role)) {
        return res.status(400).json({ message: 'Пользователь не может быть менеджером корта' });
      }
    }
    // Проверка владельца, если указан
    if (ownerId) {
      const owner = await User.findById(ownerId);
      if (!owner) {
        return res.status(400).json({ message: 'Владелец не найден' });
      }
      if (!['court_owner', 'court_admin', 'super_admin'].includes(owner.role)) {
        return res.status(400).json({ message: 'Пользователь не может быть владельцем корта' });
      }
    }
    
    // Обновление полей
    if (name !== undefined) court.name = name;
    if (description !== undefined) court.description = description;
    if (address !== undefined) court.address = address;
    if (coordinates !== undefined) {
      court.location = {
        type: 'Point',
        coordinates
      };
    }
    if (status !== undefined) court.status = status;
    if (isPaid !== undefined) court.isPaid = isPaid;
    if (price !== undefined) court.price = isPaid ? price : undefined;
    if (priceOneHourEUR !== undefined || priceTwoHoursEUR !== undefined) {
      court.pricesEUR = court.pricesEUR || {};
      if (priceOneHourEUR !== undefined) court.pricesEUR.oneHour = priceOneHourEUR;
      if (priceTwoHoursEUR !== undefined) court.pricesEUR.twoHours = priceTwoHoursEUR;
      // для обратной совместимости поддерживаем поле price как 1 час
      if (priceOneHourEUR !== undefined) court.price = isPaid ? priceOneHourEUR : undefined;
    }
    if (workingHours !== undefined) court.workingHours = workingHours;
    if (amenities !== undefined) court.amenities = amenities;
    if (photos !== undefined) court.photos = photos;
    if (managerId !== undefined) court.managerId = managerId;
    if (ownerId !== undefined) court.ownerId = ownerId;
    if (courtsCount !== undefined) court.courtsCount = Math.max(1, Number(courtsCount));
    
    await court.save();
    
    const updatedCourt = await Court.findById(court._id)
      .populate('managerId ownerId', 'name email');
    
    res.json(updatedCourt);
  } catch (error) {
    console.error('Error updating court:', error);
    res.status(500).json({ message: 'Ошибка при обновлении корта' });
  }
};

// GET /api/admin/courts/:id/schedule?from=&to=
exports.getSchedule = async (req, res) => {
  try {
    const { id } = req.params;
    const { from, to } = req.query;
    const court = await Court.findById(id);
    if (!court || court.isDeleted) return res.status(404).json({ message: 'Корт не найден' });
    const fromDate = from ? new Date(from) : new Date();
    const toDate = to ? new Date(to) : new Date(Date.now() + 7 * 24 * 3600 * 1000);
    const reservations = await CourtReservation
      .find({ courtId: id, startDateTime: { $lt: toDate }, endDateTime: { $gt: fromDate } })
      .sort({ startDateTime: 1 })
      .populate('forUserId', 'name email');

    // Include matches as read-only reservations so timeline shows busy slots
    const rawMatches = await Match
      .find({ courtId: id, startDateTime: { $lt: toDate }, $expr: { $gt: [ { $add: ["$startDateTime", { $multiply: ["$duration", 60000] }] }, fromDate ] } })
      .populate('creator', 'name email');
    const matchesAsReservations = rawMatches
      .map(m => {
        const end = new Date(new Date(m.startDateTime).getTime() + (Number(m.duration) || 0) * 60000);
        return { _id: `match_${m._id}`, startDateTime: m.startDateTime, endDateTime: end, forUserId: m.creator, note: m.title, _source: 'match' };
      })
      .filter(x => x.endDateTime > fromDate); // overlap filter

    res.json({
      court: { _id: court._id, name: court.name, courtsCount: court.courtsCount, workingHours: court.workingHours },
      reservations: [...reservations, ...matchesAsReservations]
    });
  } catch (e) {
    console.error('Error get schedule:', e);
    res.status(500).json({ message: 'Ошибка получения расписания' });
  }
};

// POST /api/admin/courts/:id/reservations
exports.createReservation = async (req, res) => {
  try {
    const { id } = req.params;
    const { startDateTime, endDateTime, note, forUserId } = req.body;
    if (!startDateTime || !endDateTime) return res.status(400).json({ message: 'Необходимо указать время' });
    const s = toDate(startDateTime); const e = toDate(endDateTime);
    if (s >= e) return res.status(400).json({ code: 'INVALID_TIME_RANGE', message: 'Временной интервал некорректен' });
    const conflict = await hasReservationConflict(id, s, e);
    if (conflict.conflict) {
      const msg = 'Конфликт: превышена вместимость площадок';
      return res.status(400).json({ code: 'SCHEDULE_CONFLICT', message: msg });
    }
    const reservation = await CourtReservation.create({ courtId: id, startDateTime: s, endDateTime: e, note, forUserId, reservedBy: req.user._id });
    const populated = await CourtReservation.findById(reservation._id).populate('forUserId', 'name email');
    res.status(201).json(populated);
  } catch (e) {
    console.error('Error create reservation:', e);
    res.status(500).json({ message: 'Ошибка создания резервации' });
  }
};

// DELETE /api/admin/courts/:id/reservations/:reservationId
exports.deleteReservation = async (req, res) => {
  try {
    const { id, reservationId } = req.params;
    const reservation = await CourtReservation.findOne({ _id: reservationId, courtId: id });
    if (!reservation) return res.status(404).json({ message: 'Резервация не найдена' });
    await reservation.deleteOne();
    res.json({ success: true });
  } catch (e) {
    console.error('Error delete reservation:', e);
    res.status(500).json({ message: 'Ошибка удаления резервации' });
  }
};

// PUT /api/admin/courts/:id/reservations/:reservationId
exports.updateReservation = async (req, res) => {
  try {
    const { id, reservationId } = req.params;
    const { startDateTime, endDateTime, note, forUserId } = req.body;
    const reservation = await CourtReservation.findOne({ _id: reservationId, courtId: id });
    if (!reservation) return res.status(404).json({ message: 'Резервация не найдена' });
    const nextStart = startDateTime !== undefined ? toDate(startDateTime) : reservation.startDateTime;
    const nextEnd = endDateTime !== undefined ? toDate(endDateTime) : reservation.endDateTime;
    if (nextStart >= nextEnd) return res.status(400).json({ code: 'INVALID_TIME_RANGE', message: 'Временной интервал некорректен' });
    const conflict = await hasReservationConflict(id, nextStart, nextEnd, reservation._id);
    if (conflict.conflict) {
      const msg = 'Конфликт: превышена вместимость площадок';
      return res.status(400).json({ code: 'SCHEDULE_CONFLICT', message: msg });
    }
    reservation.startDateTime = nextStart;
    reservation.endDateTime = nextEnd;
    if (note !== undefined) reservation.note = note;
    if (forUserId !== undefined) reservation.forUserId = forUserId || undefined;
    await reservation.save();
    const populated = await CourtReservation.findById(reservation._id).populate('forUserId', 'name email');
    res.json(populated);
  } catch (e) {
    console.error('Error update reservation:', e);
    res.status(500).json({ message: 'Ошибка обновления резервации' });
  }
};

// DELETE /api/admin/courts/:id - Удалить корт (мягкое удаление)
exports.deleteCourt = async (req, res) => {
  try {
    const court = await Court.findById(req.params.id);
    
    if (!court || court.isDeleted) {
      return res.status(404).json({ message: 'Корт не найден' });
    }
    
    court.isDeleted = true;
    await court.save();
    
    res.json({ message: 'Корт успешно удален' });
  } catch (error) {
    console.error('Error deleting court:', error);
    res.status(500).json({ message: 'Ошибка при удалении корта' });
  }
};

// POST /api/admin/courts/:id/assign-manager - Назначить менеджера корта
exports.assignManager = async (req, res) => {
  try {
    const { managerId } = req.body;
    
    if (!managerId) {
      return res.status(400).json({ message: 'ID менеджера обязателен' });
    }
    
    const court = await Court.findById(req.params.id);
    if (!court || court.isDeleted) {
      return res.status(404).json({ message: 'Корт не найден' });
    }
    
    const manager = await User.findById(managerId);
    if (!manager) {
      return res.status(400).json({ message: 'Пользователь не найден' });
    }
    
    if (!['court_manager', 'court_admin', 'super_admin'].includes(manager.role)) {
      return res.status(400).json({ message: 'Пользователь не может быть менеджером корта' });
    }
    
    court.managerId = managerId;
    await court.save();
    
    const updatedCourt = await Court.findById(court._id)
      .populate('managerId', 'name email');
    
    res.json(updatedCourt);
  } catch (error) {
    console.error('Error assigning manager:', error);
    res.status(500).json({ message: 'Ошибка при назначении менеджера' });
  }
};

// POST /api/admin/courts/:id/assign-owner - Назначить владельца корта
exports.assignOwner = async (req, res) => {
  try {
    const { ownerId } = req.body;
    if (!ownerId) {
      return res.status(400).json({ message: 'ID владельца обязателен' });
    }
    const court = await Court.findById(req.params.id);
    if (!court || court.isDeleted) {
      return res.status(404).json({ message: 'Корт не найден' });
    }
    const owner = await User.findById(ownerId);
    if (!owner) {
      return res.status(400).json({ message: 'Пользователь не найден' });
    }
    if (!['court_owner', 'court_admin', 'super_admin'].includes(owner.role)) {
      return res.status(400).json({ message: 'Пользователь не может быть владельцем корта' });
    }
    court.ownerId = ownerId;
    await court.save();
    const updatedCourt = await Court.findById(court._id)
      .populate('managerId ownerId', 'name email');
    res.json(updatedCourt);
  } catch (error) {
    console.error('Error assigning owner:', error);
    res.status(500).json({ message: 'Ошибка при назначении владельца' });
  }
};

// GET /api/admin/courts/:id/stats - Получить статистику корта
exports.getCourtStats = async (req, res) => {
  try {
    const court = await Court.findById(req.params.id);
    
    if (!court || court.isDeleted) {
      return res.status(404).json({ message: 'Корт не найден' });
    }
    
    // Здесь можно добавить логику для получения статистики
    // Например, количество матчей, популярность и т.д.
    
    const stats = {
      courtId: court._id,
      name: court.name,
      status: court.status,
      isPaid: court.isPaid,
      manager: court.managerId ? await User.findById(court.managerId).select('name email') : null,
      // Дополнительная статистика будет добавлена позже
    };
    
    res.json(stats);
  } catch (error) {
    console.error('Error getting court stats:', error);
    res.status(500).json({ message: 'Ошибка при получении статистики корта' });
  }
}; 