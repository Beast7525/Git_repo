# Backend-Frontend-Database Setup Guide

## ✅ What I've Created For You

### Backend Setup
1. **User Model** (`backend/models/User.js`) - MongoDB schema with:
   - `username` (unique, required)
   - `gmail` (unique, required, validated)
   - `password` (hashed with bcryptjs, never returned in responses)
   - Timestamps (createdAt, updatedAt)

2. **Auth Routes** (`backend/routes/auth.js`) - Two endpoints:
   - `POST /api/auth/signup` - Register new user
   - `POST /api/auth/login` - Login existing user

3. **Updated Server** (`backend/server.js`) - Now includes:
   - MongoDB connection
   - CORS enabled
   - Auth routes mounted

### Frontend Changes
- **Login.jsx** - Updated to call backend API instead of Firebase
- Removed Firebase authentication
- Now sends requests to `http://localhost:5000/api/auth`
- Stores username and userId in localStorage after login/signup

---

## 🚀 Getting Started

### Step 1: Fix MongoDB Connection
Your `.env` file needs the actual MongoDB password:

**File:** `backend/.env`
```
PORT=5000
MONGO_URI=mongodb+srv://24uca243_db_user:YOUR_PASSWORD_HERE@gitrepo.5xfwb7f.mongodb.net/?appName=Gitrepo
MAIL_USER=gitrepo02@gmail.com
MAIL_PASSWORD=YOUR_GMAIL_APP_PASSWORD
```

Replace `YOUR_PASSWORD_HERE` with your actual MongoDB Atlas password.
Set `MAIL_PASSWORD` to a Google app password for `gitrepo02@gmail.com`; do not use the regular Gmail password. The forgot-password flow checks the email, sends a 6-digit OTP, verifies it for 10 minutes, and then stores the new password hashed in MongoDB.

### Step 2: Start Backend Server
```bash
cd d:\main\backend
node server.js
```

You should see:
```
Server running on port 5000
MongoDB Atlas connected
```

### Step 3: Start Frontend (in a new terminal)
```bash
cd d:\main\frontend
npm run dev
```

---

## 📡 API Endpoints

### Sign Up
**POST** `http://localhost:5000/api/auth/signup`

Request body:
```json
{
  "username": "john_doe",
  "gmail": "john@example.com",
  "password": "password123",
  "confirmPassword": "password123"
}
```

Response (201 Created):
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "user_id_here",
    "username": "john_doe",
    "gmail": "john@example.com"
  }
}
```

### Login
**POST** `http://localhost:5000/api/auth/login`

Request body:
```json
{
  "gmail": "john@example.com",
  "password": "password123"
}
```

Response (200 OK):
```json
{
  "message": "Login successful",
  "user": {
    "id": "user_id_here",
    "username": "john_doe",
    "gmail": "john@example.com"
  }
}
```

---

## 🔍 Testing in Postman/Thunder Client

1. Test signup:
   - Method: POST
   - URL: `http://localhost:5000/api/auth/signup`
   - Body (JSON): Add test credentials

2. Test login:
   - Method: POST
   - URL: `http://localhost:5000/api/auth/login`
   - Body (JSON): Use email and password from signup

---

## ⚠️ Important Notes

- **Passwords are hashed** with bcryptjs (10 rounds salt)
- **Username and Email are unique** - duplicates will be rejected
- **CORS is enabled** - frontend can call backend
- **Password validation** - minimum 6 characters
- **Error messages** are descriptive for debugging

---

## 📁 Project Structure
```
backend/
├── models/
│   └── User.js           (User schema)
├── routes/
│   └── auth.js           (Auth endpoints)
├── server.js             (Main server file)
├── .env                  (MongoDB credentials)
└── package.json          (Added bcryptjs)

frontend/
├── src/
│   └── Pages/
│       └── Login.jsx     (Updated to use backend)
└── package.json          (No changes needed)
```

---

## 🔗 Frontend Integration Complete

The Login.jsx component now:
- Calls `/api/auth/signup` for registration
- Calls `/api/auth/login` for login
- Stores user data in localStorage
- Shows error messages from backend
- Redirects to `/User` on success

---

## 🆘 Troubleshooting

**Backend won't connect to MongoDB:**
- Check `.env` file has correct password
- Verify MongoDB Atlas cluster is active
- Confirm whitelist IP in MongoDB Atlas

**Frontend can't connect to backend:**
- Make sure backend is running on port 5000
- Check CORS is enabled in server.js
- Verify API_URL in Login.jsx is correct

**Duplicate key error:**
- MongoDB prevents duplicate usernames/emails
- Use a new email or username for testing

