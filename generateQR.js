/*// generateQR.js

const generatePromptPayQRCode = require('./promptpay'); // นำเข้าโมดูล promptpay.js ที่สร้าง Payload
const QRCode = require('qrcode'); // นำเข้าไลบรารีสำหรับสร้าง QR Code

// ตั้งค่าหมายเลขโทรศัพท์ และจำนวนเงิน
const phoneNumber = '0655023702'; // หมายเลขโทรศัพท์ของผู้รับเงิน (หมายเลขพร้อมเพย์)
const amount = 100.00; // จำนวนเงินที่ต้องการ (หน่วย: บาท)

// สร้าง Payload สำหรับพร้อมเพย์
const payload = generatePromptPayQRCode(phoneNumber, amount);

// สร้าง QR Code จาก Payload และแสดงผลในรูปแบบ URL ของ Base64
QRCode.toDataURL(payload, function (err, url) {
  if (err) throw err;
  console.log('Payload:', payload); // แสดง Payload ที่สร้างขึ้น
  console.log(url); // URL ของ QR Code ในรูปแบบ Base64 (สามารถใช้แสดงในหน้าเว็บได้)
});*/
