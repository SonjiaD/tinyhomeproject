# 🏡 TinyHome-Oakland: Site Selection Tool

This is a geospatial decision support web app for identifying optimal locations to place Tiny Homes for unhoused populations in Oakland, California.

It allows users to assign priorities to different urban planning criteria using the Analytical Hierarchy Process (AHP), visualize the ranked locations on a map, and optionally submit their preferences for research purposes.

---


## 📦 Project Evolution

This tool was originally built using **Streamlit** for rapid prototyping and has since been upgraded to a **Flask + React** full-stack architecture for better performance, flexibility, and deployment scalability.

---

## 🛠 Tech Stack

### Phase 1: Streamlit Prototype
- Built using `Streamlit`, `Folium`, and `Pydeck`
- Served as a rapid MVP for collecting feedback

#### Past Repository:
https://github.com/SonjiaD/tinyhome-backend

### Phase 2: Full-stack Migration
Now rebuilt with a modern architecture:

#### 🖥️ Frontend
- **React + TypeScript**
- **TailwindCSS** for styling
- **Leaflet** for interactive mapping
- **Recharts** for displaying AHP weights

#### ⚙️ Backend
- **Flask** (Python)
- **DynamoDB** (AWS) for storing submissions
- **Boto3** for AWS interactions
- **CORS + .env** for secure deployment

#### ☁️ Deployment
- **Frontend:** [Netlify](https://www.netlify.com/)
- **Backend:** [Render](https://render.com/)
- **Database:** AWS DynamoDB (`TinyHomeSubmissions` table)

---

## 🧪 Features

✅ Interactive AHP weight assignment  
✅ Realtime ranked site map using GeoJSON data  
✅ Bar chart of feature priorities  
✅ Save your personalized map + feedback to a database  
✅ View saved submissions (coming soon: Gallery tab)  

---


## 🚀 Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/SonjiaD/tinyhomeproject
cd tinyhome-oakland
```

---

## 2. Backend Setup (Flask)

```bash
cd backend
python -m venv venv
venv\Scripts\activate      # On Windows
# source venv/bin/activate   # On macOS/Linux

pip install -r requirements.txt
```

Create a `.env` file in the `backend/` directory:

```ini
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
DYNAMODB_TABLE_NAME=TinyHomeSubmissions
REGION_NAME=us-west-1
```

Then start the Flask server:

```bash
python app.py
```

---

## 3. Frontend Setup (React)

```bash
cd frontend
npm install
npm run dev
```

Then open `http://localhost:5173` in your browser.

---


## 👩‍🔬 Research Use

Submissions are collected to support research by the Kalyan Lab at the University of British Columbia (UBC) in partnership with Neighborship, a nonprofit focused on housing justice.

