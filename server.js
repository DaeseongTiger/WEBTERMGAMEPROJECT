const express = require('express');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const cors = require('cors');
const path = require('path');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const dotenv = require('dotenv');
const QRCode = require('qrcode');
const generatePayload = require('promptpay-qr');
const bodyParser = require('body-parser');
const _ = require('lodash');
const multer = require('multer');

dotenv.config();
const app = express();
const PORT = process.env.PORT || 3333;

// ตั้งค่า Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// การตั้งค่าฐานข้อมูล MySQL
const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'pum_database',
};

// ฟังก์ชันสำหรับเชื่อมต่อฐานข้อมูล
async function connectDatabase() {
    try {
        const connection = await mysql.createConnection(dbConfig);
        console.log('Database connected');
        return connection;
    } catch (error) {
        console.error('Database connection failed:', error);
        throw error;
    }
}

// ตั้งค่า multer สำหรับการอัปโหลดรูปภาพ
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, 'uploads/');
    },
    filename: (req, file, cb) => {
        cb(null, Date.now() + '-' + file.originalname);
    }
});
const upload = multer({ storage: storage });

app.post('/upload', upload.single('image'), (req, res) => {
    const userId = req.body.user_id;

    if (!userId) {
        return res.status(400).json({ status: 'error', message: 'User ID is required' });
    }

    res.json({ status: 'success', message: 'Image uploaded successfully', imageUrl: req.file.path });
});

// เส้นทางเริ่มต้น
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'main.html'));
});

// API สำหรับลงทะเบียนผู้ใช้ใหม่
app.post('/api/register', async (req, res) => {
    const { username, password, email, name, phone } = req.body;

    if (!username || !password || !email || !name || !phone) {
        return res.status(400).json({ status: 'error', message: 'กรุณากรอกข้อมูลให้ครบทุกช่อง' });
    }

    try {
        const hashedPassword = await bcrypt.hash(password, 10);
        const connection = await connectDatabase();
        await connection.execute(
            'INSERT INTO users (username, password, email, name, phone, is_verified) VALUES (?, ?, ?, ?, ?, ?)',
            [username, hashedPassword, email, name, phone, false]
        );
        await connection.end();

        res.json({ status: 'success', message: 'User registered successfully' });
    } catch (error) {
        console.error('Error registering user:', error);
        res.status(500).json({ status: 'error', message: 'Registration failed' });
    }
});

// API สำหรับเข้าสู่ระบบ
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const connection = await connectDatabase();
        const [results] = await connection.execute(
            'SELECT * FROM users WHERE username = ?',
            [username]
        );

        if (results.length === 0) {
            return res.status(401).json({ status: 'error', message: 'Invalid username' });
        }

        const match = await bcrypt.compare(password, results[0].password);
        if (!match) {
            return res.status(401).json({ status: 'error', message: 'Invalid password' });
        } else if (!results[0].is_verified) {
            return res.status(403).json({ status: 'error', message: 'Account not verified' });
        }

        const token = jwt.sign(
            { user_id: results[0].id, username: results[0].username },
            process.env.JWT_SECRET,
            { expiresIn: '1h' }
        );
        
        const userId = results[0].id; // ดึง user_id ของผู้ใช้ที่เข้าสู่ระบบสำเร็จ
        await connection.execute(
            'INSERT INTO login_records (user_id) VALUES (?)',
            [userId]
        );

        await connection.end();

        // ส่ง user_id กลับไปที่ฝั่งไคลเอนต์
        return res.json({
            status: 'success',
            message: 'Login successful',
            token,
            username: results[0].username,
            user_id: userId // เพิ่ม user_id ใน response เพื่อให้ฝั่งไคลเอนต์สามารถบันทึกได้
        });

    } catch (error) {
        console.error('Error logging in:', error);
        res.status(500).json({ status: 'error', message: 'Login failed: Internal server error' });
    }
});


