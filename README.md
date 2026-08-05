# 🏠 RentMaster – House Rent Calculator & Receipt Management System

RentMaster is a modern house rent calculator and receipt management system built with React, TypeScript, Vite, and Firebase. It allows landlords to generate rent receipts, manage tenants, and search receipts quickly and efficiently.

## ✨ Features

- 🔐 Google Authentication
- 🏠 Tenant management system
- 🧾 Generate rent receipts
- 💰 Automatic rent calculation
- 🔍 Search receipts by flat number
- ☁️ Firebase database integration
- 👤 Guest mode support
- 📱 Fully responsive design
- ⚡ Fast performance with Vite
- 🎨 Modern user interface

---

## 🛠️ Technologies Used

- React
- TypeScript
- Vite
- Firebase Authentication
- Firestore Database
- Tailwind CSS
- React Hooks

---

## 📂 Project Structure

```text
src/
├── components/
├── pages/
├── hooks/
├── services/
├── firebase/
├── types/
├── App.tsx
└── main.tsx
```

## ⚙️ Installation

Clone the repository:

```bash
git clone https://github.com/ruhulamin18/RentMaster.git
```

Go to the project directory:

```bash
cd RentMaster
```

Install dependencies:

```bash
npm install
```

Run the development server:

```bash
npm run dev
```

Build for production:

```bash
npm run build
```

Preview the production build:

```bash
npm run preview
```

---

## 🔥 Firebase Configuration

Create a `.env` file in the root directory and add the following variables:

```env
VITE_FIREBASE_API_KEY=your_api_key

VITE_FIREBASE_AUTH_DOMAIN=your_auth_domain

VITE_FIREBASE_PROJECT_ID=your_project_id

VITE_FIREBASE_STORAGE_BUCKET=your_storage_bucket

VITE_FIREBASE_MESSAGING_SENDER_ID=your_sender_id

VITE_FIREBASE_APP_ID=your_app_id
```

---

## 👨‍💼 User Roles

### Admin

- Login with Google
- Add and manage tenants
- Generate rent receipts
- Save receipts to Firebase
- View all receipts

### Guest

- Search receipts using flat number
- View receipt details

---

## 🔍 Receipt Search Flow

```text
Admin → Generate Receipt → Save to Firebase

Guest → Enter Flat Number → Search Firebase → View Receipt
```

---

## 🌟 Future Improvements

- PDF download support
- Monthly analytics dashboard
- SMS notification
- Receipt sharing
- PIN-based tenant verification
- Advanced filtering

---

## 🤝 Contributing

Contributions, issues, and feature requests are welcome.

Feel free to fork this repository and submit a pull request.

---

## 📧 Contact

**Md. Ruhul Amin**

- GitHub: https://github.com/ruhulamin18

---

## 📄 License

This project is licensed under the MIT License.

---

⭐ If you like this project, don't forget to give it a star.
