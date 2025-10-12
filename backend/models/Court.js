const mongoose = require('mongoose');

const courtSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    trim: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  location: {
    type: {
      type: String,
      enum: ['Point'],
      default: 'Point'
    },
    coordinates: {
      type: [Number], // [longitude, latitude]
      required: true
    }
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'maintenance'],
    default: 'active'
  },
  courtsCount: { // количество площадок/коробок на локации
    type: Number,
    min: 1,
    default: 1
  },
  isPaid: {
    type: Boolean,
    default: false
  },
  price: {
    type: Number,
    min: 0
  },
  // Новые поля цен в EUR
  pricesEUR: {
    oneHour: { type: Number, min: 0 },
    twoHours: { type: Number, min: 0 }
  },
  workingHours: {
    monday: { open: String, close: String }, // "09:00", "22:00"
    tuesday: { open: String, close: String },
    wednesday: { open: String, close: String },
    thursday: { open: String, close: String },
    friday: { open: String, close: String },
    saturday: { open: String, close: String },
    sunday: { open: String, close: String }
  },
  amenities: [String], // ["parking", "shower", "equipment", "cafe"]
  photos: [String], // URLs фотографий корта
  ownerId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  managerId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User'
  },
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  updatedAt: { 
    type: Date, 
    default: Date.now 
  },
  isDeleted: { 
    type: Boolean, 
    default: false 
  }
});

// Индексы для оптимизации
courtSchema.index({ status: 1 });
courtSchema.index({ managerId: 1 });
courtSchema.index({ ownerId: 1 });
courtSchema.index({ location: '2dsphere' }); // Геопространственный индекс
courtSchema.index({ name: 'text', description: 'text' }); // Текстовый поиск
courtSchema.index({ createdAt: -1 });
courtSchema.index({ isDeleted: 1 });
  courtSchema.index({ 'pricesEUR.oneHour': 1 });

// Middleware для обновления updatedAt
courtSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

// Виртуальное поле для полного адреса
courtSchema.virtual('fullAddress').get(function() {
  return `${this.address}`;
});

// Метод для проверки доступности корта
courtSchema.methods.isAvailable = function() {
  return this.status === 'active' && !this.isDeleted;
};

// Статический метод для поиска активных кортов
courtSchema.statics.findActive = function() {
  return this.find({ status: 'active', isDeleted: false });
};

// Статический метод для поиска кортов по менеджеру
courtSchema.statics.findByManager = function(managerId) {
  return this.find({ managerId, isDeleted: false });
};

module.exports = mongoose.model('Court', courtSchema); 