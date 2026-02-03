# 🏡 TinyHome-Oakland: Site Selection Tool

This is a geospatial decision support web app for identifying optimal locations to place Tiny Homes for unhoused populations in Oakland, California.

It allows users to assign priorities to different urban planning criteria using the Analytical Hierarchy Process (AHP), visualize the ranked locations on a map, and optionally submit their preferences for research purposes.

---
## Website Deployed
Check out our website below and try it out!
https://tinyhomeproject.netlify.app/

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
cd tinyhomeproject
```

### 2. Backend (Flask) — Terminal 1

Activate the virtual environment from the repo root, then run the backend:

```bash
# Windows
venv\Scripts\activate

# macOS/Linux
# source venv/bin/activate
```

If you don't have a `venv/` folder yet, create one first:

```bash
python -m venv venv
venv\Scripts\activate
```

Then install dependencies and start the server:

```bash
cd backend
pip install -r requirements.txt
python app.py
```

The backend runs on `http://localhost:10000`.

> You also need a `backend/.env` file with your AWS credentials:
> ```ini
> AWS_ACCESS_KEY_ID=your-access-key
> AWS_SECRET_ACCESS_KEY=your-secret-key
> AWS_REGION=us-west-1
> DYNAMODB_TABLE=TinyHomeSubmissions
> ```

### 3. Frontend (React) — Terminal 2

```bash
cd frontend
npm install
npm run dev
```

The frontend runs on `http://localhost:5173`. Open that URL in your browser.

> **How it works:** `npm run dev` loads `frontend/.env.local` which points API calls to `http://localhost:10000` (local backend). Production builds (`npm run build`) load `frontend/.env.production` which points to the deployed Render backend. No code changes needed to switch.

---


## 👩‍🔬 Research Use

Submissions are collected to support research by the Kalyan Lab at the University of British Columbia (UBC) in partnership with Neighborship, a nonprofit focused on housing justice.

