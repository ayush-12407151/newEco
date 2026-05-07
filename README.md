# ♻️ EcoPickup – Smart Waste Management System

## 📌 Overview

EcoPickup is a full-stack smart waste management platform designed to modernize urban waste collection through digital request tracking, role-based workflow management, and a reward-based engagement system.

It connects **Residents (Clients), Field Workers, and Administrators** into a single system to streamline waste pickup operations efficiently.

---

## 🚀 Features

### 🔐 Authentication & Authorization

* JWT-based authentication
* Password hashing using bcrypt
* Role-based access control (Admin, Worker, User)

### 🗂️ Request Management

* Create waste pickup requests
* Multi-category waste support (Organic, Plastic, Metal, etc.)
* Auto-generated tracking IDs
* Real-time status tracking

### 🧑‍💼 Admin Dashboard

* Approve/Reject requests
* Assign tasks to workers
* Monitor system activity
* Manage users

### 👷 Worker Dashboard

* View assigned tasks
* Update task status (In Progress, Completed)
* Add field notes

### 🎁 Reward System

* Points awarded based on waste type
* Encourages responsible disposal

### 🗺️ Interactive Map

* Built using Leaflet.js
* Live location tracking
* Smart city simulation

---

## 🏗️ Tech Stack

### Backend:

* Node.js
* Express.js
* MongoDB (Mongoose)

### Frontend:

* HTML
* CSS
* Vanilla JavaScript

### Other Tools:

* JWT Authentication
* Bcrypt
* Leaflet.js

---

## ⚙️ Installation & Setup

### 1️⃣ Clone the repository

```bash
git clone https://github.com/shregreat/eco-pickup.git
cd eco-pickup
```

### 2️⃣ Install dependencies

```bash
npm install
cd backend
npm install
```

### 3️⃣ Setup environment variables

Create a `.env` file in the backend folder:

```env
PORT=5001
MONGO_URI=your_mongodb_connection_string
JWT_SECRET=your_secret_key
EMAIL_USER=your_email_id
EMAIL_PASS=your_email_password
```

### 4️⃣ Run the project

```bash
npm start
```

---

## 🔄 Workflow

```
Submitted → Approved → Assigned → In Progress → Completed
```

Each stage is validated to ensure proper flow and prevent invalid transitions.

---

## 👥 User Roles

### 👤 User (Resident)

* Submit pickup requests
* Track request status
* Earn reward points

### 🧑‍🔧 Worker

* View assigned tasks
* Update job status
* Add notes

### 🧑‍💼 Admin

* Manage users
* Approve requests
* Assign workers
* Monitor system

---

## 📊 Key Highlights

* ✅ Full workflow management system
* ✅ Role-based dashboards
* ✅ Reward-based engagement
* ✅ Audit trail with status history
* ✅ Interactive map integration

---

## 🔮 Future Scope

* Real-time notifications
* Mobile application
* Payment integration
* IoT-based smart bins
* Route optimization


## 🌐 Live Project

🔗 Deployed Link: https://waste-managmen-lpu.vercel.app/

---

## 👨‍💻 Team

* Ayush Ranjan
* Ayush Tripathi
* Srayansh Singh Verma

---


