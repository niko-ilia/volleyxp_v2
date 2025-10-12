// Скрипт getCourtAvailability.js
// Получает информацию о доступности кортов из внешней системы limassolsport.com.
// Особенности:
// - Сначала делает GET-запрос для получения свежих cookies.
// - Затем делает POST-запрос к admin-ajax.php с параметрами бронирования.
// - Использует данные из формы бронирования для получения доступности.
// - Возвращает JSON-ответ от внешней системы.
// Usage: node backend/scripts/getCourtAvailability.js

const https = require('https');
const querystring = require('querystring');
const zlib = require('zlib');

// Функция для извлечения cookies из Set-Cookie заголовков
function extractCookies(setCookieHeaders) {
  if (!setCookieHeaders) return '';
  const cookies = Array.isArray(setCookieHeaders) ? setCookieHeaders : [setCookieHeaders];
  return cookies.map(cookie => cookie.split(';')[0]).join('; ');
}

// Функция для GET-запроса к странице бронирования
function getFreshCookies() {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'limassolsport.com',
      port: 443,
      path: '/limassol-municipality-beach-court-reservation-page-copy',
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
        'Accept-Language': 'ru,ru-RU;q=0.9,en-US;q=0.8,en;q=0.7'
      }
    };

    console.log('Получаем свежие cookies...');
    
    const req = https.request(options, (res) => {
      console.log(`GET статус: ${res.statusCode}`);
      
      let data = '';
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        const cookies = extractCookies(res.headers['set-cookie']);
        console.log('Полученные cookies:', cookies);
        resolve(cookies);
      });
    });

    req.on('error', (e) => {
      console.error('Ошибка GET-запроса:', e.message);
      reject(e);
    });

    req.end();
  });
}

// Параметры запроса из скриншотов
const requestData = {
  params: 'customer%5Bfirst_name%5D=ilia&customer%5Blast_name%5D=niko&customer%5Bphone%5D=%2B35799999999&customer%5Bemail%5D=k%40h.com&customer%5Bnotes%5D=&restrictions%5Bshow_locations%5D=&restrictions%5Bshow_agents%5D=&restrictions%5Bshow_services%5D=&restrictions%5Bshow_service_categories%5D=&restrictions%5Bcalendar_start_date%5D=&presets%5Bselected_bundle%5D=&presets%5Bselected_service%5D=2&presets%5Bselected_service_category%5D=&presets%5Bselected_duration%5D=&presets%5Bselected_total_attendees%5D=&presets%5Bselected_location%5D=&presets%5Bselected_agent%5D=&presets%5Bselected_start_date%5D=&presets%5Bselected_start_time%5D=&presets%5Bsource_id%5D=&presets%5Border_item_id%5D=&current_step_code=customer&step_direction=next&active_cart_item%5Bid%5D=&active_cart_item%5Bvariant%5D=booking&active_cart_item%5Bitem_data%5D=%7B%22id%22%3Anull%2C%22customer_id%22%3A%221261%22%2C%22agent_id%22%3Anull%2C%22location_id%22%3A%221%22%2C%22service_id%22%3A%222%22%2C%22recurrence_id%22%3Anull%2C%22start_date%22%3Anull%2C%22start_time%22%3Anull%2C%22end_date%22%3Anull%2C%22end_time%22%3A60%2C%22status%22%3Anull%2C%22buffer_before%22%3A%220%22%2C%22buffer_after%22%3A%220%22%2C%22duration%22%3A%2260%22%2C%22generate_recurrent_sequence%22%3A%5B%5D%2C%22total_attendees%22%3A%222%22%7D&timezone_name=Asia%2FNicosia',
  action: 'latepoint_route_call',
  route_name: 'steps_load_step',
  layout: 'none',
  return_format: 'json'
};

// Основная функция
async function getCourtAvailability() {
  try {
    // Получаем свежие cookies
    const freshCookies = await getFreshCookies();
    
    const postData = querystring.stringify(requestData);

    const options = {
      hostname: 'limassolsport.com',
      port: 443,
      path: '/wp-admin/admin-ajax.php?t=' + Date.now(),
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
        'Content-Length': Buffer.byteLength(postData),
        'Accept': 'application/json, text/javascript, */*; q=0.01',
        'Accept-Language': 'ru,ru-RU;q=0.9,en-US;q=0.8,en;q=0.7',
        'Origin': 'https://limassolsport.com',
        'Referer': 'https://limassolsport.com/limassol-municipality-beach-court-reservation-page-copy',
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/134.0.0.0 Safari/537.36',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': 'latepoint_cart_a6987aa5dbd5ebfc2783f29ea0b86ddb=fccc295b-4a62-48c3-b5f0-320ecbf98617; latepoint_selected_timezone_a6987aa5dbd5ebfc2783f29ea0b86ddb=Asia%2FNicosia; latepoint_customer_logged_in_a6987aa5dbd5ebfc2783f29ea0b86ddb=1177%7C%7C1751978836%7C%7C37d622803726847423abb31bb355e1ed97989d13cef86a2edee8cc3c6fa473a5',
        'Sec-Fetch-Dest': 'empty',
        'Sec-Fetch-Mode': 'cors',
        'Sec-Fetch-Site': 'same-origin'
      }
    };

    console.log('\nОтправляем POST-запрос к limassolsport.com...');
    console.log('URL:', `https://${options.hostname}${options.path}`);
    console.log('Headers:', options.headers);

    const req = https.request(options, (res) => {
      console.log(`POST статус: ${res.statusCode}`);
      console.log('Response Headers:', res.headers);
      
      let data = '';
      
      res.on('data', (chunk) => {
        data += chunk;
      });
      
      res.on('end', () => {
        console.log('\n=== ОТВЕТ ОТ СЕРВЕРА ===');
        try {
          const jsonData = JSON.parse(data);
          console.log('JSON Response:', JSON.stringify(jsonData, null, 2));
        } catch (e) {
          console.log('Raw Response:', data);
        }
      });
    });

    req.on('error', (e) => {
      console.error('Ошибка POST-запроса:', e.message);
    });

    req.write(postData);
    req.end();
    
  } catch (error) {
    console.error('Ошибка:', error.message);
  }
}

// Запускаем
getCourtAvailability(); 