// API สำหรับการร้องขอรีเซ็ตรหัสผ่าน
app.post('/api/request_password_reset', async (req, res) => {
    const { email } = req.body;
    const resetToken = crypto.randomBytes(32).toString('hex');
    const resetTokenExpiration = new Date(Date.now() + 3600000);

    try {
        const connection = await connectDatabase();
        const [results] = await connection.execute(
            'UPDATE users SET reset_token = ?, reset_token_expiration = ? WHERE email = ?',
            [resetToken, resetTokenExpiration, email]
        );
        await connection.end();

        if (results.affectedRows === 0) {
            return res.status(400).json({ status: 'error', message: 'Email not found' });
        }

        res.json({
            status: 'success',
            message: 'Password reset link has been sent to your email',
            resetLink: `http://localhost:${PORT}/reset_password?token=${resetToken}`,
        });
    } catch (error) {
        console.error('Error creating reset token:', error);
        res.status(500).json({ status: 'error', message: 'Failed to create reset token' });
    }
});

// API สำหรับรีเซ็ตรหัสผ่าน
app.post('/api/reset_password', async (req, res) => {
    const { token, newPassword } = req.body;

    try {
        const connection = await connectDatabase();
        const [results] = await connection.execute(
            'SELECT * FROM users WHERE reset_token = ? AND reset_token_expiration > NOW()',
            [token]
        );

        if (results.length === 0) {
            return res.status(400).json({ status: 'error', message: 'Invalid or expired reset token' });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 10);
        await connection.execute(
            'UPDATE users SET password = ?, reset_token = NULL, reset_token_expiration = NULL WHERE reset_token = ?',
            [hashedPassword, token]
        );
        await connection.end();

        res.json({ status: 'success', message: 'Password reset successfully' });
    } catch (error) {
        console.error('Error resetting password:', error);
        res.status(500).json({ status: 'error', message: 'Password reset failed' });
    }
});

// API สำหรับดึงข้อมูลสินค้าตัวอย่าง
app.get('/api/products', async (req, res) => {
    try {
        const connection = await connectDatabase();
        const [rows] = await connection.execute('SELECT id, product_name, price FROM products');
        await connection.end();
        res.json({ status: 'success', data: rows });
    } catch (error) {
        console.error('Error fetching products:', error);
        res.status(500).json({ status: 'error', message: 'Failed to fetch products' });
    }
});

// API สำหรับสร้าง QR Code
app.post('/generateQR', (req, res) => {
    const amount = parseFloat(_.get(req, ["body", "amount"], 0));
    const mobileNumber = '0655023702';
    const payload = generatePayload(mobileNumber, { amount });

    const options = {
        color: {
            dark: '#000',
            light: '#fff'
        }
    };

    QRCode.toDataURL(payload, options, (err, url) => {
        if (err) {
            console.log('Generate QR Code failed:', err);
            return res.status(400).json({
                RespCode: 400,
                RespMessage: 'Error: ' + err.message
            });
        } else {
            return res.status(200).json({
                RespCode: 200,
                RespMessage: 'QR Code Generated Successfully',
                Result: url
            });
        }
    });
});

// API สำหรับบันทึกคำสั่งซื้อ
// API สำหรับบันทึกคำสั่งซื้อ
app.post('/api/confirm_order', async (req, res) => {
    const { user_id, payment_amount } = req.body; // รับแค่ user_id และยอดชำระเงิน

    if (!user_id || !payment_amount) {
        return res.status(400).json({ status: 'error', message: 'Missing user or payment information' });
    }

    try {
        const connection = await connectDatabase();
        
        // ตรวจสอบว่า user_id มีอยู่ในตาราง users
        const [userCheck] = await connection.execute('SELECT * FROM users WHERE id = ?', [user_id]);
        if (userCheck.length === 0) {
            return res.status(400).json({ status: 'error', message: 'User does not exist' });
        }

        await connection.execute(
            'INSERT INTO orders (user_id, payment_amount, payment_status) VALUES (?, ?, ?)',
            [user_id, payment_amount, 0]
        );

        await connection.end();
        res.json({ status: 'success', message: 'Payment recorded successfully' });
    } catch (error) {
        console.error('Error saving payment:', error);
        res.status(500).json({ status: 'error', message: 'Failed to save payment' });
    }
});


app.use('/uploads', express.static('uploads'));

// เริ่มเซิร์ฟเวอร์
app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
});
