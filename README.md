# 🏡 TinyHome-Oakland: Site Selection Tool

This is a geospatial decision support web app for identifying optimal locations to place Tiny Homes for unhoused populations in Oakland, California.

It allows users to assign priorities to different urban planning criteria using the Analytical Hierarchy Process (AHP), visualize the ranked locations on a map, and optionally submit their preferences for research purposes.

---

## 🔧 Tech Stack

- **Frontend**: React (TypeScript), Leaflet, TailwindCSS
- **Backend**: Flask (Python)
- **Cloud**: Render (for hosting), AWS DynamoDB (for storing submissions)

---

## 📦 Project Evolution

This tool was originally built using **Streamlit** for rapid prototyping and has since been upgraded to a **Flask + React** full-stack architecture for better performance, flexibility, and deployment scalability.

---

## 🚀 Local Setup

### 1. Clone the repo

```bash
git clone https://github.com/your-username/tinyhome-oakland.git
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

## 🗺 Features

- Pairwise comparisons of planning criteria using AHP
- Interactive Leaflet map with top 500 ranked sites
- Personalized user feedback and optional submission to DynamoDB
- Fully deployable on Render and AWS

---

## 👩‍🔬 Research Use

Submissions are collected (anonymously) to support research by the Kalyan Lab at the University of British Columbia (UBC) in partnership with Neighborship, a nonprofit focused on housing justice.

