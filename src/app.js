const express = require("express");
const cors = require("cors");
const path = require("path");
const cookieParser = require("cookie-parser"); // 1. Add this line
const authRoutes = require("./routes/authRoutes");
const volunteerRoutes = require("./routes/volunteerRoutes");
const workshopRoutes = require("./routes/workshopRoutes");
const IotRoutes = require("./routes/IotRoutes");
const mapRoutes = require("./routes/mapRoutes");
const chatRoutes = require("./routes/chatRoutes");
const weatherRoutes = require("./routes/weatherRoutes");
const incidentReportRoutes = require("./routes/incidentReportRoutes");

const app = express();

// Fix express-rate-limit IPv6 issue
app.set('trust proxy', 1);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} - ${duration}ms`);
  });
  next();
});

const corsOptions = {
  origin: (origin, callback) => {
    if (!origin) {
      callback(null, true);
      return;
    }
    const allowedOrigins = [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://10.0.2.2:5000',
      'http://127.0.0.1:5000'
    ];
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (allowedOrigins.includes(origin) || isLocalhost) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With'],
  credentials: true,
  optionsSuccessStatus: 200,
};

app.use(cors(corsOptions));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(cookieParser()); // 2. Add this line (Must be placed BEFORE authRoutes)
app.use('/uploads', express.static(path.join(__dirname, '..', 'uploads')));

app.use("/api/auth", authRoutes);
app.use("/api/volunteers", volunteerRoutes);
app.use("/api/workshops", workshopRoutes);
app.use("/api/iot", IotRoutes);
app.use("/api/map", mapRoutes);
app.use("/api/chat", chatRoutes);
app.use("/api/weather", weatherRoutes);
app.use("/api/incident-reports", incidentReportRoutes);

// Legacy fallback for ESP32 telemetry
const IotController = require('./controllers/iot/IotController');
app.post('/gps', IotController.receiveTelemetry);

app.get("/", (req, res) => {
  res.send("API is running...");
});

module.exports = app;